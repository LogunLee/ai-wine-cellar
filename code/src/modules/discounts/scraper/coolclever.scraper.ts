import { Injectable } from '@nestjs/common'
import { chromium, Browser, Page, Route, BrowserContext } from 'playwright'
import { Store } from '@prisma/client'
import { BaseScraper, RawScrapedOffer, ScraperResult, ScraperCallbacks, ScraperCheckpointCallbacks } from './base-scraper'
import { createStealthBrowser, humanScroll, randomDelay } from './stealth-browser'

@Injectable()
export class CoolCleverScraper extends BaseScraper {
  storeCode = 'coolclever'
  private got429 = false
  private got403 = false
  private requestQueue: Route[] = []
  private processingQueue = false
  private minRequestInterval = 500

  private async queueRequest(route: Route) {
    this.requestQueue.push(route)
    if (!this.processingQueue) {
      this.processingQueue = true
      await this.processQueue()
    }
  }

  private async processQueue() {
    while (this.requestQueue.length > 0) {
      const route = this.requestQueue.shift()!

      try {
        await route.continue()
      } catch {
        try {
          await route.abort()
        } catch {}
      }

      if (this.requestQueue.length > 0) {
        await new Promise(r => setTimeout(r, this.minRequestInterval))
      }
    }

    this.processingQueue = false
  }

  async scrape(
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<ScraperResult> {
    const baseUrl = store.baseUrl || 'https://www.coolclever.ru'
    const offers: RawScrapedOffer[] = []
    let browser: Browser | null = null
    let context: BrowserContext | null = null
    let page: Page | null = null
    let opsCount = 0

    try {
      const { browser: stealthBrowser, contextOptions } = await createStealthBrowser()
      browser = stealthBrowser
      context = await browser.newContext(contextOptions)

      const setupPage = async (): Promise<Page> => {
        if (page) await page.close()

        this.requestQueue = []
        this.processingQueue = false

        page = await context!.newPage()
        opsCount = 0

        await page.route('**/*', async route => {
          const url = route.request().url()
          const resourceType = route.request().resourceType()

          if (['image', 'font', 'stylesheet'].includes(resourceType)) {
            await route.abort()
            return
          }

          if (url.includes('/api/log-')) {
            await route.abort()
            return
          }

          await this.queueRequest(route)
        })

        page.on('response', async response => {
          if (response.status() === 429) {
            this.got429 = true
            this.logger.warn(`Got 429 from ${response.url()}`)
          }

          if (response.status() === 403) {
            this.got403 = true
            this.logger.warn(`Got 403 from ${response.url()}`)
          }
        })

        return page
      }

      page = await setupPage()
      await this.handleInitialPopups(page)

      const scrapeCategory = async (path: string, label: string, categoryKey: string) => {
        const maxPages = process.env.SCRAPER_MAX_PAGES
          ? parseInt(process.env.SCRAPER_MAX_PAGES, 10)
          : null

        let pageNum = 1
        checkpointCallbacks?.startHeartbeat(categoryKey)

        while (true) {
          if (maxPages && pageNum > maxPages) {
            this.logger.log(`Reached max pages limit (${maxPages}), stopping ${label}`)
            break
          }

          opsCount++

          if (opsCount >= this.PAGE_RECREATE_INTERVAL) {
            this.logger.log(`Recreating page after ${opsCount} ops (${label} page ${pageNum})`)
            await setupPage()
          }

          const url = pageNum === 1
            ? `${baseUrl}${path}`
            : `${baseUrl}${path}?page=${pageNum}`

          const pageLoaded = await this.loadPageWithRetry(page!, url)

          if (!pageLoaded) {
            this.logger.error(`Failed to load page ${pageNum} after retries`)
            break
          }

          await this.waitForPageReady(page!)

          const pageOffers = await this.extractProducts(page!, label === 'Sparkling wines')

          if (pageOffers.length === 0) {
            this.logger.log(`No products on ${label} page ${pageNum}, stopping`)
            break
          }

          offers.push(...pageOffers)
          this.logger.log(`${label} page ${pageNum}: ${pageOffers.length} offers, total: ${offers.length}`)

          if (callbacks && pageOffers.length > 0) {
            const result = await callbacks.saveAndNormalize(pageOffers, store.id, jobId)
            this.logger.log(
              `Page ${pageNum} batch normalized: created=${result.created}, updated=${result.updated}, normalized=${result.normalized}`,
            )
          }

          await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, url, offers.length)

          pageNum++

          this.logger.log('Waiting with jitter...')
          await randomDelay(page!, 6000, 2000)
        }

        checkpointCallbacks?.stopHeartbeat(categoryKey)
        await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, null, offers.length)
      }

      await scrapeCategory('/catalog/otdokhni/vino', 'Still wines', 'still')
      await scrapeCategory('/catalog/otdokhni/shampanskoe-igristoe', 'Sparkling wines', 'sparkling')

      this.logger.log(`Total offers collected: ${offers.length}`)
    } catch (error) {
      this.logger.error(`Scraping error: ${error}`)
      throw error
    } finally {
      if (browser) await browser.close()
    }

    return { offers }
  }

  private async loadPageWithRetry(
    page: Page,
    url: string,
    attempt: number = 1,
    maxAttempts: number = 10,
  ): Promise<boolean> {
    if (attempt > maxAttempts) return false

    this.got429 = false
    this.got403 = false

    this.logger.log(`Loading ${url} (attempt ${attempt})`)

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    } catch (e) {
      this.logger.warn(`Navigation error: ${e}`)
    }

    if (this.got429 || this.got403) {
      const statusCode = this.got403 ? 403 : 429
      const backoff = 30000 * Math.pow(2, Math.min(attempt - 1, 3))

      this.logger.warn(`Got ${statusCode} on ${url}, waiting ${backoff / 1000}s (attempt ${attempt})`)

      await page.waitForTimeout(backoff)
      return this.loadPageWithRetry(page, url, attempt + 1, maxAttempts)
    }

    this.logger.log('Page loaded, waiting for resources')
    await randomDelay(page, 3000, 1000)

    if (this.got429 || this.got403) {
      const statusCode = this.got403 ? 403 : 429
      const backoff = 30000 * Math.pow(2, Math.min(attempt - 1, 3))

      this.logger.warn(`Got ${statusCode} during page load, waiting ${backoff / 1000}s`)

      await page.waitForTimeout(backoff)
      return this.loadPageWithRetry(page, url, attempt + 1, maxAttempts)
    }

    return true
  }

  private async waitForPageReady(page: Page): Promise<void> {
    this.got429 = false
    this.got403 = false

    this.logger.log('Scrolling to bottom')

    await humanScroll(page, 5)
    await randomDelay(page, 1500, 500)

    if (this.got429 || this.got403) {
      this.logger.warn('Got 429/403 during scroll, waiting and retrying')

      await randomDelay(page, 30000)

      await humanScroll(page, 5)
      await randomDelay(page, 1500, 500)
    }

    await page.evaluate(async () => {
      window.scrollTo(0, 0)
    })

    await page.waitForTimeout(1000)
  }

  private async handleInitialPopups(page: Page): Promise<void> {
    try {
      await page.goto('https://www.coolclever.ru', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })

      await page.waitForTimeout(1500 + Math.random() * 1000)

      const ageBtn = await page.$('button:has-text("Мне есть 18 лет")')

      if (ageBtn) {
        await ageBtn.click()
        await page.waitForTimeout(1000)
      }

      const closeBtn = await page.$('button:has-text("Понятно")')

      if (closeBtn) {
        await closeBtn.click()
        await page.waitForTimeout(1000)
      }
    } catch (error) {
      this.logger.warn(`Failed to handle popups: ${error}`)
    }
  }

  private async extractProducts(page: Page, sparkling: boolean = false): Promise<RawScrapedOffer[]> {
    const result = await page.evaluate((sparkling) => {
      const cards = document.querySelectorAll('[class*="ProductCard_card"]')
      const seen = new Set<string>()
      const results: RawScrapedOffer[] = []
      let withPrice = 0
      let withoutPrice = 0

      cards.forEach(card => {
        const nameLink = card.querySelector('a[class*="ProductCard_name"]')

        if (!nameLink) return

        const href = nameLink.getAttribute('href')

        if (!href) return

        const title = nameLink.textContent?.trim() || ''

        if (title.length < 10 || title.length > 300) return
        if (seen.has(title)) return

        seen.add(title)

        const imgEl = card.querySelector('img')
        const imgUrl = imgEl ? imgEl.getAttribute('src') : null
        const fullText = (card.textContent || '').replace(/\s/g, '').toLowerCase()
        const priceRegex = /(\d{5,})р/g

        let match
        const foundPrices: number[] = []

        while ((match = priceRegex.exec(fullText)) !== null) {
          const num = parseInt(match[1], 10)
          const price = Math.round(num / 100)

          if (!isNaN(price) && price > 50 && price < 10000000) {
            foundPrices.push(price)
          }
        }

        let currentPrice: number | undefined
        let oldPrice: number | undefined

        if (foundPrices.length === 1) {
          currentPrice = foundPrices[0]
        } else if (foundPrices.length >= 2) {
          const last = foundPrices[foundPrices.length - 1]
          const prev = foundPrices[foundPrices.length - 2]

          currentPrice = Math.min(last, prev)
          oldPrice = Math.max(last, prev)
        }

        if (currentPrice) {
          withPrice++
        } else {
          withoutPrice++
        }

        const text = card.textContent || ''

        const volumeMatch =
          text.match(/(\d+\.\d+),/) ||
          text.match(/(\d+\.?\d*)\s*(л|л\.|L|мл|ml)/i) ||
          text.match(/(\d+\.?\d*)\s*(ж\/?б)/i) ||
          text.match(/\b(0\.75|0\.5|0\.375|0\.25|0\.1875|1\.5|3|5)\b/i)

        let volumeMl: number | undefined = undefined

        if (volumeMatch) {
          const num = parseFloat(volumeMatch[1])
          const unit = (volumeMatch[2] || '').toLowerCase()

          if (unit === 'мл' || unit === 'ml') {
            volumeMl = num
          } else if (num < 10) {
            volumeMl = Math.round(num * 1000)
          } else {
            volumeMl = num
          }
        }

        results.push({
          externalId: href.split('/').pop() || undefined,
          title,
          url: `https://www.coolclever.ru${href}`,
          imageUrl: imgUrl || undefined,
          currentPrice,
          oldPrice,
          rawPayload: {
            title,
            url: href,
            fullText: text.substring(0, 500),
            wineType: sparkling ? 'SPARKLING' : undefined,
            volumeMl,
          },
        })
      })

      return { offers: results, withPrice, withoutPrice }
    }, sparkling)

    this.logger.log(
      `Extracted: ${result.offers.length} offers, withPrice: ${result.withPrice}, withoutPrice: ${result.withoutPrice}`,
    )

    return result.offers
  }
}
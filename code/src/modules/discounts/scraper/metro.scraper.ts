import { Injectable } from '@nestjs/common'
import { chromium, Browser, Page, BrowserContext } from 'playwright'
import { Store } from '@prisma/client'
import { BaseScraper, RawScrapedOffer, ScraperResult, ScraperCallbacks, ScraperCheckpointCallbacks } from './base-scraper'
import { createStealthBrowser, humanScroll, randomDelay } from './stealth-browser'

@Injectable()
export class MetroScraper extends BaseScraper {
  storeCode = 'metro'
  private gotHttpError = false

  async scrape(store: Store, jobId: string, callbacks?: ScraperCallbacks, checkpointCallbacks?: ScraperCheckpointCallbacks): Promise<ScraperResult> {
    const baseUrl = store.baseUrl || 'https://online.metro-cc.ru'
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
        page = await context!.newPage()
        opsCount = 0
        page.on('response', async (response) => {
          const status = response.status()
          if (status >= 400 && status < 600 && status !== 404 && response.url().includes('metro-cc.ru')) {
            this.gotHttpError = true
            this.logger.warn(`Got ${status} from ${response.url()}`)
          }
        })
        return page
      }

      page = await setupPage()

      const scrapeCategory = async (path: string, label: string, categoryKey: string) => {
        const maxPages = process.env.SCRAPER_MAX_PAGES ? parseInt(process.env.SCRAPER_MAX_PAGES, 10) : null
        let pageNum = 1
        checkpointCallbacks?.startHeartbeat(categoryKey)

        while (true) {
          if (maxPages && pageNum > maxPages) { this.logger.log(`Reached max pages limit (${maxPages}), stopping ${label}`); break }

          opsCount++
          if (opsCount >= this.PAGE_RECREATE_INTERVAL) {
            this.logger.log(`Recreating page after ${opsCount} ops (${label} page ${pageNum})`)
            await setupPage()
          }

          const url = pageNum === 1 ? `${baseUrl}${path}` : `${baseUrl}${path}?page=${pageNum}`
          const pageLoaded = await this.loadPageWithRetry(page!, url)
          if (!pageLoaded) { this.logger.error(`Failed to load page ${pageNum} after retries`); break }
          await randomDelay(page!, 5000, 3000)
          await humanScroll(page!, 3)
          await randomDelay(page!, 3000, 2000)

          const pageOffers = await this.extractProducts(page!, baseUrl, label === 'Sparkling wines')
          if (pageOffers.length === 0) { this.logger.log(`No products on ${label} page ${pageNum}, stopping`); break }

          offers.push(...pageOffers)
          this.logger.log(`${label} page ${pageNum}: ${pageOffers.length} offers, total: ${offers.length}`)

          if (callbacks && pageOffers.length > 0) {
            const result = await callbacks.saveAndNormalize(pageOffers, store.id, jobId)
            this.logger.log(`Page ${pageNum} batch normalized: created=${result.created}, updated=${result.updated}, normalized=${result.normalized}`)
          }

          await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, url, offers.length)

          pageNum++
          this.logger.log('Waiting with jitter...')
          await randomDelay(page!, 5000)
        }

        checkpointCallbacks?.stopHeartbeat(categoryKey)
        await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, null, offers.length)
      }

      await scrapeCategory('/category/alkogolnaya-produkciya/vino', 'Still wines', 'still')
      await scrapeCategory('/category/alkogolnaya-produkciya/shampanskoe-igristye-vina', 'Sparkling wines', 'sparkling')

      this.logger.log(`Total offers collected: ${offers.length}`)
    } catch (error) {
      this.logger.error(`Scraping error: ${error}`)
      throw error
    } finally {
      if (browser) await browser.close()
    }

    return { offers }
  }

  private async extractProducts(page: Page, baseUrl: string, sparkling: boolean = false): Promise<RawScrapedOffer[]> {
    const result = await page.evaluate(({ base, sparkling }) => {
      const cards = document.querySelectorAll('.catalog-2-level-product-card')
      const seen = new Set<string>()
      const results: RawScrapedOffer[] = []
      let withPrice = 0, withoutPrice = 0, withDiscount = 0
      cards.forEach((card) => {
        const link = card.querySelector('a[href*="/products/"]')
        if (!link) return
        const href = link.getAttribute('href')
        if (!href) return
        if (seen.has(href)) return
        seen.add(href)
        const title = link.getAttribute('title') || ''
        if (title.length < 5 || title.length > 300) return
        const imgEl = card.querySelector('img')
        const imgUrl = imgEl ? imgEl.getAttribute('src') : null
        const priceEl = card.querySelector('.product-unit-prices__actual .product-price__sum-rubles')
        const priceText = priceEl ? priceEl.textContent?.trim() : ''
        const price = priceText ? parseInt(priceText.replace(/\s/g, ''), 10) : undefined
        const oldPriceEl = card.querySelector('.product-unit-prices__old .product-price__sum-rubles')
        const oldPriceText = oldPriceEl ? oldPriceEl.textContent?.trim() : ''
        const oldPrice = oldPriceText ? parseInt(oldPriceText.replace(/\s/g, ''), 10) : undefined
        const sku = card.getAttribute('data-sku') || card.getAttribute('id') || undefined
        const volumeMatch = title.match(/(\d[\d.,]*)\s*л/)
        const volume = volumeMatch ? volumeMatch[1] : undefined
        const colorMatch = title.match(/(красное|белое|розовое|игристое)/i)
        const color = colorMatch ? colorMatch[1].toLowerCase() : undefined
        const sweetnessMatch = title.match(/(сухое|полусухое|полусладкое|сладкое|крепленое)/i)
        const sweetness = sweetnessMatch ? sweetnessMatch[1].toLowerCase() : undefined
        const fullText = card.textContent || ''
        const countryMap: Record<string, string> = { 'испании': 'Испания', 'франции': 'Франция', 'италии': 'Италия', 'германии': 'Германия', 'аргентине': 'Аргентина', 'чили': 'Чили', 'португалии': 'Португалия', 'австрии': 'Австрия', 'австралии': 'Австралия', 'греции': 'Греция', 'грузии': 'Грузия', 'россии': 'Россия', 'новой зеландии': 'Новая Зеландия', 'южной африке': 'Южная Африка', 'сша': 'Соединённые Штаты', 'венгрии': 'Венгрия', 'румынии': 'Румыния', 'болгарии': 'Болгария', 'сербии': 'Сербия', 'хорватии': 'Хорватия', 'словении': 'Словения', 'словакии': 'Словакия', 'молдове': 'Молдова', 'украине': 'Украина', 'абхазии': 'Абхазия', 'юар': 'Южная Африка' }
        let country: string | undefined
        const madeInMatch = fullText.match(/(?:сделано|произведено)\s+в\s+([^\n,.]+)/i)
        if (madeInMatch) { const countryInText = madeInMatch[1].trim().toLowerCase(); for (const [key, value] of Object.entries(countryMap)) { if (countryInText.includes(key)) { country = value; break } } }
        if (price) { withPrice++; if (oldPrice) withDiscount++ } else { withoutPrice++ }
        results.push({ externalId: sku, title, url: href.startsWith('/') ? `${base}${href}` : href, imageUrl: imgUrl || undefined, currentPrice: price, oldPrice, rawPayload: { title, url: href, volume, color, sweetness, country, fullText: fullText.substring(0, 500), wineType: sparkling ? 'SPARKLING' : undefined } })
      })
      return { offers: results, withPrice, withoutPrice, withDiscount }
    }, { base: baseUrl, sparkling })
    this.logger.log(`Extracted: ${result.offers.length} offers, withPrice: ${result.withPrice}, withoutPrice: ${result.withoutPrice}, withDiscount: ${result.withDiscount}`)
    return result.offers
  }

  private async loadPageWithRetry(page: Page, url: string, attempt: number = 1, maxAttempts: number = 5): Promise<boolean> {
    if (attempt > maxAttempts) return false
    this.gotHttpError = false
    this.logger.log(`Loading ${url} (attempt ${attempt})`)
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }) } catch (e) { this.logger.warn(`Navigation error: ${e}`) }
    if (this.gotHttpError) {
      const backoff = 30000 * Math.pow(2, Math.min(attempt - 1, 3))
      this.logger.warn(`Got HTTP error on ${url}, waiting ${backoff / 1000}s (attempt ${attempt})`)
      await page.waitForTimeout(backoff)
      return this.loadPageWithRetry(page, url, attempt + 1, maxAttempts)
    }
    return true
  }
}

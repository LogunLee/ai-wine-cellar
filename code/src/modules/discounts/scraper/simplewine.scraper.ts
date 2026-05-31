import { Injectable } from '@nestjs/common'
import { chromium, Browser, Page, BrowserContext } from 'playwright'
import { Store } from '@prisma/client'
import { BaseScraper, RawScrapedOffer, ScraperResult, ScraperCallbacks, ScraperCheckpointCallbacks } from './base-scraper'
import { createStealthBrowser, randomDelay } from './stealth-browser'

@Injectable()
export class SimpleWineScraper extends BaseScraper {
  storeCode = 'simplewine'
  private gotHttpError = false

  async scrape(store: Store, jobId: string, callbacks?: ScraperCallbacks, checkpointCallbacks?: ScraperCheckpointCallbacks): Promise<ScraperResult> {
    const baseUrl = store.baseUrl || 'https://simplewine.ru'
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
          if (status >= 400 && status < 600 && status !== 404 && response.url().includes('simplewine.ru')) {
            this.gotHttpError = true
            this.logger.warn(`Got ${status} from ${response.url()}`)
          }
        })
        return page
      }

      page = await setupPage()
      this.logger.log('Visiting homepage to establish session')
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await randomDelay(page, 5000, 5000)

      const scrapeCategory = async (category: string, label: string) => {
        this.gotHttpError = false
        await page!.goto(`${baseUrl}/catalog/${category}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await randomDelay(page!, 5000, 5000)

        if (this.gotHttpError) {
          this.logger.warn(`Got HTTP error on ${label} catalog page, waiting`)
          await randomDelay(page!, 30000)
        }

        let pageNum = 1
        let hasMore = true
        const maxPages = process.env.SCRAPER_MAX_PAGES ? parseInt(process.env.SCRAPER_MAX_PAGES, 10) : null

        checkpointCallbacks?.startHeartbeat(category)

        while (hasMore) {
          if (maxPages && pageNum > maxPages) {
            this.logger.log(`Reached max pages limit (${maxPages}), stopping ${label}`)
            hasMore = false
            break
          }

          opsCount++
          if (opsCount >= this.PAGE_RECREATE_INTERVAL) {
            this.logger.log(`Recreating page after ${opsCount} ops (${label} page ${pageNum})`)
            await setupPage()
            await page!.goto(`${baseUrl}/catalog/${category}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await randomDelay(page!, 5000, 5000)
          }

          this.logger.log(`Scraping ${label} page ${pageNum}`)

          const pageOffers = await this.fetchProductsFromApi(page!, pageNum, category)
          if (pageOffers.length === 0) {
            this.logger.log(`No more products on ${label} page ${pageNum}, stopping`)
            hasMore = false
            break
          }

          offers.push(...pageOffers)
          this.logger.log(`${label} page ${pageNum}: ${pageOffers.length} offers, total: ${offers.length}`)

          if (callbacks) {
            const result = await callbacks.saveAndNormalize(pageOffers, store.id, jobId)
            this.logger.log(`Batch normalized: created=${result.created}, updated=${result.updated}, normalized=${result.normalized}`)
          }

          await checkpointCallbacks?.saveCheckpoint(category, pageNum, `${baseUrl}/catalog/${category}/`, offers.length)

          pageNum++

          if (hasMore) {
            this.logger.log('Waiting with jitter...')
            await randomDelay(page!, 5000)
          }
        }

        checkpointCallbacks?.stopHeartbeat(category)
        await checkpointCallbacks?.saveCheckpoint(category, pageNum, null, offers.length)
      }

      await scrapeCategory('vino', 'Still wines')
      await scrapeCategory('shampanskoe_i_igristoe_vino', 'Sparkling wines')

      this.logger.log(`Total offers collected: ${offers.length}`)
    } catch (error) {
      this.logger.error(`Scraping error: ${error}`)
      throw error
    } finally {
      if (browser) await browser.close()
    }

    return { offers }
  }

  private async fetchProductsFromApi(page: Page, pageNum: number, category: string = 'vino', attempt: number = 1): Promise<RawScrapedOffer[]> {
    this.gotHttpError = false
    const isSparkling = category !== 'vino'

    const result = await page.evaluate(async ({ pageNum, category }) => {
      const url = `https://simplewine.ru/platform/api/v1/catalog/${category}?pageNumber=${pageNum}&pageSize=33&sort=our_choice&withMeta=1&filter[sale]=1`
      try {
        const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } })
        if (response.status >= 400 && response.status < 600 && response.status !== 404) return { error: `HTTP ${response.status}`, status: response.status, items: [] }
        const data = await response.json()
        return { error: null, items: data?.data?.items || [] }
      } catch (e: any) {
        return { error: e.message, items: [] }
      }
    }, { pageNum, category })

    if (result.error && result.status && result.status >= 400 && result.status < 600 && result.status !== 404) {
      this.gotHttpError = true
      const backoff = 30000 * Math.pow(2, Math.min(attempt - 1, 3))
      this.logger.warn(`Got ${result.error} from API on page ${pageNum}, waiting ${backoff / 1000}s`)
      await page.waitForTimeout(backoff)
      if (attempt < 5) return this.fetchProductsFromApi(page, pageNum, category, attempt + 1)
      return []
    }

    if (result.error) {
      this.logger.warn(`API error on page ${pageNum}: ${result.error}`)
      return []
    }

    const offers: RawScrapedOffer[] = []
    for (const item of result.items) {
      const title = item.title || ''
      if (title.length < 5) continue

      const props: Record<string, any> = {}
      for (const p of (item.properties || [])) props[p.code] = p.value

      const country = props.country?.value || null
      const color = props.color?.value || null
      const sugarType = props.sugarType?.value || null
      const year = props.year || null
      const volume = props.netVolume || null
      const region = props.region?.value || null
      const manufacturer = props.manufacturer?.translate || props.manufacturer?.value || null
      const grapes = (props.grapeContent || []).map((g: any) => g.grape).filter(Boolean)

      const wineTypeMap: Record<string, string> = { 'красное': 'RED', 'белое': 'WHITE', 'розовое': 'ROSE' }
      const wineType = isSparkling ? 'SPARKLING' : (color ? wineTypeMap[color.toLowerCase()] || 'OTHER' : 'OTHER')

      const basePrice = item.price?.base?.price
      const piecePrice = item.price?.piece?.price
      const discountValue = item.price?.discount?.discountValue
      const discountType = item.price?.discount?.discountType

      let oldPrice: number | undefined = basePrice
      let currentPrice: number | undefined = piecePrice
      if (discountValue && discountType === 'PERCENT' && currentPrice) {
        oldPrice = Math.round(currentPrice / (1 - discountValue / 100))
      }

      const imagePreview = item.media?.imagePreview
      const imageUrl = imagePreview ? `https://simplewine.ru${imagePreview}` : undefined

      offers.push({
        externalId: item.id?.toString(),
        title,
        url: `https://simplewine.ru${item.url || ''}`,
        imageUrl,
        currentPrice,
        oldPrice: oldPrice !== currentPrice ? oldPrice : undefined,
        rawPayload: { title, url: item.url, basePrice, piecePrice, discountValue, discountType, showDiscount: item.price?.showDiscountPercent, country, color, sugarType, year, volume, region, manufacturer, grapes, wineType, ratings: item.ratings, reviewsCount: item.reviewsCount },
      })
    }
    return offers
  }
}

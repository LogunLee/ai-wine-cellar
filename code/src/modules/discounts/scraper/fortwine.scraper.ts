import { Injectable } from '@nestjs/common'
import { chromium, Browser, Page, BrowserContext } from 'playwright'
import { Store } from '@prisma/client'
import { BaseScraper, RawScrapedOffer, ScraperResult, ScraperCallbacks, ScraperCheckpointCallbacks } from './base-scraper'
import { createStealthBrowser, humanScroll, randomDelay } from './stealth-browser'

@Injectable()
export class FortwineScraper extends BaseScraper {
  storeCode = 'fortwine'

  async scrape(store: Store, jobId: string, callbacks?: ScraperCallbacks, checkpointCallbacks?: ScraperCheckpointCallbacks): Promise<ScraperResult> {
    const baseUrl = store.baseUrl || 'https://fortwine.ru'
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
        return page
      }

      page = await setupPage()

      const scrapeCategory = async (path: string, label: string, categoryKey: string) => {
        const maxPages = process.env.SCRAPER_MAX_PAGES ? parseInt(process.env.SCRAPER_MAX_PAGES, 10) : null
        let pageNum = 1
        const seenUrls = new Set<string>()
        checkpointCallbacks?.startHeartbeat(categoryKey)

        while (true) {
          if (maxPages && pageNum > maxPages) { this.logger.log(`Reached max pages limit (${maxPages}), stopping ${label}`); break }

          opsCount++
          if (opsCount >= this.PAGE_RECREATE_INTERVAL) {
            this.logger.log(`Recreating page after ${opsCount} ops (${label} page ${pageNum})`)
            await setupPage()
          }

          const url = pageNum === 1 ? `${baseUrl}${path}` : `${baseUrl}${path}?PAGEN_1=${pageNum}`
          this.logger.log(`Loading ${label} ${url}`)
          await page!.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
          await randomDelay(page!, 5000, 3000)
          await humanScroll(page!, 3)
          await randomDelay(page!, 3000, 2000)

          const pageOffers = await this.extractProducts(page!, baseUrl, label === 'Sparkling wines')
          if (pageOffers.length === 0) { this.logger.log(`No products on ${label} page ${pageNum}, stopping`); break }

          const duplicates = pageOffers.filter(o => seenUrls.has(o.url))
          if (pageOffers.length > 0 && duplicates.length / pageOffers.length >= 0.8) {
            this.logger.log(`Page ${pageNum}: ${duplicates.length}/${pageOffers.length} duplicates (>=80%), catalog loop detected, stopping ${label}`)
            break
          }

          pageOffers.forEach(o => seenUrls.add(o.url))
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

      await scrapeCategory('/vino/', 'Still wines', 'still')
      await scrapeCategory('/igristye_vina/', 'Sparkling wines', 'sparkling')

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
      const cards = document.querySelectorAll('.product_card')
      const seen = new Set<string>()
      const results: RawScrapedOffer[] = []
      let withPrice = 0, withoutPrice = 0, withDiscount = 0
      cards.forEach(card => {
        const nameLink = card.querySelector('a.name')
        if (!nameLink) return
        const href = nameLink.getAttribute('href')
        if (!href) return
        const title = nameLink.textContent?.trim() || ''
        if (title.length < 10 || title.length > 300) return
        if (seen.has(title)) return
        seen.add(title)
        const imgEl = card.querySelector('.product_image img')
        const imgUrl = imgEl ? imgEl.getAttribute('src') : null
        const priceEl = card.querySelector('.price')
        const oldPriceEl = card.querySelector('.old_price')
        const priceText = priceEl ? priceEl.textContent?.trim() : ''
        const oldPriceText = oldPriceEl ? oldPriceEl.textContent?.trim() : ''
        const parsePrice = (text: string): number | undefined => { const cleaned = text.replace(/[^\d]/g, ''); const num = parseInt(cleaned, 10); return isNaN(num) || num < 50 ? undefined : num }
        const currentPrice = parsePrice(priceText)
        const oldPrice = parsePrice(oldPriceText)
        if (currentPrice) { withPrice++; if (oldPrice) withDiscount++ } else { withoutPrice++ }
        const sugarEl = card.querySelector('.chars .item:nth-child(1)')
        const colorEl = card.querySelector('.chars .item:nth-child(2)')
        const volumeEl = card.querySelector('.chars .item:nth-child(3)')
        const countryEl = card.querySelector('.chars .item.country')
        const sugar = sugarEl ? sugarEl.textContent?.trim().replace(/\s+/g, ' ') : undefined
        const color = colorEl ? colorEl.textContent?.trim().replace(/\s+/g, ' ') : undefined
        const volumeRaw = volumeEl ? volumeEl.textContent?.trim() : undefined
        const countryRaw = countryEl ? countryEl.textContent?.trim().split('\n')[0]?.trim() : undefined
        const countryNameMap: Record<string, string> = { 'США': 'Соединённые Штаты', 'USA': 'Соединённые Штаты', 'UK': 'Великобритания' }
        const normalizeCountry = (text: string | undefined): string | undefined => { if (!text) return undefined; let trimmed = text.trim(); if (trimmed.toUpperCase() in countryNameMap) return countryNameMap[trimmed.toUpperCase()]; if (trimmed === trimmed.toUpperCase() && trimmed.length > 2) trimmed = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase(); return trimmed }
        const parseVolumeToMl = (text: string | undefined): number | undefined => { if (!text) return undefined; const cleaned = text.replace(/[^\d,.\s]/g, '').trim(); const numStr = cleaned.replace(',', '.'); const num = parseFloat(numStr); if (isNaN(num) || num <= 0) return undefined; return num < 10 ? Math.round(num * 1000) : Math.round(num) }
        const extractVintage = (t: string): string | undefined => { const match = t.match(/\b(19\d{2}|20\d{2})\b/); return match ? match[1] : undefined }
        const country = normalizeCountry(countryRaw)
        const volumeMl = parseVolumeToMl(volumeRaw)
        const vintage = extractVintage(title)
        const dataItemId = card.getAttribute('data-item-id') || undefined
        results.push({ externalId: dataItemId || href.split('/').filter(Boolean).pop(), title, url: `${base}${href}`, imageUrl: imgUrl ? (imgUrl.startsWith('/') ? `${base}${imgUrl}` : imgUrl) : undefined, currentPrice, oldPrice, rawPayload: { title, url: href, sugar, color, volume: volumeRaw, volumeMl, country, year: vintage, fullText: (card.textContent || '').substring(0, 500), wineType: sparkling ? 'SPARKLING' : undefined } })
      })
      return { offers: results, withPrice, withoutPrice, withDiscount }
    }, { base: baseUrl, sparkling })
    this.logger.log(`Extracted: ${result.offers.length} offers, withPrice: ${result.withPrice}, withoutPrice: ${result.withoutPrice}, withDiscount: ${result.withDiscount}`)
    return result.offers
  }
}

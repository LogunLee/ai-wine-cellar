import { Injectable } from '@nestjs/common'
import { Browser, BrowserContext, Page, Response } from 'playwright'
import { Store } from '@prisma/client'
import {
  BaseScraper,
  RawScrapedOffer,
  ScraperResult,
  ScraperCallbacks,
  ScraperCheckpointCallbacks,
} from './base-scraper'
import { createStealthBrowser, humanScroll, randomDelay } from './stealth-browser'

interface ProductEntry {
  url: string
  externalId?: string
  title: string
  imageUrl?: string
  currentPrice?: number
  oldPrice?: number
  isSparkling: boolean
}

@Injectable()
export class MetroScraper extends BaseScraper {
  storeCode = 'metro'
  private gotHttpError = false

  async scrape(
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<ScraperResult> {
    const baseUrl = store.baseUrl || 'https://online.metro-cc.ru'
    const offers: RawScrapedOffer[] = []
    let browser: Browser | null = null
    let context: BrowserContext | null = null
    let page: Page | null = null

    try {
      const { browser: stealthBrowser, contextOptions } = await createStealthBrowser()
      browser = stealthBrowser
      context = await browser.newContext(contextOptions)

      const setupPage = async (): Promise<Page> => {
        if (page) await page.close()
        page = await context!.newPage()
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

      // Save an initial checkpoint so resumeStalledJobs can detect a crash even
      // if it happens before Phase 1 writes its first per-page checkpoint.
      await checkpointCallbacks?.saveCheckpoint('init', 0, null, 0)

      // ─── PHASE 1: collect product entries from catalog pages ─────────────────
      this.logger.log('Phase 1: collecting product entries from catalog...')
      const productEntries: ProductEntry[] = []

      await this.collectFromCatalog(
        page, baseUrl, '/category/alkogolnaya-produkciya/vino', 'Still wines', false,
        productEntries, checkpointCallbacks,
      )
      await this.collectFromCatalog(
        page, baseUrl, '/category/alkogolnaya-produkciya/shampanskoe-igristye-vina', 'Sparkling wines', true,
        productEntries, checkpointCallbacks,
      )

      this.logger.log(`Phase 1 complete: ${productEntries.length} products collected`)

      // ─── PHASE 2: visit each product page for full characteristics ───────────
      // Cache-aware: products already in wine_card are NOT re-visited.
      this.logger.log('Phase 2: scraping individual product pages (cache-aware)...')

      const phase2Offers = await this.runCachedPhase2(
        page!, productEntries, store.id, jobId, callbacks,
        (p, entry) => this.scrapeProductPage(p, entry),
        3000,
      )
      offers.push(...phase2Offers)

      this.logger.log(`Total offers collected: ${offers.length}`)
    } catch (error) {
      this.logger.error(`Scraping error: ${error}`)
      throw error
    } finally {
      if (browser) await browser.close()
    }

    return { offers }
  }

  // ─── Phase 1: collect product entries from catalog pages ──────────────────────

  private async collectFromCatalog(
    page: Page,
    baseUrl: string,
    path: string,
    label: string,
    isSparkling: boolean,
    outEntries: ProductEntry[],
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<void> {
    const maxPages = process.env.SCRAPER_MAX_PAGES
      ? parseInt(process.env.SCRAPER_MAX_PAGES, 10)
      : null
    const maxGood = this.maxGoodPerPage()

    let pageNum = 1
    checkpointCallbacks?.startHeartbeat(path)

    try {
      while (true) {
        if (maxPages && pageNum > maxPages) {
          this.logger.log(`[Phase 1] Max pages (${maxPages}) reached, stopping ${label}`)
          break
        }

        const url = pageNum === 1 ? `${baseUrl}${path}` : `${baseUrl}${path}?page=${pageNum}`
        const loaded = await this.loadPageWithRetry(page, url)
        if (!loaded) {
          this.logger.error(`[Phase 1] Failed to load ${label} page ${pageNum}`)
          break
        }

        await randomDelay(page, 5000, 3000)
        await humanScroll(page, 3)
        await randomDelay(page, 3000, 2000)

        const pageEntries = await page.evaluate(({ base, sparkling }) => {
          const cards = document.querySelectorAll('.catalog-2-level-product-card')
          const results: Array<{
            url: string; externalId?: string; title: string
            imageUrl?: string; currentPrice?: number; oldPrice?: number; isSparkling: boolean
          }> = []
          const seen = new Set<string>()

          cards.forEach((card) => {
            const link = card.querySelector<HTMLAnchorElement>('a[href*="/products/"]')
            if (!link) return
            const href = link.getAttribute('href')
            if (!href || seen.has(href)) return
            seen.add(href)

            const title = link.getAttribute('title') || ''
            if (title.length < 5 || title.length > 300) return

            const imgEl = card.querySelector('img')
            const imageUrl = imgEl?.getAttribute('src') || undefined

            const priceEl = card.querySelector('.product-unit-prices__actual .product-price__sum-rubles')
            const priceText = priceEl?.textContent?.trim() || ''
            const currentPrice = priceText ? parseInt(priceText.replace(/\s/g, ''), 10) : undefined

            const oldPriceEl = card.querySelector('.product-unit-prices__old .product-price__sum-rubles')
            const oldPriceText = oldPriceEl?.textContent?.trim() || ''
            const oldPrice = oldPriceText ? parseInt(oldPriceText.replace(/\s/g, ''), 10) : undefined

            const sku = card.getAttribute('data-sku') || card.getAttribute('id') || undefined

            results.push({
              url: href.startsWith('/') ? `${base}${href}` : href,
              externalId: sku,
              title,
              imageUrl,
              currentPrice,
              oldPrice,
              isSparkling: sparkling,
            })
          })
          return results
        }, { base: baseUrl, sparkling: isSparkling })

        if (pageEntries.length === 0) {
          this.logger.log(`[Phase 1] No products on ${label} page ${pageNum}, stopping`)
          break
        }

        const toAdd = maxGood ? pageEntries.slice(0, maxGood) : pageEntries
        for (const entry of toAdd) {
          if (!outEntries.some(e => e.url === entry.url)) {
            outEntries.push(entry)
          }
        }

        this.logger.log(`[Phase 1] ${label} page ${pageNum}: ${pageEntries.length} entries, added ${toAdd.length}${maxGood ? ` (capped at ${maxGood})` : ''}, total: ${outEntries.length}`)

        await checkpointCallbacks?.saveCheckpoint(path, pageNum, url, outEntries.length)

        pageNum++
        await randomDelay(page, 5000)
      }
    } finally {
      checkpointCallbacks?.stopHeartbeat(path)
      await checkpointCallbacks?.saveCheckpoint(path, pageNum, null, outEntries.length)
    }
  }

  // ─── Phase 2: scrape individual product page for full characteristics ──────────

  private async scrapeProductPage(
    page: Page,
    entry: ProductEntry,
  ): Promise<RawScrapedOffer | null> {
    try {
      const response = await this.gotoWithRetry(page, entry.url)

      if (!response || response.status() >= 400) {
        this.logger.warn(`Product page ${response?.status() ?? 'no response'} for ${entry.url}`)
        return null
      }

      await randomDelay(page, 1500, 500)

      // Give Vue SPA extra time to render characteristics section
      try {
        await page.waitForSelector(
          '[class*="product-page-details"], [class*="product-attributes"], [class*="characteristics"], dl',
          { timeout: 3000 },
        )
      } catch {}

      const pageData = await page.evaluate(() => {
        // Universal label→value extractor — independent of CSS class names.
        // Finds any leaf element whose text is exactly a known wine label, then
        // takes the value from the next element sibling (covers td/td, dt/dd,
        // span/span layouts) or, when the value is a bare text node, from the
        // remainder of the parent's text.
        const wineLabels = [
          'Страна', 'Страна происхождения', 'Регион', 'Сорт', 'Сорта', 'Состав',
          'Цвет', 'Крепость', 'Алкоголь', 'Объем', 'Объём', 'Сахар',
          'Содержание сахара', 'Сладость', 'Производитель', 'Изготовитель',
          'Год урожая', 'Год', 'Аппелласьон', 'Апелласьон', 'Апелляция', 'AOC',
          'Сорт винограда', 'Сорта винограда', 'Виноград', 'Бренд', 'Торговая марка',
        ]
        const norm = (t: string) => (t || '').replace(/\s+/g, ' ').trim().replace(/:+$/, '').trim()
        const chars: Record<string, string> = {}

        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>('th, td, dt, dd, span, div, li, p, b, strong'),
        )
        for (const el of candidates) {
          const label = norm(el.textContent || '')
          if (!wineLabels.includes(label)) continue
          if (chars[label]) continue

          let value = ''
          let sib = el.nextElementSibling
          while (sib && !value) {
            const t = norm(sib.textContent || '')
            if (t && t !== label) value = (sib.textContent || '').trim()
            sib = sib.nextElementSibling
          }
          if (!value && el.parentElement) {
            const parentText = norm(el.parentElement.textContent || '')
            if (parentText.startsWith(label) && parentText.length > label.length) {
              value = parentText.slice(label.length).replace(/^[:\-–—\s]+/, '').trim()
            }
          }
          if (value && value.length < 300) chars[label] = value
        }

        // Metro renders specs as .product-attributes__list-item (name + value),
        // where the value is NOT a direct sibling of the label span — so the
        // generic walker misses it. Parse these items directly (authoritative).
        document.querySelectorAll('.product-attributes__list-item').forEach((item) => {
          const name = norm(item.querySelector('.product-attributes__list-item-name-text')?.textContent || '')
          if (!name) return
          let value = norm(item.querySelector('[class*="list-item-value"]')?.textContent || '')
          if (!value) {
            const full = norm(item.textContent || '')
            if (full.startsWith(name)) value = full.slice(name.length).trim()
          }
          if (value && value.length < 300) chars[name] = value
        })

        // Grape varieties
        const grapeRaw =
          chars['Сорт винограда'] || chars['Сорта винограда'] || chars['Сорт'] || chars['Сорта'] || chars['Состав'] || ''
        const grapes = grapeRaw
          .split(/[,;]/)
          .map((g: string) => g.replace(/\s*\d+(\.\d+)?%.*$/, '').trim())
          .filter(Boolean)

        // Alcohol
        const alcoholText = chars['Крепость'] || chars['Алкоголь'] || chars['Содержание алкоголя'] || ''
        const alcoholMatch = alcoholText.match(/([\d.]+)/)
        const alcohol = alcoholMatch ? parseFloat(alcoholMatch[1]) : null

        // Appellation
        const appellation =
          chars['Аппелласьон'] || chars['Апелласьон'] || chars['AOC'] || chars['Апелляция'] || null

        // Prices from page (fallback to entry prices)
        const priceEl = document.querySelector('.product-unit-prices__actual .product-price__sum-rubles')
        const priceText = priceEl?.textContent?.trim() || ''
        const pageCurrentPrice = priceText ? parseInt(priceText.replace(/\s/g, ''), 10) : null

        const oldPriceEl = document.querySelector('.product-unit-prices__old .product-price__sum-rubles')
        const oldPriceText = oldPriceEl?.textContent?.trim() || ''
        const pageOldPrice = oldPriceText ? parseInt(oldPriceText.replace(/\s/g, ''), 10) : null

        // Availability
        const hasCartButton = !!document.querySelector('[class*="add-to-cart"], [class*="cart"]')

        return {
          chars,
          grapes,
          alcohol,
          appellation,
          pageCurrentPrice,
          pageOldPrice,
          hasCartButton,
        }
      })

      // Determine wine type
      const colorMap: Record<string, string> = {
        'белое': 'WHITE', 'белый': 'WHITE',
        'красное': 'RED', 'красный': 'RED',
        'розовое': 'ROSE', 'розовый': 'ROSE',
        'оранжевое': 'ORANGE', 'оранжевый': 'ORANGE',
      }
      const colorFromPage = (pageData.chars['Цвет'] || '').toLowerCase().trim()
      const colorFromTitle = (() => {
        const m = entry.title.match(/(красное|белое|розовое|игристое)/i)
        return m ? m[1].toLowerCase() : ''
      })()
      const wineType = entry.isSparkling
        ? 'SPARKLING'
        : colorMap[colorFromPage] ?? colorMap[colorFromTitle] ?? 'OTHER'

      // Volume
      const volumeText = pageData.chars['Объем'] || pageData.chars['Объём'] || ''
      const volumeMatch = entry.title.match(/(\d[\d.,]*)\s*л/) || volumeText.match(/([\d.]+)\s*л/)
      const volumeMl = volumeMatch ? Math.round(parseFloat(volumeMatch[1].replace(',', '.')) * 1000) : undefined

      const currentPrice = pageData.pageCurrentPrice || entry.currentPrice
      const oldPrice = pageData.pageOldPrice || entry.oldPrice

      return {
        externalId: entry.externalId,
        title: entry.title,
        url: entry.url,
        imageUrl: entry.imageUrl,
        currentPrice,
        oldPrice,
        rawPayload: {
          title: entry.title,
          url: entry.url,
          country: pageData.chars['Страна'] || pageData.chars['Страна-производитель'] || pageData.chars['Страна производителя'] || pageData.chars['Страна происхождения'] || null,
          region: pageData.chars['Регион'] || null,
          appellation: pageData.appellation,
          color: pageData.chars['Цвет'] || null,
          sugarType: pageData.chars['Содержание сахара'] || pageData.chars['Сахар'] || pageData.chars['Сладость'] || null,
          year: pageData.chars['Год урожая'] || pageData.chars['Винтаж'] || null,
          volume: volumeText || null,
          volumeMl: volumeMl ?? null,
          alcohol: pageData.alcohol,
          manufacturer: pageData.chars['Производитель'] || pageData.chars['Изготовитель'] || null,
          grapes: pageData.grapes,
          characteristics: pageData.chars,
          wineType,
          hasCartButton: pageData.hasCartButton,
        },
      }
    } catch (error) {
      this.logger.error(`Error scraping ${entry.url}: ${error}`)
      return null
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async loadPageWithRetry(page: Page, url: string, attempt: number = 1, maxAttempts: number = 5): Promise<boolean> {
    if (attempt > maxAttempts) return false
    this.gotHttpError = false
    this.logger.log(`Loading ${url} (attempt ${attempt})`)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    } catch (e) {
      this.logger.warn(`Navigation error: ${e}`)
    }
    if (this.gotHttpError) {
      const backoff = 30000 * Math.pow(2, Math.min(attempt - 1, 3))
      this.logger.warn(`Got HTTP error on ${url}, waiting ${backoff / 1000}s (attempt ${attempt})`)
      await page.waitForTimeout(backoff)
      return this.loadPageWithRetry(page, url, attempt + 1, maxAttempts)
    }
    return true
  }
}

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
export class FortwineScraper extends BaseScraper {
  storeCode = 'fortwine'

  async scrape(
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<ScraperResult> {
    const baseUrl = store.baseUrl || 'https://fortwine.ru'
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
        return page
      }

      page = await setupPage()

      // Save an initial checkpoint so resumeStalledJobs can detect a crash even
      // if it happens before Phase 1 writes its first per-page checkpoint.
      await checkpointCallbacks?.saveCheckpoint('init', 0, null, 0)

      // ─── PHASE 1: collect product entries from catalog pages ─────────────────
      this.logger.log('Phase 1: collecting product entries from catalog...')
      const productEntries: ProductEntry[] = []

      await this.collectFromCatalog(page, baseUrl, '/vino/', 'Still wines', false, productEntries, checkpointCallbacks)
      await this.collectFromCatalog(page, baseUrl, '/igristye_vina/', 'Sparkling wines', true, productEntries, checkpointCallbacks)

      this.logger.log(`Phase 1 complete: ${productEntries.length} products collected`)

      // ─── PHASE 2: visit each product page for full characteristics ───────────
      // Cache-aware: products already in wine_card are NOT re-visited; their
      // characteristics are reused and only the list price is refreshed.
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
    const seenUrls = new Set<string>()
    checkpointCallbacks?.startHeartbeat(path)

    try {
      while (true) {
        if (maxPages && pageNum > maxPages) {
          this.logger.log(`[Phase 1] Max pages (${maxPages}) reached, stopping ${label}`)
          break
        }

        const url = pageNum === 1 ? `${baseUrl}${path}` : `${baseUrl}${path}?PAGEN_1=${pageNum}`
        this.logger.log(`[Phase 1] Loading ${label} page ${pageNum}: ${url}`)

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await randomDelay(page, 5000, 3000)
        await humanScroll(page, 3)
        await randomDelay(page, 3000, 2000)

        const pageEntries = await page.evaluate(({ base, sparkling }) => {
          const cards = document.querySelectorAll('.product_card')
          const results: Array<{
            url: string; externalId?: string; title: string
            imageUrl?: string; currentPrice?: number; oldPrice?: number; isSparkling: boolean
          }> = []

          cards.forEach(card => {
            const nameLink = card.querySelector<HTMLAnchorElement>('a.name')
            if (!nameLink) return
            const href = nameLink.getAttribute('href')
            if (!href) return

            const title = nameLink.textContent?.trim() || ''
            if (title.length < 10 || title.length > 300) return

            const imgEl = card.querySelector<HTMLImageElement>('.product_image img')
            const imgSrc = imgEl?.getAttribute('src') || null
            const imageUrl = imgSrc
              ? (imgSrc.startsWith('/') ? `${base}${imgSrc}` : imgSrc)
              : undefined

            const priceEl = card.querySelector('.price')
            const oldPriceEl = card.querySelector('.old_price')
            const parsePrice = (text: string): number | undefined => {
              const cleaned = text.replace(/[^\d]/g, '')
              const num = parseInt(cleaned, 10)
              return isNaN(num) || num < 50 ? undefined : num
            }
            const currentPrice = parsePrice(priceEl?.textContent?.trim() || '')
            const oldPrice = parsePrice(oldPriceEl?.textContent?.trim() || '')

            const dataItemId = card.getAttribute('data-item-id') || undefined
            const externalId = dataItemId || href.split('/').filter(Boolean).pop()

            results.push({
              url: `${base}${href}`,
              externalId,
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

        // Detect catalog loop (80%+ duplicates)
        const newEntries = pageEntries.filter(e => !seenUrls.has(e.url))
        if (pageEntries.length > 0 && newEntries.length / pageEntries.length < 0.2) {
          this.logger.log(`[Phase 1] Catalog loop detected on ${label} page ${pageNum}, stopping`)
          break
        }

        const toAdd = maxGood ? newEntries.slice(0, maxGood) : newEntries
        for (const entry of toAdd) {
          seenUrls.add(entry.url)
          outEntries.push(entry)
        }

        this.logger.log(`[Phase 1] ${label} page ${pageNum}: ${pageEntries.length} cards, ${newEntries.length} new, added ${toAdd.length}${maxGood ? ` (capped at ${maxGood})` : ''}, total: ${outEntries.length}`)

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

      const pageData = await page.evaluate(() => {
        // Universal label→value extractor — independent of CSS class names.
        // Finds any leaf element whose text is exactly a known wine label, then
        // takes the value from the next element sibling (covers td/td, dt/dd,
        // span/span layouts) or, when the value is a bare text node, from the
        // remainder of the parent's text.
        const wineLabels = [
          'Страна', 'Страна происхождения', 'Регион', 'Сорт', 'Сорта', 'Состав',
          'Цвет', 'Крепость', 'Алкоголь', 'Объем', 'Объём', 'Сахар',
          'Содержание сахара', 'Производитель', 'Изготовитель', 'Год урожая', 'Год',
          'Аппелласьон', 'Апелласьон', 'Апелляция', 'AOC', 'Сорт винограда',
          'Сорта винограда', 'Виноград', 'Бренд', 'Торговая марка', 'Выдержка',
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

        // Grape varieties
        const grapeRaw =
          chars['Сорт винограда'] || chars['Сорта винограда'] || chars['Сорта'] ||
          chars['Состав'] || chars['Виноград'] || chars['Сорт'] || ''
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

        // Prices from product page detail
        const parsePrice = (sel: string): number | undefined => {
          const el = document.querySelector(sel)
          if (!el) return undefined
          const cleaned = (el.textContent || '').replace(/[^\d]/g, '')
          const num = parseInt(cleaned, 10)
          return isNaN(num) || num < 50 ? undefined : num
        }
        const pageCurrentPrice = parsePrice('.price, .price_value, [class*="current-price"]')
        const pageOldPrice = parsePrice('.old_price, .old-price, [class*="old-price"]')

        const hasCartButton = !!document.querySelector('[class*="add-to-cart"], [class*="in-cart"], .buy_btn')

        // Country + region: FortWine has no separate "Страна" field — it encodes
        // both inside the product's "Регион" row as two links:
        //   <a href=".../country-is-...">Россия</a> + <a href=".../region-is-...">Край</a>
        // IMPORTANT: scope the search to THIS product's "Регион" row — a page-wide
        // querySelector('a[href*="country-is"]') would catch unrelated filter/
        // recommendation links (which made every wine look French).
        let countryFromLink: string | null = null
        let regionFromLink: string | null = null
        for (const row of Array.from(document.querySelectorAll('.item.row'))) {
          const nm = norm(row.querySelector('.name')?.textContent || '')
          if (nm !== 'Регион' && nm !== 'Страна') continue
          const cl = row.querySelector('a[href*="country-is"]')
          const rl = row.querySelector('a[href*="region-is"]')
          if (cl) countryFromLink = norm(cl.textContent || '') || null
          if (rl) regionFromLink = norm(rl.textContent || '') || null
          break
        }

        // Description: FortWine keeps free-text notes in .detail_text blocks
        // (tabs "О товаре" / "О производителе": органолептика, история, регион).
        const descParts: string[] = []
        document.querySelectorAll('.detail_text').forEach((el) => {
          const t = (el as HTMLElement).innerText || el.textContent || ''
          const clean = t.replace(/\s+/g, ' ').trim()
          if (clean.length >= 40) descParts.push(clean)
        })
        const seen = new Set<string>()
        const description = descParts
          .filter((p) => (seen.has(p) ? false : (seen.add(p), true)))
          .join('\n\n')
          .slice(0, 4000) || null

        return { chars, grapes, alcohol, appellation, pageCurrentPrice, pageOldPrice, hasCartButton, description, countryFromLink, regionFromLink }
      })

      // Wine type
      const colorMap: Record<string, string> = {
        'белое': 'WHITE', 'белый': 'WHITE',
        'красное': 'RED', 'красный': 'RED',
        'розовое': 'ROSE', 'розовый': 'ROSE',
        'оранжевое': 'ORANGE',
      }
      const catalogColorMap: Record<string, string> = {
        'красное': 'RED', 'белое': 'WHITE', 'розовое': 'ROSE',
      }
      const colorFromPage = (pageData.chars['Цвет'] || '').toLowerCase().trim()
      const colorFromCatalog = (() => {
        const m = entry.title.match(/(красное|белое|розовое)/i)
        return m ? m[1].toLowerCase() : ''
      })()
      const wineType = entry.isSparkling
        ? 'SPARKLING'
        : colorMap[colorFromPage] ?? catalogColorMap[colorFromCatalog] ?? 'OTHER'

      // Volume
      const volumeText = pageData.chars['Объем'] || pageData.chars['Объём'] || ''
      const volumeRaw = (() => {
        const charEl = pageData.chars['Объём'] || pageData.chars['Объем'] || ''
        if (charEl) return charEl
        const m = entry.title.match(/(\d[\d.,]*)\s*л/)
        return m ? m[0] : ''
      })()
      const parseVol = (text: string): number | undefined => {
        const m = text.match(/([\d.,]+)\s*л/)
        if (!m) return undefined
        const n = parseFloat(m[1].replace(',', '.'))
        return isNaN(n) ? undefined : Math.round(n * 1000)
      }
      const volumeMl = parseVol(volumeText) || parseVol(entry.title)

      // Sugar / vintage
      const sugarFromChars = pageData.chars['Содержание сахара'] || pageData.chars['Сахар'] || null
      const sugarFromCatalog = (() => {
        const m = entry.title.match(/(сухое|полусухое|полусладкое|сладкое)/i)
        return m ? m[1] : null
      })()

      const vintageMatch = entry.title.match(/\b(19\d{2}|20\d{2})\b/)
      const vintage = vintageMatch ? vintageMatch[1] : null

      const country = pageData.chars['Страна'] || null
      const countryFromCatalog = (() => {
        const countryMap: Record<string, string> = {
          'испании': 'Испания', 'франции': 'Франция', 'италии': 'Италия',
          'германии': 'Германия', 'аргентине': 'Аргентина', 'чили': 'Чили',
          'португалии': 'Португалия', 'австрии': 'Австрия', 'австралии': 'Австралия',
          'греции': 'Греция', 'грузии': 'Грузия', 'России': 'Россия',
        }
        const fullText = ''  // not available here
        const m = fullText.match(/(?:сделано|произведено)\s+в\s+([^\n,.]+)/i)
        if (!m) return null
        const c = m[1].trim().toLowerCase()
        for (const [k, v] of Object.entries(countryMap)) { if (c.includes(k)) return v }
        return null
      })()

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
          country: country || pageData.countryFromLink || countryFromCatalog,
          region: pageData.regionFromLink || pageData.chars['Регион'] || null,
          appellation: pageData.appellation,
          color: pageData.chars['Цвет'] || null,
          sugarType: sugarFromChars || sugarFromCatalog,
          year: pageData.chars['Год урожая'] || pageData.chars['Винтаж'] || vintage,
          volume: volumeRaw || null,
          volumeMl: volumeMl ?? null,
          alcohol: pageData.alcohol,
          manufacturer: pageData.chars['Производитель'] || pageData.chars['Изготовитель'] || null,
          grapes: pageData.grapes,
          characteristics: pageData.chars,
          description: pageData.description,
          wineType,
          hasCartButton: pageData.hasCartButton,
        },
      }
    } catch (error) {
      this.logger.error(`Error scraping ${entry.url}: ${error}`)
      return null
    }
  }
}

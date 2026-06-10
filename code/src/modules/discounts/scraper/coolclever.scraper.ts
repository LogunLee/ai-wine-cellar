import { Injectable } from '@nestjs/common'
import { Browser, Page, BrowserContext, Response } from 'playwright'
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
  title?: string
  imageUrl?: string
  currentPrice?: number
  oldPrice?: number
  forceWineType?: string
}

@Injectable()
export class CoolCleverScraper extends BaseScraper {
  storeCode = 'coolclever'

  private got429 = false
  private got403 = false

  // ─── Main scrape ────────────────────────────────────────────────────────────

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

        page = await context!.newPage()
        opsCount = 0

        await page.route('**/*', async route => {
          const url = route.request().url()
          const resourceType = route.request().resourceType()

          // Block only heavy media to save bandwidth. Do NOT throttle other
          // requests: CoolClever's catalog is client-rendered and a per-request
          // delay starves the data fetch so the product list never renders.
          // Rate-limit (429) protection is provided by the randomDelay pauses
          // between catalog pages / product pages, not by per-request throttling.
          if (['image', 'font', 'stylesheet'].includes(resourceType)) {
            await route.abort()
            return
          }
          if (url.includes('/api/log-')) {
            await route.abort()
            return
          }
          try {
            await route.continue()
          } catch {
            try { await route.abort() } catch {}
          }
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

      // Save an initial checkpoint so resumeStalledJobs can detect a crash even
      // if it happens before Phase 1 writes its first per-page checkpoint.
      await checkpointCallbacks?.saveCheckpoint('init', 0, null, 0)

      // ─── PHASE 1: collect available product URLs from catalog pages ───────────
      this.logger.log('Phase 1: collecting available products from catalog...')
      const productEntries: ProductEntry[] = []

      await this.collectAvailableProducts(
        page!, baseUrl, '/catalog/otdokhni/vino', 'Still wines', 'still',
        undefined, productEntries, setupPage, () => opsCount, (n) => { opsCount = n },
        checkpointCallbacks,
      )

      await this.collectAvailableProducts(
        page!, baseUrl, '/catalog/otdokhni/shampanskoe-igristoe', 'Sparkling wines', 'sparkling',
        'SPARKLING', productEntries, setupPage, () => opsCount, (n) => { opsCount = n },
        checkpointCallbacks,
      )

      this.logger.log(`Phase 1 complete: ${productEntries.length} available products collected`)

      // ─── PHASE 2: visit each product page and extract full data ───────────────
      // Cache-aware: products already in wine_card (with a fresh list price) are
      // NOT re-visited — only cache misses load the page. Page-recreation and 429
      // handling are preserved for the miss path. CoolClever is slow & rate-limited,
      // so this cache is the biggest win here.
      this.logger.log('Phase 2: scraping individual product pages (cache-aware)...')

      const keys = productEntries.map((e) => this.cacheKey(e))
      const cache = (await callbacks?.getCachedCards?.(store.id, keys)) ?? new Map()
      let cacheHits = 0
      let scraped = 0

      for (let i = 0; i < productEntries.length; i++) {
        const entry = productEntries[i]
        const key = this.cacheKey(entry)
        const cached = entry.currentPrice != null ? cache.get(key) : undefined
        let offer: import('./base-scraper').RawScrapedOffer | null = null

        try {
          if (cached) {
            offer = this.buildOfferFromCache({
              externalId: entry.externalId,
              title: entry.title ?? '',
              url: entry.url,
              imageUrl: entry.imageUrl,
              currentPrice: entry.currentPrice,
              oldPrice: entry.oldPrice,
              payloadJson: cached.payloadJson,
            })
            cacheHits++
            this.logger.log(`[Phase 2] ${i + 1}/${productEntries.length}: CACHE HIT ${entry.url}`)
          } else {
            this.logger.log(`[Phase 2] ${i + 1}/${productEntries.length}: scraping ${entry.url}`)
            opsCount++
            if (opsCount >= this.PAGE_RECREATE_INTERVAL) {
              this.logger.log(`Recreating page after ${opsCount} ops`)
              page = await setupPage()
            }
            offer = await this.scrapeProductPage(page!, entry.url, entry.forceWineType)
            scraped++
            if (offer) {
              const fields = this.extractCardFields(offer.rawPayload)
              if (this.hasMeaningfulCard(fields)) {
                await callbacks?.saveCard?.(store.id, {
                  cardKey: key,
                  externalId: entry.externalId ?? null,
                  url: entry.url,
                  payloadJson: this.stripPriceFields(offer.rawPayload),
                  ...fields,
                })
              }
            }
            // Pace product-page loads (replaces the old per-request throttle):
            // CoolClever rate-limits (429) if pages are hit back-to-back. Only
            // miss-path loads need pacing — cache hits make no requests.
            if (i < productEntries.length - 1) {
              await randomDelay(page!, 2000, 1000)
            }
          }
        } catch (error) {
          this.logger.error(`[Phase 2] Failed ${entry.url}: ${error}`)
        }

        if (offer) {
          offers.push(offer)
          if (callbacks) {
            const result = await callbacks.saveAndNormalize([offer], store.id, jobId)
            this.logger.log(
              `Saved: created=${result.created}, updated=${result.updated}, normalized=${result.normalized}`,
            )
          }
        }
      }

      this.logger.log(`[Phase 2] complete: cacheHits=${cacheHits}, scraped=${scraped}`)
      this.logger.log(`Total offers collected: ${offers.length}`)
    } catch (error) {
      this.logger.error(`Scraping error: ${error}`)
      throw error
    } finally {
      if (browser) await browser.close()
    }

    return { offers }
  }

  // ─── Phase 1: collect available product entries from catalog pages ──────────

  private async collectAvailableProducts(
    page: Page,
    baseUrl: string,
    path: string,
    label: string,
    categoryKey: string,
    forceWineType: string | undefined,
    outEntries: ProductEntry[],
    setupPage: () => Promise<Page>,
    getOpsCount: () => number,
    setOpsCount: (n: number) => void,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<void> {
    const maxPages = process.env.SCRAPER_MAX_PAGES
      ? parseInt(process.env.SCRAPER_MAX_PAGES, 10)
      : null
    const maxGood = this.maxGoodPerPage()

    let pageNum = 1
    checkpointCallbacks?.startHeartbeat(categoryKey)

    try {
      while (true) {
        if (maxPages && pageNum > maxPages) {
          this.logger.log(`[Phase 1] Max pages (${maxPages}) reached, stopping ${label}`)
          break
        }

        let ops = getOpsCount() + 1
        setOpsCount(ops)
        if (ops >= this.PAGE_RECREATE_INTERVAL) {
          this.logger.log(`[Phase 1] Recreating page after ${ops} ops (${label} page ${pageNum})`)
          page = await setupPage()
        }

        const url = pageNum === 1 ? `${baseUrl}${path}` : `${baseUrl}${path}?page=${pageNum}`
        const loaded = await this.loadPageWithRetry(page, url)

        if (!loaded) {
          this.logger.error(`[Phase 1] Failed to load ${label} page ${pageNum} after retries`)
          break
        }

        await this.waitForPageReady(page)

        // Catalog is client-rendered — wait until the product cards actually
        // appear before reading the DOM (self-heals slow hydration).
        try {
          await page.waitForSelector('[class*="ProductCard_card"]', { timeout: 20000 })
        } catch {
          this.logger.warn(`[Phase 1] Product cards did not render on ${label} page ${pageNum} within 20s`)
        }

        const { entries, unavailableCount } = await page.evaluate((args) => {
          const { baseUrl, forceWineType } = args
          const cards = document.querySelectorAll('[class*="ProductCard_card"]')
          const results: Array<{
            url: string; externalId?: string; title?: string; imageUrl?: string
            currentPrice?: number; oldPrice?: number; forceWineType?: string
          }> = []
          let unavailableCount = 0

          cards.forEach(card => {
            const link =
              card.querySelector('a[class*="ProductCard_name"]') ||
              card.querySelector('a[href*="/catalog/product/"]')
            const href = link?.getAttribute('href')
            const name = link?.textContent?.trim() || ''

            if (!href || name.length < 5) return

            // A product is available when there's an "Добавить" button.
            // Unavailable cards have no such button (or show "Нет в наличии").
            const buttons = Array.from(card.querySelectorAll('button'))
            const hasAddButton = buttons.some(b =>
              b.textContent?.trim().toLowerCase().includes('добавить'),
            )

            const cardText = card.textContent || ''
            const isExplicitlyUnavailable = /нет в наличии|временно недоступн/i.test(cardText)

            if (!hasAddButton || isExplicitlyUnavailable) {
              unavailableCount++
              return
            }

            const url = href.startsWith('http') ? href : `${baseUrl}${href}`

            // Stable id = trailing numeric segment of the slug (…-90044911)
            const idMatch = href.match(/(\d{4,})\/?$/)
            const externalId = idMatch ? idMatch[1] : undefined

            const imgEl = card.querySelector<HTMLImageElement>('img')
            const imgSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || ''
            const imageUrl = imgSrc
              ? (imgSrc.startsWith('http') ? imgSrc : `${baseUrl}${imgSrc}`)
              : undefined

            // Prices from list: bigPrice + littlePrice (kopecks). Smaller = current,
            // larger = old. Same component as the product page.
            const priceVals: number[] = []
            card.querySelectorAll('[class*="bigPrice"]').forEach(big => {
              const wrap = big.closest('[class*="riceItem"]') || big.parentElement
              // Strip thousands separators (spaces / NBSP): "1 290" must not become 1.
              const bigDigits = (big.textContent || '').replace(/\D/g, '')
              const little = (wrap?.querySelector('[class*="littlePrice"]')?.textContent || '').replace(/\D/g, '') || '00'
              if (!bigDigits) return
              const v = parseFloat(`${bigDigits}.${little}`)
              if (!isNaN(v) && v > 0) priceVals.push(v)
            })
            let currentPrice: number | undefined
            let oldPrice: number | undefined
            if (priceVals.length === 1) {
              currentPrice = priceVals[0]
            } else if (priceVals.length >= 2) {
              currentPrice = Math.min(...priceVals)
              oldPrice = Math.max(...priceVals)
              if ((oldPrice - currentPrice) / oldPrice < 0.01) oldPrice = undefined
            }

            results.push({ url, externalId, title: name, imageUrl, currentPrice, oldPrice, forceWineType })
          })

          return { entries: results, unavailableCount }
        }, { baseUrl, forceWineType })

        const totalCards = entries.length + unavailableCount

        if (totalCards === 0) {
          this.logger.log(`[Phase 1] No products on ${label} page ${pageNum}, stopping`)
          break
        }

        // Deduplicate and add to outEntries (capped per page in debug mode)
        const goodEntries = maxGood ? entries.slice(0, maxGood) : entries
        let addedCount = 0
        for (const e of goodEntries) {
          if (!outEntries.some(x => x.url === e.url)) {
            outEntries.push(e)
            addedCount++
          }
        }

        this.logger.log(
          `[Phase 1] ${label} page ${pageNum}: total=${totalCards}, ` +
          `available=${entries.length}, unavailable=${unavailableCount}, ` +
          `added=${addedCount}${maxGood ? ` (capped at ${maxGood})` : ''}, collected=${outEntries.length}`,
        )

        await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, url, outEntries.length)

        pageNum++
        this.logger.log('[Phase 1] Waiting before next catalog page...')
        await randomDelay(page, 3000, 1000)
      }
    } finally {
      checkpointCallbacks?.stopHeartbeat(categoryKey)
      await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, null, outEntries.length)
    }
  }

  // ─── Phase 2: scrape a single product page ──────────────────────────────────

  private async scrapeProductPage(
    page: Page,
    productUrl: string,
    forceWineType?: string,
  ): Promise<RawScrapedOffer | null> {
    try {
      // CoolClever is a heavy Next.js SPA behind rate-limiting (429), so it needs
      // a more generous timeout ladder than the default. A 429/403 is a *successful*
      // HTTP response (gotoWithRetry only retries on network/timeout errors), so we
      // handle rate-limit responses here with an escalating backoff + retry.
      let response: Response | null = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        this.got429 = false
        this.got403 = false
        response = await this.gotoWithRetry(page, productUrl, {
          timeouts: [20000, 40000, 60000],
        })
        const status = response?.status() ?? 0
        const rateLimited = status === 429 || status === 403 || this.got429 || this.got403
        if (response && !rateLimited && status < 400) break
        if (rateLimited && attempt < 3) {
          const backoff = 30000 * attempt
          this.logger.warn(
            `Product page ${status || '429/403'} for ${productUrl}, ` +
            `backing off ${backoff / 1000}s (attempt ${attempt}/3)`,
          )
          await page.waitForTimeout(backoff)
          continue
        }
        // Non-rate-limit error, or retries exhausted
        this.logger.warn(`Product page ${response?.status() ?? 'no response'} for ${productUrl}`)
        return null
      }
      if (!response) return null

      // Wait for React to render the page content
      await randomDelay(page, 2000, 500)

      if (this.got429 || this.got403) {
        const backoff = 30000
        this.logger.warn(`Got ${this.got429 ? 429 : 403} on product page, waiting ${backoff / 1000}s`)
        await page.waitForTimeout(backoff)
        this.got429 = false
        this.got403 = false
      }

      const data = await page.evaluate(() => {
        // ── Prices ───────────────────────────────────────────────────────────────
        // ProductPagePrice_priceItem contains bigPrice + littlePrice (kopecks).
        // Smaller value = currentPrice (sale/action), larger = oldPrice (base).
        const priceValues: number[] = []
        document.querySelectorAll('[class*="ProductPagePrice_priceItem"]').forEach(item => {
          // Strip thousands separators (spaces / NBSP): "1 290" must not become 1
          // via parseFloat("1 290.00").
          const big = (item.querySelector('[class*="bigPrice"]')?.textContent || '').replace(/\D/g, '')
          const littleRaw = (item.querySelector('[class*="littlePrice"]')?.textContent || '').replace(/\D/g, '')
          const little = littleRaw || '00'
          if (!big) return
          const val = parseFloat(`${big}.${little}`)
          if (!isNaN(val) && val > 0) priceValues.push(val)
        })

        let currentPrice: number | undefined
        let oldPrice: number | undefined

        if (priceValues.length === 1) {
          currentPrice = priceValues[0]
        } else if (priceValues.length >= 2) {
          currentPrice = Math.min(...priceValues)
          oldPrice = Math.max(...priceValues)
          if ((oldPrice - currentPrice) / oldPrice < 0.01) oldPrice = undefined
        }

        // ── Characteristics ───────────────────────────────────────────────────────
        // Universal label→value walker — independent of CSS class names. Finds any
        // leaf element whose text is exactly a known wine label, then takes the
        // value from the next element sibling or the remainder of the parent text.
        const wineLabels = [
          'Страна', 'Страна происхождения', 'Регион', 'Сорт', 'Сорта', 'Состав',
          'Цвет', 'Цвет вина', 'Крепость', 'Алкоголь', 'Объем', 'Объём',
          'Сахар', 'Содержание сахара', 'Производитель', 'Изготовитель', 'Бренд',
          'Год урожая', 'Год', 'Аппелласьон', 'Апелласьон', 'Апелляция', 'AOC',
          'Сорт винограда', 'Сорта винограда', 'Виноград', 'Выдержка',
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

        // Country special-case: CoolClever renders the country block with an empty
        // label and the country name only in the flag <img alt="…">.
        if (!chars['Страна']) {
          document.querySelectorAll('[class*="ProductBlockTable_table"]').forEach(block => {
            const titleEl = block.querySelector('[class*="ProductBlockTable_title"]')
            if (titleEl?.textContent?.trim()) return
            const imgAlt = block.querySelector('img[alt]')?.getAttribute('alt') || ''
            if (imgAlt && imgAlt !== 'iconAlert' && imgAlt.length > 1) chars['Страна'] = imgAlt
          })
        }

        // ── Grape varieties ───────────────────────────────────────────────────────
        // CoolClever renders each grape in its own <a>/<span> with NO separator
        // text, so a plain textContent read concatenates them
        // ("ТемпранильоКаберне СовиньонСира"). Re-extract from the value element's
        // child elements and join with commas so they can be split downstream.
        const grapeLabelRe = /^(сорт винограда|сорта винограда|сорта|сорт|состав|виноград)$/
        let grapeRaw = ''
        for (const el of candidates) {
          const label = norm(el.textContent || '').toLowerCase()
          if (!grapeLabelRe.test(label)) continue
          let sib = el.nextElementSibling
          while (sib && !grapeRaw) {
            const t = norm(sib.textContent || '')
            if (t && t.toLowerCase() !== label) {
              // Each grape sits in its own value element (e.g. <p class="…_value">)
              // nested inside the value container, with NO separator text between
              // them. Collect the value elements (or leaf nodes) and join with
              // commas so they can be split downstream.
              let parts = Array.from(sib.querySelectorAll('[class*="ProductBlockTable_value"], [class*="_value"]'))
                .map((n) => (n.textContent || '').trim())
                .filter(Boolean)
              if (parts.length < 2) {
                // Fallback: leaf elements (no child elements) carrying text.
                parts = Array.from(sib.querySelectorAll('*'))
                  .filter((n) => n.children.length === 0 && (n.textContent || '').trim())
                  .map((n) => (n.textContent || '').trim())
                  .filter(Boolean)
              }
              grapeRaw = parts.length >= 2 ? parts.join(', ') : (sib.textContent || '').trim()
            }
            sib = sib.nextElementSibling
          }
          if (grapeRaw) break
        }
        const grapes = grapeRaw
          .split(/[,;]/)
          .map((g: string) => g.replace(/\s*\d+(\.\d+)?%.*$/, '').trim())
          .filter(Boolean)

        // ── Title ─────────────────────────────────────────────────────────────────
        const title = (
          document.querySelector('[class*="ProductPage_name"]')?.textContent?.trim() ||
          document.querySelector('[class*="ProductMainBlock_name"]')?.textContent?.trim() ||
          document.querySelector('h1')?.textContent?.trim() ||
          ''
        )

        // ── Availability ──────────────────────────────────────────────────────────
        const buttons = Array.from(document.querySelectorAll('button'))
        const hasAddButton = buttons.some(b =>
          b.textContent?.trim().toLowerCase().includes('добавить'),
        )
        const pageText = document.body.textContent || ''
        const isUnavailable = /нет в наличии|временно недоступн/i.test(pageText)

        // ── Image ─────────────────────────────────────────────────────────────────
        const imgEl = document.querySelector<HTMLImageElement>(
          '[class*="ProductPhotoSlider_sliderImage"], [class*="ProductPhotoSlider"] img'
        )
        const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || null

        // ── Supplementary fields ──────────────────────────────────────────────────
        const colorText = (chars['Цвет'] || chars['Цвет вина'] || '').toLowerCase().trim()
        const colorToType: Record<string, string> = {
          'белое': 'WHITE', 'белый': 'WHITE',
          'красное': 'RED', 'красный': 'RED',
          'розовое': 'ROSE', 'розовый': 'ROSE',
          'оранжевое': 'ORANGE', 'оранжевый': 'ORANGE',
        }
        const detectedWineType = colorToType[colorText] ?? null

        const volumeText = chars['Объем'] || chars['Объём'] || ''
        const volumeMatch = volumeText.match(/([\d.]+)\s*(л|мл|ml)/i)
        let volumeMl: number | undefined
        if (volumeMatch) {
          const num = parseFloat(volumeMatch[1])
          const unit = (volumeMatch[2] || '').toLowerCase()
          if (unit === 'мл' || unit === 'ml') volumeMl = num
          else if (num < 10) volumeMl = Math.round(num * 1000)
          else volumeMl = num
        }

        const alcoholText = chars['Крепость'] || ''
        const alcoholMatch = alcoholText.match(/([\d.]+)/)
        const alcohol = alcoholMatch ? parseFloat(alcoholMatch[1]) : undefined

        // Full characteristics map from the spec table (title → value): captures
        // EVERYTHING (Содержание сахара, Крепость, Производитель, Аппеласьон, Стиль
        // вина, Температура подачи, …) for centralized mapping in the normalizer.
        const characteristics: Record<string, string> = {}
        document.querySelectorAll('[class*="ProductBlockTable_table"]').forEach((t) => {
          const ttl = norm(t.querySelector('[class*="ProductBlockTable_title"]')?.textContent || '')
          const val = norm(t.querySelector('[class*="ProductBlockTable_value"]')?.textContent || '')
          if (ttl && val) characteristics[ttl] = val
        })

        // Seller description from inline prose blocks (Цвет/Аромат/Вкус/Тип
        // производства/Описание …) as labeled lines.
        const descParts: string[] = []
        document.querySelectorAll('[class*="ProductBlockInline_header"]').forEach((h) => {
          const label = norm(h.textContent || '')
          let val = ''
          let sib = h.nextElementSibling
          while (sib && !val) {
            if (/ProductBlockInline_text/.test((sib as HTMLElement).className)) val = norm(sib.textContent || '')
            sib = sib.nextElementSibling
          }
          if (label && val) descParts.push(`${label}: ${val}`)
        })
        const description = descParts.join('\n').slice(0, 4000) || null

        return {
          title, currentPrice, oldPrice, chars, grapes,
          hasAddButton, isUnavailable, imageUrl,
          volumeMl, alcohol, detectedWineType,
          characteristics, description,
        }
      })

      // ── Availability gate ──────────────────────────────────────────────────────
      if (!data.hasAddButton || data.isUnavailable) {
        this.logger.log(`Skipping unavailable product: ${productUrl}`)
        return null
      }

      const title = data.title
      if (!title || title.length < 5) {
        this.logger.warn(`Title too short at ${productUrl}: "${title}"`)
        return null
      }

      const wineType = forceWineType ?? data.detectedWineType ?? 'OTHER'

      return {
        externalId: productUrl.split('/').filter(Boolean).pop(),
        title,
        url: productUrl,
        imageUrl: data.imageUrl || undefined,
        currentPrice: data.currentPrice,
        oldPrice: data.oldPrice,
        rawPayload: {
          title,
          url: productUrl,
          // Characteristics
          country: data.chars['Страна'] || null,
          region: data.chars['Регион'] || null,
          appellation: data.chars['Аппелласьон'] || null,
          color: data.chars['Цвет'] || data.chars['Цвет вина'] || null,
          sugar: data.chars['Содержание сахара'] || data.chars['Сахар'] || null,
          alcohol: data.alcohol ?? null,
          volumeMl: data.volumeMl ?? null,
          producer: data.chars['Производитель'] || data.chars['Бренд'] || null,
          // Grape varieties — split array
          grapes: data.grapes,
          // Full characteristics map → normalizer maps to typed columns
          characteristics: data.characteristics,
          // Seller prose (tasting notes, production, etc.)
          description: data.description,
          wineType,
          // Availability
          hasAddButton: data.hasAddButton,
        },
      }
    } catch (error) {
      this.logger.error(`Error scraping ${productUrl}: ${error}`)
      return null
    }
  }

  // ─── Helper methods (unchanged from original) ─────────────────────────────

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

    await page.evaluate(() => window.scrollTo(0, 0))
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
}
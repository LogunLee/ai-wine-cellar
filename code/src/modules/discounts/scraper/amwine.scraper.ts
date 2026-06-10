import { Injectable } from '@nestjs/common'
import { Browser, BrowserContext, Page, Response } from 'playwright'
import { Store } from '@prisma/client'
import {
  BaseScraper,
  RawScrapedOffer,
  ScraperCallbacks,
  ScraperCheckpointCallbacks,
  ScraperResult,
} from './base-scraper'
import { createStealthBrowser, randomDelay } from './stealth-browser'

interface ProductEntry {
  id: string
  externalId?: string
  url: string
  title?: string
  imageUrl?: string
  currentPrice?: number
  oldPrice?: number
  forceWineType?: string
}

@Injectable()
export class AmwineScraper extends BaseScraper {
  storeCode = 'amwine'

  private readonly maxServerErrorAttempts = 5
  private readonly maxCatalogIterations = 1000
  private readonly maxConsecutiveEmpty = 3
  private readonly maxConsecutiveNoIncrease = 3
  private readonly maxConsecutiveAllNotify = 2

  async scrape(
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<ScraperResult> {
    const offers: RawScrapedOffer[] = []

    let browser: Browser | null = null
    let context: BrowserContext | null = null
    let page: Page | null = null
    let lastServerError: { status: number; url: string } | null = null

    try {
      const { browser: stealthBrowser, contextOptions } = await createStealthBrowser()
      browser = stealthBrowser
      context = await browser.newContext(contextOptions)

      const setupPage = async (): Promise<Page> => {
        if (page) await page.close()
        page = await context!.newPage()
        lastServerError = null
        page.on('response', async (response) => {
          const status = response.status()
          if (status >= 500 && response.url().includes('amwine.ru')) {
            lastServerError = { status, url: response.url() }
            this.logger.warn(`Got HTTP ${status} from ${response.url()}`)
          }
        })
        return page
      }

      page = await setupPage()
      const resetServerError = (): void => { lastServerError = null }
      const getLastServerError = (): { status: number; url: string } | null => lastServerError

      // Save an initial checkpoint so resumeStalledJobs can detect a crash even
      // if it happens before Phase 1 writes its first per-page checkpoint.
      await checkpointCallbacks?.saveCheckpoint('init', 0, null, 0)

      // ─── PHASE 1: collect available product URLs from catalog pages ─────────────
      this.logger.log('Phase 1: collecting available products from catalog...')
      const productEntries: ProductEntry[] = []

      await this.collectAvailableProducts(
        page!, 'https://amwine.ru/catalog/vino/', 'Still wines', 'still',
        undefined, productEntries, resetServerError, getLastServerError, checkpointCallbacks,
      )

      await this.collectAvailableProducts(
        page!, 'https://amwine.ru/catalog/igristoe_vino_i_shampanskoe/', 'Sparkling wines', 'sparkling',
        'SPARKLING', productEntries, resetServerError, getLastServerError, checkpointCallbacks,
      )

      this.logger.log(`Phase 1 complete: ${productEntries.length} available products collected`)

      // ─── PHASE 2: visit each product page and extract full data ─────────────────
      // Cache-aware: products already in wine_card (with a fresh list price) are
      // NOT re-visited.
      this.logger.log('Phase 2: scraping individual product pages (cache-aware)...')

      const phase2Offers = await this.runCachedPhase2(
        page!, productEntries, store.id, jobId, callbacks,
        (p, entry) => this.scrapeProductPage(p, entry.url, entry.forceWineType),
        0,
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

  // ─── Phase 1: collect available product entries from a catalog page ────────────

  private async collectAvailableProducts(
    page: Page,
    catalogUrl: string,
    label: string,
    categoryKey: string,
    forceWineType: string | undefined,
    outEntries: ProductEntry[],
    resetServerError: () => void,
    getLastServerError: () => { status: number; url: string } | null,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<void> {
    const maxPages = process.env.SCRAPER_MAX_PAGES
      ? parseInt(process.env.SCRAPER_MAX_PAGES, 10)
      : null
    const maxGood = this.maxGoodPerPage()

    let pageNum = 1
    let previousCount = 0
    let consecutiveEmpty = 0
    let consecutiveNoIncrease = 0
    let consecutiveAllNotify = 0
    let iterationCount = 0
    let heartbeatStarted = false

    try {
      await this.gotoWithServerErrorRetry(page, catalogUrl, label, resetServerError, getLastServerError)
      await randomDelay(page, 2000, 1000)
      await this.closeModals(page)

      checkpointCallbacks?.startHeartbeat(categoryKey)
      heartbeatStarted = true

      while (true) {
        iterationCount++
        if (iterationCount > this.maxCatalogIterations) {
          throw new Error(`${label}: exceeded max catalog iterations (${this.maxCatalogIterations})`)
        }
        if (maxPages && pageNum > maxPages) {
          this.logger.log(`[Phase 1] Max pages (${maxPages}) reached, stopping ${label}`)
          break
        }

        const pageError = await this.getServerErrorPageState(page)
        if (pageError.isServerError) {
          throw new Error(`${label}: server error page. title="${pageError.title}"`)
        }

        const { products, notifyMap } = await page.evaluate(() => {
          const w = window as any
          const prods = Array.isArray(w.products) ? w.products : []

          // For each catalog card, check whether it shows "Сообщить о поступлении".
          // That button (.js-open-popup-link-ajax) only appears when the item is
          // truly out of stock everywhere. All other states (В корзину, В наличии
          // в X магазинах) mean the item should be collected.
          const notifyMap: Record<string, boolean> = {}
          document.querySelectorAll<HTMLElement>('[data-id]').forEach(card => {
            const id = card.getAttribute('data-id')
            if (!id) return
            const btn = card.querySelector('.js-open-popup-link-ajax')
            notifyMap[id] = btn?.textContent?.trim().includes('Сообщить о поступлении') ?? false
          })

          return { products: prods, notifyMap }
        })

        if (!products || products.length === 0) {
          const emptyState = await this.getEmptyProductsDebugState(page)
          if (emptyState.isServerError) {
            throw new Error(`${label}: server error instead of catalog. title="${emptyState.title}"`)
          }
          this.logger.log(
            `[Phase 1] No products on ${label} page ${pageNum}, stopping. url=${emptyState.url}`,
          )
          break
        }

        const newProducts = products.slice(previousCount)
        let addedCount = 0
        let notifyCount = 0

        for (const p of newProducts) {
          if (maxGood && addedCount >= maxGood) break

          const name = p.name || ''
          if (name.length < 5) continue

          // Skip items truly out of stock everywhere — their catalog card shows
          // 'Сообщить о поступлении' (.js-open-popup-link-ajax).
          // Everything else (В корзину, В наличии в X магазинах) gets collected.
          const isNotify = notifyMap[p.id?.toString()] ?? false
          if (isNotify) {
            notifyCount++
            continue
          }

          if (!p.link) continue
          const url = p.link.startsWith('http') ? p.link : `https://amwine.ru${p.link}`

          // Deduplicate by URL
          if (outEntries.some(e => e.url === url)) continue

          // Strict price parse: undefined when not a clean number, so the cache
          // layer falls back to visiting the page instead of trusting a bad price.
          const parseNum = (v: any): number | undefined => {
            if (typeof v === 'number' && v > 50) return v
            if (typeof v === 'string') {
              // window.products prices are strings with a DOT decimal ("6499.99").
              // Keep the decimal: strip spaces/currency, treat comma as dot, but do
              // NOT remove the separator (else "6499.99" → 649999, inflated ×100).
              const cleaned = v.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')
              const n = parseFloat(cleaned)
              return !isNaN(n) && n > 50 ? n : undefined
            }
            return undefined
          }
          const id = p.id?.toString() || ''
          const preview = p.preview_picture || p.previewPicture || null
          outEntries.push({
            id,
            externalId: id || undefined,
            url,
            title: p.name || undefined,
            imageUrl: preview
              ? (String(preview).startsWith('http') ? String(preview) : `https://amwine.ru${preview}`)
              : undefined,
            currentPrice: parseNum(p.price),
            oldPrice: parseNum(p.old_price ?? p.oldPrice),
            forceWineType,
          })
          addedCount++
        }

        const significantCount = newProducts.filter(p => (p.name || '').length >= 5).length

        this.logger.log(
          `[Phase 1] ${label} page ${pageNum}: newProducts=${newProducts.length}, ` +
          `notify=${notifyCount}, added=${addedCount}, totalCollected=${outEntries.length}`,
        )

        // Stop if window.products stopped growing entirely
        if (newProducts.length === 0) {
          consecutiveEmpty++
          if (consecutiveEmpty >= this.maxConsecutiveEmpty) {
            this.logger.log(
              `[Phase 1] No new products for ${this.maxConsecutiveEmpty} iterations, stopping ${label}`,
            )
            break
          }
        } else {
          consecutiveEmpty = 0
        }

        // Stop when 2 consecutive pages are ALL 'Сообщить о поступлении'.
        // This means we've passed the boundary of available items in the sorted catalog.
        const allAreNotify = significantCount > 0 && notifyCount === significantCount
        if (allAreNotify) {
          consecutiveAllNotify++
          this.logger.log(
            `[Phase 1] Page ${pageNum} is all 'Сообщить о поступлении' ` +
            `(${consecutiveAllNotify}/${this.maxConsecutiveAllNotify})`,
          )
          if (consecutiveAllNotify >= this.maxConsecutiveAllNotify) {
            this.logger.log(
              `[Phase 1] ${this.maxConsecutiveAllNotify} consecutive pages fully unavailable, ` +
              `stopping ${label}`,
            )
            break
          }
        } else {
          consecutiveAllNotify = 0
        }

        await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, catalogUrl, outEntries.length)
        previousCount = products.length

        const loadMoreInfo = await this.getLoadMoreInfo(page)
        if (!loadMoreInfo.found || loadMoreInfo.disabled) {
          this.logger.log(`[Phase 1] No load-more button for ${label}, stopping`)
          break
        }

        const productsBefore = products.length
        const productsAfter = await this.clickLoadMoreWithServerErrorRetry(
          page, label, productsBefore, resetServerError, getLastServerError,
        )

        if (productsAfter <= productsBefore) {
          consecutiveNoIncrease++
          if (consecutiveNoIncrease >= this.maxConsecutiveNoIncrease) {
            this.logger.log(
              `[Phase 1] No product count increase for ${this.maxConsecutiveNoIncrease} iters, stopping`,
            )
            break
          }
        } else {
          consecutiveNoIncrease = 0
        }

        pageNum++
      }

      await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, null, outEntries.length)
    } finally {
      if (heartbeatStarted) checkpointCallbacks?.stopHeartbeat(categoryKey)
    }
  }

  // ─── Phase 2: scrape a single product page ────────────────────────────────────

  private async scrapeProductPage(
    page: Page,
    productUrl: string,
    forceWineType?: string,
  ): Promise<RawScrapedOffer | null> {
    try {
      const response = await this.gotoWithRetry(page, productUrl)

      if (!response || response.status() >= 400) {
        this.logger.warn(`Product page ${response?.status() ?? 'no response'} for ${productUrl}`)
        return null
      }

      await randomDelay(page, 1500, 500)

      const data = await page.evaluate(() => {
        // ── Prices ──────────────────────────────────────────────────────────────────
        const parsePrice = (sel: string): number | undefined => {
          const el = document.querySelector(sel)
          if (!el) return undefined
          const text = (el.textContent || '')
            .replace(/[\s ]/g, '')
            .replace(',', '.')
            .replace(/[^\d.]/g, '')
          const val = parseFloat(text)
          return isNaN(val) || val <= 0 ? undefined : val
        }

        const currentPrice = parsePrice('.product-cartblock__price-current')
        const oldPrice = parsePrice('.product-cartblock__price-discount-old')

        // Detect whether this is a loyalty card price
        const isCardPrice = !!document.querySelector('.product-cartblock__price-current-hint-tooltip')

        // ── Characteristics (full list + short list, both use .stats-list__item) ───
        // Use a Map so the full list overwrites the short list if both have the same key
        const chars: Record<string, string> = {}
        document.querySelectorAll('.stats-list__item').forEach(item => {
          const title = item.querySelector('.stats-list__item-title')?.textContent?.trim() || ''
          const value = item.querySelector('.stats-list__item-value')?.textContent?.trim() || ''
          if (title && value) chars[title] = value  // last write wins → full list preferred
        })

        // ── Grape varieties ─────────────────────────────────────────────────────────
        // Label is "Сорт винограда" (sparkling) or "Состав" (still wines).
        // Value is a comma-separated plain text string, e.g. "Шардоне, Пино Нуар, Пино Менье"
        // or "Шардоне 100%". Not individual links.
        const grapeRaw = chars['Сорт винограда'] || chars['Состав'] || ''
        const grapes = grapeRaw
          .split(',')
          .map((g: string) => g.replace(/\s*\d+(\.\d+)?%.*$/, '').trim())  // strip "100%" suffixes
          .filter(Boolean)

        // ── Availability ──────────────────────────────────────────────────────────
        const hasCartButton = !!document.querySelector('.js-add-to-cart')
        const hasShopsLink = !!document.querySelector('.catalog-element-info__shops')
        const warehouseText =
          document.querySelector('.product-cartblock__wherehouse')?.textContent?.trim() || ''
        const stockMatch = warehouseText.match(/\d+/)
        const stockQty = stockMatch ? parseInt(stockMatch[0]) : null

        // ── Image ─────────────────────────────────────────────────────────────────
        const imgEl = document.querySelector<HTMLImageElement>(
          '.product-gallery__main-image, .product-gallery img, [class*="product-image"] img',
        )
        const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || null

        // ── Description ─────────────────────────────────────────────────────────────
        // AMWine keeps free-text notes in .product-narratives__entry blocks
        // ("О вине", "О производителе", …).
        const descParts: string[] = []
        document.querySelectorAll('.product-narratives__entry').forEach((el) => {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
          if (t.length >= 30) descParts.push(t)
        })
        const description = descParts.join('\n\n').slice(0, 4000) || null

        // ── window.products[0] for structured identifiers ─────────────────────────
        const w = window as any
        const prod = Array.isArray(w.products) && w.products.length > 0 ? w.products[0] : null

        return {
          currentPrice,
          oldPrice,
          isCardPrice,
          chars,
          grapes,
          description,
          hasCartButton,
          hasShopsLink,
          stockQty,
          imageUrl,
          prodId: prod?.id?.toString() || null,
          prodName: prod?.name || null,
          prodLink: prod?.link || null,
          prodSale: prod?.sale ?? null,
          prodBadge: prod?.badge ?? null,
          prodAvailable: prod?.available ?? null,
          prodAvailableQty: prod?.available_quantity ?? null,
          prodPreview: prod?.preview_picture || null,
          prodProps: prod?.props || null,
        }
      })

      // ── Availability gate ──────────────────────────────────────────────────────
      // Skip products that are truly unavailable: no cart button AND no in-store link.
      // This catches items showing "Сообщить о поступлении" (notify when available).
      if (!data.hasCartButton && !data.hasShopsLink) {
        this.logger.log(`Skipping unavailable product: ${productUrl}`)
        return null
      }

      // ── Title ──────────────────────────────────────────────────────────────────
      let title = data.prodName || ''
      if (!title) {
        title = await page.evaluate(
          () => document.querySelector('h1')?.textContent?.trim() || '',
        )
      }
      if (title.length < 5) {
        this.logger.warn(`Title too short at ${productUrl}: "${title}"`)
        return null
      }

      // ── Prices ─────────────────────────────────────────────────────────────────
      let currentPrice = data.currentPrice
      let oldPrice = data.oldPrice

      // Discard oldPrice if discount is negligible (< 1%)
      if (currentPrice && oldPrice && (oldPrice - currentPrice) / oldPrice < 0.01) {
        oldPrice = undefined
      }

      // ── Wine type ───────────────────────────────────────────────────────────────
      const colorText = (data.chars['Цвет'] || '').toLowerCase().trim()
      const colorToType: Record<string, string> = {
        'белое': 'WHITE',
        'белый': 'WHITE',
        'красное': 'RED',
        'красный': 'RED',
        'розовое': 'ROSE',
        'розовый': 'ROSE',
        'оранжевое': 'ORANGE',
        'оранжевый': 'ORANGE',
      }
      const detectedWineType = colorToType[colorText] ?? null
      const wineType = forceWineType ?? detectedWineType ?? 'OTHER'

      // ── Volume ─────────────────────────────────────────────────────────────────
      const volumeText = data.chars['Объем'] || data.chars['Объём'] || ''
      const volumeMatch = volumeText.match(/([\d.]+)\s*л/)
      const volumeMl = volumeMatch ? Math.round(parseFloat(volumeMatch[1]) * 1000) : undefined

      // ── Alcohol ────────────────────────────────────────────────────────────────
      const alcoholText = data.chars['Крепость'] || ''
      const alcoholMatch = alcoholText.match(/([\d.]+)/)
      const alcohol = alcoholMatch ? parseFloat(alcoholMatch[1]) : undefined

      // ── Image ──────────────────────────────────────────────────────────────────
      const imageUrl = data.prodPreview || data.imageUrl || undefined

      return {
        externalId: data.prodId || undefined,
        title,
        url: productUrl,
        imageUrl: imageUrl || undefined,
        currentPrice,
        oldPrice,
        rawPayload: {
          id: data.prodId,
          title,
          url: data.prodLink || productUrl,
          sale: data.prodSale,
          badge: data.prodBadge,
          isCardPrice: data.isCardPrice,
          // Prices
          price: data.currentPrice,
          old_price: data.oldPrice,
          // Characteristics from product page
          country: data.chars['Страна'] || null,
          region: data.chars['Регион'] || null,
          appellation: data.chars['Аппелласьон'] || data.chars['Апелласьон'] || null,
          color: data.chars['Цвет'] || null,
          sugar: data.chars['Содержание сахара'] || data.chars['Сахар'] || null,
          alcohol: alcohol ?? null,
          volumeText: volumeText || null,
          volumeMl: volumeMl ?? null,
          producer: data.chars['Производитель'] || null,
          brand: data.chars['Бренд'] || data.chars['Торговая марка'] || null,
          // Grape varieties — split array, one entry per variety
          grapes: data.grapes,
          // Full characteristics map → normalizer maps to typed columns
          characteristics: data.chars,
          // Free-text description / notes
          description: data.description,
          wineType,
          // Availability
          available: data.prodAvailable,
          availableQuantity: data.prodAvailableQty,
          hasCartButton: data.hasCartButton,
          hasShopsLink: data.hasShopsLink,
          stockQty: data.stockQty,
          // Extras
          article: data.prodProps?.article || null,
        },
      }
    } catch (error) {
      this.logger.error(`Error scraping ${productUrl}: ${error}`)
      return null
    }
  }

  // ─── Helper methods (unchanged) ───────────────────────────────────────────────

  private async gotoWithServerErrorRetry(
    page: Page,
    url: string,
    label: string,
    resetServerError: () => void,
    getLastServerError: () => { status: number; url: string } | null,
  ): Promise<Response | null> {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= this.maxServerErrorAttempts; attempt++) {
      resetServerError()

      try {
        this.logger.log(
          `${label}: opening catalog page, attempt ${attempt}/${this.maxServerErrorAttempts}: ${url}`,
        )

        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        })

        const status = response?.status() ?? null
        const serverError = getLastServerError()
        const serverErrorPage = await this.getServerErrorPageState(page)

        if ((status && status >= 500) || serverError || serverErrorPage.isServerError) {
          const actualStatus = status || serverError?.status || 'unknown'

          throw new Error(
            `${label}: server error while opening catalog. ` +
              `status=${actualStatus}, url=${serverError?.url || url}, ` +
              `title="${serverErrorPage.title}"`,
          )
        }

        return response
      } catch (error) {
        lastError = error

        if (attempt >= this.maxServerErrorAttempts) break

        const delayMs = this.getBackoffDelayMs(attempt)

        this.logger.warn(
          `${label}: failed to open catalog, retrying in ${Math.round(delayMs / 1000)}s. ` +
            `attempt=${attempt}/${this.maxServerErrorAttempts}, error=${error}`,
        )

        await page.waitForTimeout(delayMs)
      }
    }

    throw new Error(
      `${label}: failed to open catalog after ${this.maxServerErrorAttempts} attempts. ` +
        `Last error: ${lastError}`,
    )
  }

  private async clickLoadMoreWithServerErrorRetry(
    page: Page,
    label: string,
    productsBefore: number,
    resetServerError: () => void,
    getLastServerError: () => { status: number; url: string } | null,
  ): Promise<number> {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= this.maxServerErrorAttempts; attempt++) {
      resetServerError()

      try {
        this.logger.log(
          `${label}: clicking load more, attempt ${attempt}/${this.maxServerErrorAttempts}`,
        )

        const clicked = await this.clickLoadMore(page)

        if (!clicked) {
          return productsBefore
        }

        await this.waitForProductsIncrease(page, productsBefore, 15000)
        await randomDelay(page, 2000, 1000)

        const serverError = getLastServerError()
        const serverErrorPage = await this.getServerErrorPageState(page)

        if (serverError || serverErrorPage.isServerError) {
          throw new Error(
            `${label}: server error after clicking load more. ` +
              `status=${serverError?.status || 'unknown'}, ` +
              `url=${serverError?.url || page.url()}, ` +
              `title="${serverErrorPage.title}"`,
          )
        }

        const productsAfter = await page.evaluate(() => (window as any).products?.length || 0)

        return productsAfter
      } catch (error) {
        lastError = error

        if (attempt >= this.maxServerErrorAttempts) break

        const delayMs = this.getBackoffDelayMs(attempt)

        this.logger.warn(
          `${label}: load more failed, retrying in ${Math.round(delayMs / 1000)}s. ` +
            `attempt=${attempt}/${this.maxServerErrorAttempts}, error=${error}`,
        )

        await page.waitForTimeout(delayMs)
      }
    }

    throw new Error(
      `${label}: failed to load more products after ${this.maxServerErrorAttempts} attempts. ` +
        `Last error: ${lastError}`,
    )
  }

  private getBackoffDelayMs(attempt: number): number {
    const baseDelayMs = 5000
    const maxDelayMs = 60000
    const delayMs = baseDelayMs * Math.pow(2, attempt - 1)

    return Math.min(delayMs, maxDelayMs)
  }

  private async getLoadMoreInfo(page: Page): Promise<{
    found: boolean
    disabled: boolean | null
    text: string | null
    className: string | null
  }> {
    return page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))

      const btn = buttons.find((button) => {
        const text = button.textContent?.trim().toLowerCase() || ''
        const className = button.className || ''

        return (
          className.includes('pagination__button-more') ||
          text.includes('показать ещё') ||
          text.includes('показать еще') ||
          text.includes('загрузить ещё') ||
          text.includes('загрузить еще')
        )
      })

      return {
        found: !!btn,
        disabled: btn ? btn.disabled : null,
        text: btn ? btn.textContent?.trim() || '' : null,
        className: btn ? btn.className || '' : null,
      }
    })
  }

  private async clickLoadMore(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))

      const btn = buttons.find((button) => {
        const text = button.textContent?.trim().toLowerCase() || ''
        const className = button.className || ''

        return (
          className.includes('pagination__button-more') ||
          text.includes('показать ещё') ||
          text.includes('показать еще') ||
          text.includes('загрузить ещё') ||
          text.includes('загрузить еще')
        )
      })

      if (!btn || btn.disabled) {
        return false
      }

      btn.click()

      return true
    })
  }

  private async waitForProductsIncrease(
    page: Page,
    productsBefore: number,
    timeoutMs: number,
  ): Promise<void> {
    try {
      await page.waitForFunction(
        (count) => {
          return ((window as any).products?.length || 0) > count
        },
        productsBefore,
        { timeout: timeoutMs },
      )
    } catch {
      this.logger.warn(
        `Products count did not increase within ${timeoutMs}ms after clicking load more`,
      )
    }
  }

  private async getServerErrorPageState(page: Page): Promise<{
    isServerError: boolean
    title: string
    bodyText: string
  }> {
    return page.evaluate(() => {
      const title = document.title || ''
      const bodyText = document.body?.innerText?.slice(0, 500) || ''
      const normalizedTitle = title.toLowerCase()
      const normalizedBody = bodyText.toLowerCase()

      const isServerError =
        normalizedTitle.includes('503') ||
        normalizedTitle.includes('502') ||
        normalizedTitle.includes('504') ||
        normalizedTitle.includes('service temporarily unavailable') ||
        normalizedBody.includes('503 service temporarily unavailable') ||
        normalizedBody.includes('502 bad gateway') ||
        normalizedBody.includes('504 gateway timeout') ||
        normalizedBody.includes('nginx')

      return { isServerError, title, bodyText }
    })
  }

  private async getEmptyProductsDebugState(page: Page): Promise<{
    url: string
    title: string
    bodyText: string
    isServerError: boolean
  }> {
    return page.evaluate(() => {
      const url = window.location.href
      const title = document.title || ''
      const bodyText = document.body?.innerText?.slice(0, 500) || ''
      const normalizedTitle = title.toLowerCase()
      const normalizedBody = bodyText.toLowerCase()

      const isServerError =
        normalizedTitle.includes('503') ||
        normalizedTitle.includes('502') ||
        normalizedTitle.includes('504') ||
        normalizedTitle.includes('service temporarily unavailable') ||
        normalizedBody.includes('503 service temporarily unavailable') ||
        normalizedBody.includes('502 bad gateway') ||
        normalizedBody.includes('504 gateway timeout') ||
        normalizedBody.includes('nginx')

      return { url, title, bodyText, isServerError }
    })
  }

  private async closeModals(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const modal = document.getElementById('modal-for-adult')
        if (modal) modal.remove()

        const buttons = Array.from(document.querySelectorAll('button'))

        const ageBtn = buttons.find((b) => b.textContent?.includes('18 лет'))
        if (ageBtn) ageBtn.click()

        const closeButtons = buttons.filter(
          (b) => b.textContent?.trim() === 'Понятно' || b.textContent?.trim() === 'Закрыть',
        )
        closeButtons.forEach((b) => b.click())
      })

      await page.waitForTimeout(2000)
    } catch (error) {
      this.logger.warn(`Failed to close modals: ${error}`)
    }
  }
}
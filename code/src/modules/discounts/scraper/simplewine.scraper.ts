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
import { createStealthBrowser, randomDelay } from './stealth-browser'

interface ProductEntry {
  url: string
  externalId?: string
  title: string
  imageUrl?: string
  currentPrice?: number
  oldPrice?: number
  isSparkling: boolean
  // API-sourced properties (used as fallback if page scraping fails)
  country?: string | null
  color?: string | null
  sugarType?: string | null
  year?: string | null
  volume?: string | null
  region?: string | null
  manufacturer?: string | null
  grapes: string[]
  description?: string | null
  // Raw price fields for rawPayload
  basePrice?: number
  piecePrice?: number
  discountValue?: number
  discountType?: string
  showDiscount?: number
  ratings?: any
  reviewsCount?: number
}

@Injectable()
export class SimpleWineScraper extends BaseScraper {
  storeCode = 'simplewine'
  private gotHttpError = false

  async scrape(
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<ScraperResult> {
    const baseUrl = store.baseUrl || 'https://simplewine.ru'
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
          if (
            status >= 400 &&
            status < 600 &&
            status !== 404 &&
            response.url().includes('simplewine.ru')
          ) {
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

      // Establish session with escalating timeout retry
      this.logger.log('Visiting homepage to establish session')
      await this.gotoWithRetry(page, baseUrl)
      await randomDelay(page, 5000, 5000)

      // ─── PHASE 1: collect product entries from API catalog ────────────────────
      this.logger.log('Phase 1: collecting product entries from API...')
      const productEntries: ProductEntry[] = []

      await this.collectFromApi(
        page, baseUrl, 'vino', 'Still wines', false, productEntries, checkpointCallbacks,
      )
      await this.collectFromApi(
        page, baseUrl, 'shampanskoe_i_igristoe_vino', 'Sparkling wines', true, productEntries, checkpointCallbacks,
      )

      this.logger.log(`Phase 1 complete: ${productEntries.length} products collected`)

      // ─── PHASE 2: visit each product page for full characteristics ────────────
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

  // ─── Phase 1: collect product entries from API catalog ────────────────────────

  private async collectFromApi(
    page: Page,
    baseUrl: string,
    category: string,
    label: string,
    isSparkling: boolean,
    outEntries: ProductEntry[],
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<void> {
    this.gotHttpError = false

    await this.gotoWithRetry(page, `${baseUrl}/catalog/${category}/`)
    await randomDelay(page, 5000, 5000)

    if (this.gotHttpError) {
      this.logger.warn(`Got HTTP error on ${label} catalog page, waiting`)
      await randomDelay(page, 30000)
    }

    let pageNum = 1
    const maxPages = process.env.SCRAPER_MAX_PAGES
      ? parseInt(process.env.SCRAPER_MAX_PAGES, 10)
      : null
    const maxGood = this.maxGoodPerPage()

    checkpointCallbacks?.startHeartbeat(category)

    try {
      while (true) {
        if (maxPages && pageNum > maxPages) {
          this.logger.log(`[Phase 1] Reached max pages limit (${maxPages}), stopping ${label}`)
          break
        }

        this.logger.log(`[Phase 1] ${label} page ${pageNum}`)

        const result = await this.fetchApiPage(page, pageNum, category)

        if (result.error) {
          this.logger.warn(`[Phase 1] API error on page ${pageNum}: ${result.error}`)
          break
        }

        if (result.items.length === 0) {
          this.logger.log(`[Phase 1] No more items on ${label} page ${pageNum}, stopping`)
          break
        }

        let addedThisPage = 0
        for (const item of result.items) {
          if (maxGood && addedThisPage >= maxGood) break

          const title = item.title || ''
          if (title.length < 5) continue

          const url = `${baseUrl}${item.url || ''}`
          if (outEntries.some(e => e.url === url)) continue

          const props: Record<string, any> = {}
          for (const p of item.properties || []) props[p.code] = p.value

          const country = props.country?.value || null
          const color = props.color?.value || null
          const sugarType = props.sugarType?.value || null
          const year = props.year || null
          const volume = props.netVolume || null
          const region = props.region?.value || null
          const manufacturer = props.manufacturer?.translate || props.manufacturer?.value || null
          const grapes = (props.grapeContent || []).map((g: any) => g.grape).filter(Boolean)
          // Description from API (free-text notes), if present.
          const apiDescription =
            (typeof item.description === 'string' && item.description) ||
            props.description?.value ||
            props.annotation?.value ||
            props.text?.value ||
            null

          const basePrice = item.price?.base?.price
          const piecePrice = item.price?.piece?.price
          const discountValue = item.price?.discount?.discountValue
          const discountType = item.price?.discount?.discountType

          let oldPrice: number | undefined = basePrice
          let currentPrice: number | undefined = piecePrice

          if (discountValue && discountType === 'PERCENT' && currentPrice) {
            oldPrice = Math.round(currentPrice / (1 - discountValue / 100))
          }

          const imagePreview =
            item.media?.imagePreview ??
            item.media?.image ??
            item.media?.src ??
            item.previewPicture ??
            item.picture ??
            item.images?.[0]?.src ??
            item.images?.[0]?.url ??
            null
          const imageUrl = imagePreview
            ? (imagePreview.startsWith('http') ? imagePreview : `https://static.simplewine.ru${imagePreview}@x400?fmt=webp`)
            : undefined

          outEntries.push({
            url,
            externalId: item.id?.toString(),
            title,
            imageUrl,
            currentPrice,
            oldPrice: oldPrice !== currentPrice ? oldPrice : undefined,
            isSparkling,
            country,
            color,
            sugarType,
            year,
            volume,
            region,
            manufacturer,
            grapes,
            description: apiDescription,
            basePrice,
            piecePrice,
            discountValue,
            discountType,
            showDiscount: item.price?.showDiscountPercent,
            ratings: item.ratings,
            reviewsCount: item.reviewsCount,
          })
          addedThisPage++
        }

        this.logger.log(
          `[Phase 1] ${label} page ${pageNum}: ${result.items.length} items, added ${addedThisPage}${maxGood ? ` (capped at ${maxGood})` : ''}, total collected: ${outEntries.length}`,
        )

        await checkpointCallbacks?.saveCheckpoint(
          category, pageNum, `${baseUrl}/catalog/${category}/`, outEntries.length,
        )

        pageNum++
        await randomDelay(page, 5000)
      }
    } finally {
      checkpointCallbacks?.stopHeartbeat(category)
      await checkpointCallbacks?.saveCheckpoint(category, pageNum, null, outEntries.length)
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
        const chars: Record<string, string> = {}

        // Pattern A: prop items — common on simplewine.ru product pages
        document.querySelectorAll<HTMLElement>(
          '.product-detail__prop, .product-info__prop, .product-char__item, .product-props__item',
        ).forEach(item => {
          const label =
            item.querySelector('[class*="name"], [class*="title"], [class*="label"]')?.textContent?.trim() || ''
          const value =
            item.querySelector('[class*="value"], [class*="val"]')?.textContent?.trim() || ''
          if (label && value) chars[label] = value
        })

        // Pattern B: definition lists
        document.querySelectorAll<HTMLElement>(
          '.product-characteristics dl, .product-props dl, [class*="characteristics"] dl',
        ).forEach(dl => {
          const dts = Array.from(dl.querySelectorAll('dt'))
          const dds = Array.from(dl.querySelectorAll('dd'))
          dts.forEach((dt, idx) => {
            const label = dt.textContent?.trim() || ''
            const value = dds[idx]?.textContent?.trim() || ''
            if (label && value) chars[label] = value
          })
        })

        // Pattern C: table rows
        document.querySelectorAll<HTMLElement>(
          '.product-characteristics tr, [class*="characteristics"] tr',
        ).forEach(row => {
          const cells = row.querySelectorAll('td, th')
          if (cells.length >= 2) {
            const label = cells[0].textContent?.trim() || ''
            const value = cells[1].textContent?.trim() || ''
            if (label && value) chars[label] = value
          }
        })

        // Grape varieties: "Сорт винограда" or "Сорта", strip percentage suffixes
        const grapeRaw =
          chars['Сорт винограда'] ||
          chars['Сорта винограда'] ||
          chars['Сорта'] ||
          chars['Состав'] ||
          ''
        const grapes = grapeRaw
          .split(/[,;]/)
          .map((g: string) => g.replace(/\s*\d+(\.\d+)?%.*$/, '').trim())
          .filter(Boolean)

        const hasCartButton = !!document.querySelector(
          '[class*="add-to-cart"], [class*="cart"], .js-add-to-cart',
        )

        // Description: free-text notes block on the product page.
        let description: string | null = null
        const descEl = document.querySelector<HTMLElement>(
          '[itemprop="description"], .product-detail__description, [class*="description__text"], [class*="product-description"], .product-info__description',
        )
        if (descEl) {
          const t = (descEl.innerText || descEl.textContent || '').replace(/\s+/g, ' ').trim()
          if (t.length >= 40) description = t.slice(0, 4000)
        }

        return { chars, grapes, hasCartButton, description }
      })

      // ── Merge API data with product page characteristics ──────────────────────
      const colorMap: Record<string, string> = {
        'белое': 'WHITE', 'белый': 'WHITE',
        'красное': 'RED', 'красный': 'RED',
        'розовое': 'ROSE', 'розовый': 'ROSE',
        'оранжевое': 'ORANGE', 'оранжевый': 'ORANGE',
      }
      const apiColorMap: Record<string, string> = {
        красное: 'RED', белое: 'WHITE', розовое: 'ROSE',
      }

      const colorFromPage = (pageData.chars['Цвет'] || '').toLowerCase().trim()
      const wineType = entry.isSparkling
        ? 'SPARKLING'
        : colorMap[colorFromPage]
          ?? (entry.color ? apiColorMap[entry.color.toLowerCase()] : undefined)
          ?? 'OTHER'

      // Alcohol — only on product page, not in catalog API
      const alcoholText = pageData.chars['Крепость'] || pageData.chars['Алкоголь'] || ''
      const alcoholMatch = alcoholText.match(/([\d.]+)/)
      const alcohol = alcoholMatch ? parseFloat(alcoholMatch[1]) : null

      // Appellation — only on product page
      const appellation =
        pageData.chars['Аппелласьон'] ||
        pageData.chars['Апелласьон'] ||
        pageData.chars['AOC'] ||
        pageData.chars['Апелляция'] ||
        null

      const volumeText = String(
        pageData.chars['Объем'] || pageData.chars['Объём'] || entry.volume || '',
      )
      const volumeMatch = volumeText.match(/([\d.]+)\s*л/)
      const volumeMl = volumeMatch ? Math.round(parseFloat(volumeMatch[1]) * 1000) : null

      // Prefer page-scraped grapes (may include percentages detail), fall back to API
      const grapes = pageData.grapes.length > 0 ? pageData.grapes : entry.grapes

      return {
        externalId: entry.externalId,
        title: entry.title,
        url: entry.url,
        imageUrl: entry.imageUrl,
        currentPrice: entry.currentPrice,
        oldPrice: entry.oldPrice,
        rawPayload: {
          title: entry.title,
          url: entry.url,
          basePrice: entry.basePrice,
          piecePrice: entry.piecePrice,
          discountValue: entry.discountValue,
          discountType: entry.discountType,
          showDiscount: entry.showDiscount,
          country: pageData.chars['Страна'] || entry.country,
          region: pageData.chars['Регион'] || entry.region,
          appellation,
          color: pageData.chars['Цвет'] || entry.color,
          sugarType:
            pageData.chars['Содержание сахара'] ||
            pageData.chars['Сахар'] ||
            entry.sugarType,
          year:
            pageData.chars['Год урожая'] ||
            pageData.chars['Винтаж'] ||
            entry.year,
          volume: volumeText || null,
          volumeMl,
          alcohol,
          manufacturer:
            pageData.chars['Производитель'] ||
            pageData.chars['Изготовитель'] ||
            entry.manufacturer,
          grapes,
          characteristics: pageData.chars,
          description: pageData.description || entry.description || null,
          wineType,
          hasCartButton: pageData.hasCartButton,
          ratings: entry.ratings,
          reviewsCount: entry.reviewsCount,
        },
      }
    } catch (error) {
      this.logger.error(`Error scraping ${entry.url}: ${error}`)
      return null
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async fetchApiPage(
    page: Page,
    pageNum: number,
    category: string,
    attempt: number = 1,
  ): Promise<{ error: string | null; items: any[] }> {
    this.gotHttpError = false

    const result = await page.evaluate(
      async ({ pageNum, category }) => {
        const url =
          `https://simplewine.ru/platform/api/v1/catalog/${category}` +
          `?pageNumber=${pageNum}&pageSize=33&sort=our_choice&withMeta=1&filter[sale]=1`
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
          if (response.status >= 400 && response.status < 600 && response.status !== 404) {
            return { error: `HTTP ${response.status}`, status: response.status, items: [] }
          }
          const data = await response.json()
          return { error: null, status: response.status, items: data?.data?.items || [] }
        } catch (e: any) {
          return { error: e.message, status: null, items: [] }
        }
      },
      { pageNum, category },
    )

    if (result.error && result.status && result.status >= 400 && result.status !== 404) {
      this.gotHttpError = true
      const backoff = 30000 * Math.pow(2, Math.min(attempt - 1, 3))
      this.logger.warn(
        `Got ${result.error} from API on page ${pageNum}, waiting ${backoff / 1000}s`,
      )
      await page.waitForTimeout(backoff)
      if (attempt < 5) return this.fetchApiPage(page, pageNum, category, attempt + 1)
      return { error: result.error, items: [] }
    }

    return { error: result.error, items: result.items }
  }
}

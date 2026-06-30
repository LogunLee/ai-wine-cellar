import { Injectable } from '@nestjs/common'
import { Browser, BrowserContext, Page } from 'playwright'
import { Store } from '@prisma/client'
import {
  BaseScraper,
  BlockedError,
  RawScrapedOffer,
  ScraperResult,
  ScraperCallbacks,
  ScraperCheckpointCallbacks,
} from './base-scraper'
import { createStealthBrowser, randomDelay } from './stealth-browser'

/** Категория каталога Глобуса: id + путь (нужен в теле BFF-запроса). */
interface GlobusCategory {
  categoryId: number
  urlPath: string
  label: string
}

/**
 * Подкатегории алкоголя. «Вино» (2225632) содержит и тихие, и часть игристого;
 * тип вина определяем по названию. Игристое/шампанское — отдельная категория,
 * её можно добавить в store.configJson.categories, когда понадобится.
 */
const DEFAULT_CATEGORIES: GlobusCategory[] = [
  { categoryId: 2225632, urlPath: '/catalog/alkogol-1225631/vino-2225632/', label: 'Вино' },
]

const BFF_URL = 'https://digitalone.globus.ru/d1-front-bff/api-web/v1/catalog:product-list'
const PER_PAGE = 40
const NON_WINE_RE = /(^|\s)(сидр|пуаре|медовух|глинтвейн)|винный\s+напиток|слабоалкогольн|^напиток\s/i

@Injectable()
export class GlobusScraper extends BaseScraper {
  storeCode = 'globus'

  /** Заголовки сессии, снятые с реального BFF-запроса страницы. */
  private sessionHeaders: Record<string, string> | null = null

  async scrape(
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<ScraperResult> {
    const categories = this.resolveCategories(store)
    const offers: RawScrapedOffer[] = []
    let browser: Browser | null = null
    let context: BrowserContext | null = null
    let page: Page | null = null

    try {
      const { browser: stealthBrowser, contextOptions } = await createStealthBrowser()
      browser = stealthBrowser
      // Минимальный контекст (как у Ленты): лишние Sec-Fetch-*/Sec-CH-UA заголовки
      // от общего хелпера ломают бутстрап Next.js-приложения.
      context = await browser.newContext({
        userAgent: contextOptions.userAgent,
        locale: 'ru-RU',
        timezoneId: 'Europe/Moscow',
      })
      page = await context.newPage()

      await checkpointCallbacks?.saveCheckpoint('init', 0, null, 0)

      this.logger.log('Establishing session (Globus DigitalOne BFF)...')
      await this.establishSession(page, categories[0].urlPath)
      if (!this.sessionHeaders) {
        throw new BlockedError('Не удалось получить заголовки DigitalOne BFF (гео-блок/VPN? нужен RU IP)')
      }

      const maxPages = process.env.SCRAPER_MAX_PAGES ? parseInt(process.env.SCRAPER_MAX_PAGES, 10) : null

      for (const cat of categories) {
        const catOffers = await this.collectCategory(page, cat, store, jobId, callbacks, checkpointCallbacks, maxPages)
        offers.push(...catOffers)
      }

      this.logger.log(`Total discounted offers collected: ${offers.length}`)
    } catch (error) {
      this.logger.error(`Scraping error: ${error}`)
      throw error
    } finally {
      if (browser) await browser.close()
    }

    return { offers }
  }

  // ─── Session ──────────────────────────────────────────────────────────────────

  private async establishSession(page: Page, urlPath: string): Promise<void> {
    page.on('request', (req) => {
      if (/d1-front-bff\/api-web/.test(req.url()) && !this.sessionHeaders) {
        const clean = { ...req.headers() }
        delete clean['content-length']
        delete clean['host']
        delete clean['accept-encoding']
        clean['content-type'] = 'application/json'
        this.sessionHeaders = clean
        this.logger.log('Captured DigitalOne BFF headers')
      }
    })

    await this.gotoWithRetry(page, `https://online.globus.ru${urlPath.replace(/\/$/, '')}`)
    for (let i = 0; i < 8 && !this.sessionHeaders; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
      await page.waitForTimeout(2000)
    }
  }

  // ─── Category collection ────────────────────────────────────────────────────────

  private async collectCategory(
    page: Page,
    cat: GlobusCategory,
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
    maxPages?: number | null,
  ): Promise<RawScrapedOffer[]> {
    const checkpointKey = `cat-${cat.categoryId}`
    const collected: RawScrapedOffer[] = []
    const maxGood = this.maxGoodPerPage()

    checkpointCallbacks?.startHeartbeat(checkpointKey)
    const startPage = await this.resolveStartPage(checkpointCallbacks, checkpointKey)
    let pageNum = startPage
    try {
      while (true) {
        if (maxPages && pageNum > maxPages) {
          this.logger.log(`[${cat.label}] reached SCRAPER_MAX_PAGES (${maxPages}), stopping`)
          break
        }

        const result = await this.fetchCatalogPage(page, cat, pageNum)
        if (result.error) {
          const netErr = /network|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|socket|EAI_AGAIN|terminated|aborted/i.test(result.error)
          if (netErr) {
            // Сеть пропала/сменилась (VPN): ждём восстановления и повторяем ту же страницу.
            if (await this.waitForConnectivity()) continue
            throw new Error(`[${cat.label}] нет сети на стр.${pageNum} — возобновлю с чекпойнта`)
          }
          // HTTP/BFF ошибка (429/5xx/403 после рефреша) — это блок, не конец каталога.
          throw new BlockedError(`[${cat.label}] BFF ошибка на стр.${pageNum}: ${result.error} — вероятна блокировка/VPN`)
        }
        if (result.items.length === 0) {
          // Пустая ПЕРВАЯ страница каталога = блок, а не пустой каталог.
          if (pageNum === 1) {
            throw new BlockedError(`[${cat.label}] пустая первая страница — вероятна блокировка/VPN (0 вин)`)
          }
          break
        }

        let added = 0
        for (const item of result.items) {
          if (maxGood && added >= maxGood) break
          const offer = this.buildOffer(item)
          if (offer) {
            collected.push(offer)
            added++
          }
        }

        this.logger.log(
          `[${cat.label}] page ${pageNum}: ${result.items.length} items, ${added} discounted, total so far ${collected.length}`,
        )

        if (callbacks && added > 0) {
          const pageOffers = collected.slice(collected.length - added)
          const r = await callbacks.saveAndNormalize(pageOffers, store.id, jobId)
          this.logger.log(`Saved: created=${r.created}, updated=${r.updated}, normalized=${r.normalized}`)
        }

        await checkpointCallbacks?.saveCheckpoint(checkpointKey, pageNum, null, collected.length)

        // последняя страница каталога — товаров меньше, чем размер страницы
        if (result.items.length < PER_PAGE) break

        pageNum++
        await randomDelay(page, 5000, 3000)
      }
    } finally {
      checkpointCallbacks?.stopHeartbeat(checkpointKey)
      await checkpointCallbacks?.saveCheckpoint(checkpointKey, pageNum, null, collected.length)
    }

    this.logger.log(`[${cat.label}] complete: ${collected.length} discounted offers`)
    return collected
  }

  private async fetchCatalogPage(
    page: Page,
    cat: GlobusCategory,
    pageNum: number,
    attempt = 1,
  ): Promise<{ error: string | null; items: any[] }> {
    const res = await page.evaluate(
      async ({ url, headers, categoryId, urlPath, pageNum, perPage }) => {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({
              url: urlPath,
              category_id: categoryId,
              sort: 'default',
              include: ['category', 'products'],
              pagination: { per_page: perPage, page: pageNum },
              is_tag: false,
              is_edlp: false,
            }),
          })
          if (r.status >= 400 && r.status < 600) return { error: `HTTP ${r.status}`, status: r.status, items: [] }
          const data = await r.json()
          return { error: null, status: r.status, items: data?.data?.products?.items || [] }
        } catch (e: any) {
          return { error: e.message, status: null, items: [] }
        }
      },
      { url: BFF_URL, headers: this.sessionHeaders!, categoryId: cat.categoryId, urlPath: cat.urlPath, pageNum, perPage: PER_PAGE },
    )

    if ((res.status === 401 || res.status === 403) && attempt <= 2) {
      this.logger.warn(`Session expired (${res.status}), refreshing...`)
      this.sessionHeaders = null
      await this.establishSession(page, cat.urlPath)
      if (this.sessionHeaders) return this.fetchCatalogPage(page, cat, pageNum, attempt + 1)
    }

    return { error: res.error, items: res.items }
  }

  // ─── Mapping ────────────────────────────────────────────────────────────────────

  /** Строит offer из товара. null, если не скидка или не вино. */
  private buildOffer(item: any): RawScrapedOffer | null {
    const priceKop = item?.price ?? item?.order_price
    const costKop = item?.cost // базовая (старая) цена; null, когда скидки нет
    if (!priceKop || priceKop <= 0) return null
    if (!costKop || costKop <= priceKop) return null // настоящая скидка = cost > price

    const currentPrice = Math.round(priceKop) / 100
    const oldPrice = Math.round(costKop) / 100

    const nameRaw: string = item?.name_optional || ''
    const name = nameRaw.replace(/[\s,]+$/, '').trim() // убрать хвостовую запятую/пробел
    if (name.length < 3) return null
    if (NON_WINE_RE.test(name)) return null

    const volumeText: string | null = item?.name_required || null
    const id = item?.id
    const rel: string | null = item?.url || null
    const url = rel ? `https://online.globus.ru${rel}` : 'https://online.globus.ru/catalog/alkogol-1225631/vino-2225632'
    const img = item?.preview_image || item?.preview_images?.[0] || undefined

    const promoPct = (item?.promotions || []).map((p: any) => p?.discount_percent).find((x: any) => x != null)
    const discountPercent = typeof promoPct === 'number' ? promoPct : undefined

    const country = (item?.badges || []).find((b: any) => /country/i.test(b?.code || ''))?.values?.[0] ?? null
    const wineType = this.wineTypeFromName(name)
    const volumeMl = this.parseVolumeMl(volumeText, name)
    const inStock = (item?.quantity_max ?? 0) > 0 && item?.active !== false

    return {
      externalId: id != null ? String(id) : undefined,
      title: name,
      url,
      imageUrl: img,
      currentPrice,
      oldPrice,
      discountPercent,
      availability: inStock ? undefined : 'out_of_stock',
      rawPayload: {
        title: name,
        wineType,
        country,
        volume: volumeText,
        volumeMl,
        badgeDiscount: (item?.promotions || []).map((p: any) => p?.badge_text).find(Boolean) ?? null,
        priceStyle: item?.price_representation?.style ?? null,
        quantityMax: item?.quantity_max ?? null,
      },
    }
  }

  private wineTypeFromName(name: string): 'RED' | 'WHITE' | 'ROSE' | 'SPARKLING' | 'FORTIFIED' | 'OTHER' {
    const n = name.toLowerCase()
    if (/игрист|шампан|просекко|cava|ламбруско/.test(n)) return 'SPARKLING'
    if (/портвейн|херес|мадер|вермут|крепл/.test(n)) return 'FORTIFIED'
    if (/красн/.test(n)) return 'RED'
    if (/бел(ое|ый|ого|ое)/.test(n) || /\bбел/.test(n)) return 'WHITE'
    if (/розов/.test(n)) return 'ROSE'
    if (/оранж/.test(n)) return 'OTHER'
    return 'OTHER'
  }

  private parseVolumeMl(volumeText: string | null, name: string): number | null {
    const src = `${volumeText ?? ''} ${name}`
    const l = src.match(/([\d.,]+)\s*л\b/i)
    if (l) {
      const num = parseFloat(l[1].replace(',', '.'))
      if (!isNaN(num)) return Math.round(num * 1000)
    }
    const ml = src.match(/(\d+)\s*мл\b/i)
    if (ml) return parseInt(ml[1], 10)
    return null
  }

  private resolveCategories(store: Store): GlobusCategory[] {
    const cfg = (store.configJson as any)?.categories
    if (Array.isArray(cfg) && cfg.length > 0) {
      const valid = cfg.filter((c) => typeof c?.categoryId === 'number' && typeof c?.urlPath === 'string')
      if (valid.length > 0) {
        return valid.map((c) => ({ categoryId: c.categoryId, urlPath: c.urlPath, label: c.label ?? String(c.categoryId) }))
      }
    }
    return DEFAULT_CATEGORIES
  }
}

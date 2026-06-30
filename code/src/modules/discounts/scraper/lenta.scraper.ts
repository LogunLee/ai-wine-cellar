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

/** Категория каталога Лента → тип вина для нормализатора. */
interface LentaCategory {
  id: number
  label: string
  wineType: 'RED' | 'WHITE' | 'ROSE' | 'SPARKLING' | 'FORTIFIED' | 'OTHER'
}

/**
 * Подкатегории «Вино» (родитель 22541) на lenta.com. Каждая даёт надёжный тип
 * вина, поэтому скрапим по цветам, а не общий список. Игристое — отдельная
 * верхнеуровневая категория; её id добавляется в store.configJson.categories,
 * когда станет известен (код менять не нужно).
 */
const DEFAULT_CATEGORIES: LentaCategory[] = [
  { id: 22543, label: 'Красное', wineType: 'RED' },
  { id: 22544, label: 'Белое', wineType: 'WHITE' },
  { id: 22545, label: 'Розовое', wineType: 'ROSE' },
  { id: 22546, label: 'Крепленое', wineType: 'FORTIFIED' },
  // Игристое — отдельная верхнеуровневая категория (вся целиком SPARKLING).
  { id: 17042, label: 'Шампанское и игристое', wineType: 'SPARKLING' },
]

const API_LIMIT = 40

/**
 * Не-вино, которое Лента кладёт в категорию игристого (и иногда в крепленое):
 * сидр, пуаре, медовуха, винные/слабоалкогольные напитки. Для винного
 * приложения это мусор — отсекаем по названию.
 */
const NON_WINE_RE = /(^|\s)(сидр|пуаре|медовух|глинтвейн)|винный\s+напиток|слабоалкогольн|^напиток\s/i

@Injectable()
export class LentaScraper extends BaseScraper {
  storeCode = 'lenta'

  /** Заголовки сессии (sessiontoken, x-domain, …), снятые с реального запроса. */
  private sessionHeaders: Record<string, string> | null = null

  async scrape(
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
  ): Promise<ScraperResult> {
    const baseUrl = store.baseUrl || 'https://lenta.com'
    const categories = this.resolveCategories(store)
    const offers: RawScrapedOffer[] = []
    let browser: Browser | null = null
    let context: BrowserContext | null = null
    let page: Page | null = null

    try {
      const { browser: stealthBrowser, contextOptions } = await createStealthBrowser()
      browser = stealthBrowser
      // Минимальный контекст: общий createStealthBrowser задаёт Sec-Fetch-*/Sec-CH-UA
      // заголовки на ВСЕ запросы, из-за чего Angular-приложение Ленты не выполняет
      // api-gateway вызовы (не бутстрапится). Без них всё работает.
      context = await browser.newContext({
        userAgent: contextOptions.userAgent,
        locale: 'ru-RU',
        timezoneId: 'Europe/Moscow',
      })
      page = await context.newPage()

      await checkpointCallbacks?.saveCheckpoint('init', 0, null, 0)

      // Установить сессию: пройти QRATOR-challenge и снять заголовки api-gateway.
      this.logger.log('Establishing session (QRATOR + guest auth)...')
      await this.establishSession(page, baseUrl)

      if (!this.sessionHeaders) {
        throw new BlockedError('Не удалось снять заголовки api-gateway (QRATOR не пройден — блокировка/VPN?)')
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

  /** Открывает каталог вина, ждёт прохождения QRATOR и снимает заголовки сессии. */
  private async establishSession(page: Page, baseUrl: string): Promise<void> {
    page.on('request', (req) => {
      const url = req.url()
      const h = req.headers()
      if (/\/api-gateway\/v1\//.test(url) && h['sessiontoken'] && !this.sessionHeaders) {
        const clean = { ...h }
        delete clean['content-length']
        delete clean['host']
        delete clean['accept-encoding']
        clean['content-type'] = 'application/json'
        this.sessionHeaders = clean
        this.logger.log('Captured api-gateway session headers')
      }
    })

    await this.gotoWithRetry(page, `${baseUrl}/catalog/vino-22541/`)
    // дать время QRATOR + гостевой авторизации + первым api-gateway вызовам
    for (let i = 0; i < 8 && !this.sessionHeaders; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
      await page.waitForTimeout(2000)
    }
  }

  // ─── Category collection ────────────────────────────────────────────────────────

  private async collectCategory(
    page: Page,
    cat: LentaCategory,
    store: Store,
    jobId: string,
    callbacks?: ScraperCallbacks,
    checkpointCallbacks?: ScraperCheckpointCallbacks,
    maxPages?: number | null,
  ): Promise<RawScrapedOffer[]> {
    const checkpointKey = `cat-${cat.id}`
    const collected: RawScrapedOffer[] = []
    const maxGood = this.maxGoodPerPage()

    checkpointCallbacks?.startHeartbeat(checkpointKey)
    let pageNum = await this.resolveStartPage(checkpointCallbacks, checkpointKey, 0)
    try {
      let total = Infinity
      while (pageNum * API_LIMIT < total) {
        if (maxPages && pageNum >= maxPages) {
          this.logger.log(`[${cat.label}] reached SCRAPER_MAX_PAGES (${maxPages}), stopping`)
          break
        }

        const offset = pageNum * API_LIMIT
        const result = await this.fetchCatalogPage(page, cat.id, offset)
        if (result.error) {
          const netErr = /network|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|socket|EAI_AGAIN|terminated|aborted/i.test(result.error)
          if (netErr) {
            if (await this.waitForConnectivity()) continue // повтор той же страницы
            throw new Error(`[${cat.label}] нет сети на offset ${offset} — возобновлю с чекпойнта`)
          }
          throw new BlockedError(`[${cat.label}] API ошибка на offset ${offset}: ${result.error} — вероятна блокировка/VPN`)
        }
        if (result.items.length === 0) {
          if (pageNum === 0) {
            throw new BlockedError(`[${cat.label}] пустая первая страница — вероятна блокировка/VPN (0 вин)`)
          }
          break
        }
        total = result.total ?? total

        let added = 0
        for (const item of result.items) {
          if (maxGood && added >= maxGood) break
          const offer = this.buildOffer(item, cat)
          if (offer) {
            collected.push(offer)
            added++
          }
        }

        this.logger.log(
          `[${cat.label}] offset ${offset}: ${result.items.length} items, ${added} discounted, total so far ${collected.length}/${total}`,
        )

        // сохраняем и нормализуем пачкой по странице
        if (callbacks && collected.length > 0) {
          const pageOffers = collected.slice(collected.length - added)
          if (pageOffers.length > 0) {
            const r = await callbacks.saveAndNormalize(pageOffers, store.id, jobId)
            this.logger.log(`Saved: created=${r.created}, updated=${r.updated}, normalized=${r.normalized}`)
          }
        }

        await checkpointCallbacks?.saveCheckpoint(checkpointKey, pageNum + 1, null, collected.length)
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

  /** Один запрос catalog/items внутри сессии браузера (с заголовками сессии). */
  private async fetchCatalogPage(
    page: Page,
    categoryId: number,
    offset: number,
    attempt = 1,
  ): Promise<{ error: string | null; items: any[]; total: number | null }> {
    const res = await page.evaluate(
      async ({ headers, categoryId, offset, limit }) => {
        try {
          const r = await fetch('/api-gateway/v1/catalog/items', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              categoryId,
              filters: { checkbox: [], multicheckbox: [], range: [] },
              sort: { type: 'popular', order: 'desc' },
              limit,
              offset,
            }),
          })
          if (r.status >= 400 && r.status < 600) return { error: `HTTP ${r.status}`, status: r.status, items: [], total: null }
          const data = await r.json()
          return { error: null, status: r.status, items: data?.items || [], total: data?.total ?? null }
        } catch (e: any) {
          return { error: e.message, status: null, items: [], total: null }
        }
      },
      { headers: this.sessionHeaders!, categoryId, offset, limit: API_LIMIT },
    )

    // 401/403 — сессия протухла: обновляем заголовки перезагрузкой и повторяем.
    if (res.status === 401 || res.status === 403) {
      if (attempt <= 2) {
        this.logger.warn(`Session expired (${res.status}), refreshing...`)
        this.sessionHeaders = null
        await this.gotoWithRetry(page, 'https://lenta.com/catalog/vino-22541/')
        for (let i = 0; i < 8 && !this.sessionHeaders; i++) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
          await page.waitForTimeout(2000)
        }
        if (this.sessionHeaders) return this.fetchCatalogPage(page, categoryId, offset, attempt + 1)
      }
    }

    return { error: res.error, items: res.items, total: res.total }
  }

  // ─── Mapping ────────────────────────────────────────────────────────────────────

  /** Строит offer из товара каталога. Возвращает null, если скидки нет. */
  private buildOffer(item: any, cat: LentaCategory): RawScrapedOffer | null {
    const priceKop = item?.prices?.price
    const oldKop = item?.prices?.priceRegular
    if (!priceKop || priceKop <= 0) return null

    const currentPrice = Math.round(priceKop) / 100
    const oldPrice = oldKop ? Math.round(oldKop) / 100 : null

    // Только реальные скидки (цена ниже регулярной).
    if (!oldPrice || oldPrice <= currentPrice) return null

    const name: string = item?.display?.name || item?.name || ''
    if (name.trim().length < 3) return null
    if (NON_WINE_RE.test(name)) return null // сидр/пуаре/медовуха/винные напитки

    const pkg: string | null = item?.display?.package || null
    const id = item?.id
    const slug: string | null = item?.slug || null
    const url = slug && id ? `https://lenta.com/product/${slug}-${id}/` : `https://lenta.com/catalog/vino-22541/`

    const img =
      item?.images?.[0]?.medium ||
      item?.images?.[0]?.large ||
      item?.images?.[0]?.preview ||
      item?.images?.[0]?.original ||
      undefined

    const discTitle: string | null = item?.badges?.discount?.[0]?.title || null
    const discMatch = discTitle?.match(/(\d+)/)
    const discountPercent = discMatch ? parseInt(discMatch[1], 10) : undefined

    const volumeMl = this.parseVolumeMl(pkg, name)
    const yearMatch = name.match(/\b(19|20)\d{2}\b/)

    return {
      externalId: id != null ? String(id) : undefined,
      title: name,
      url,
      imageUrl: img,
      currentPrice,
      oldPrice,
      discountPercent,
      availability: item?.features?.isBlockedForSale ? 'out_of_stock' : undefined,
      rawPayload: {
        title: name,
        wineType: cat.wineType,
        volume: pkg,
        volumeMl,
        year: yearMatch ? yearMatch[0] : null,
        package: pkg,
        badgeDiscount: discTitle,
        isAlcohol: item?.features?.isAlcohol ?? null,
        isLoyaltyCardPrice: item?.prices?.isLoyaltyCardPrice ?? null,
        count: item?.count ?? null,
      },
    }
  }

  private parseVolumeMl(pkg: string | null, name: string): number | null {
    const src = `${pkg ?? ''} ${name}`
    const l = src.match(/([\d.,]+)\s*л\b/i)
    if (l) {
      const n = parseFloat(l[1].replace(',', '.'))
      if (!isNaN(n)) return Math.round(n * 1000)
    }
    const ml = src.match(/(\d+)\s*мл\b/i)
    if (ml) return parseInt(ml[1], 10)
    return null
  }

  /** Категории из store.configJson.categories (если заданы) либо дефолтные. */
  private resolveCategories(store: Store): LentaCategory[] {
    const cfg = (store.configJson as any)?.categories
    if (Array.isArray(cfg) && cfg.length > 0) {
      const valid = cfg.filter((c) => typeof c?.id === 'number' && typeof c?.wineType === 'string')
      if (valid.length > 0) {
        return valid.map((c) => ({ id: c.id, label: c.label ?? String(c.id), wineType: c.wineType }))
      }
    }
    return DEFAULT_CATEGORIES
  }
}

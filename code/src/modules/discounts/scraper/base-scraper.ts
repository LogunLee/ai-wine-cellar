import { Store } from '@prisma/client'
import type { Page, Response } from 'playwright'
import { randomDelay } from './stealth-browser'

export interface RawScrapedOffer {
  externalId?: string
  title: string
  url: string
  imageUrl?: string
  currentPrice?: number
  oldPrice?: number
  discountPercent?: number
  availability?: string
  rawPayload: unknown
}

export interface ScraperResult {
  offers: RawScrapedOffer[]
}

/** Persistent product-card characteristics (from wine_card cache). */
export interface CachedCard {
  grapes: string[]
  alcohol: number | null
  appellation: string | null
  country: string | null
  region: string | null
  color: string | null
  description: string | null
  payloadJson: any
}

/** Characteristics + identity to persist into the wine_card cache. */
export interface CardToSave {
  cardKey: string
  externalId: string | null
  url: string
  grapes: string[]
  alcohol: number | null
  appellation: string | null
  country: string | null
  region: string | null
  color: string | null
  description: string | null
  payloadJson: any
}

export interface ScraperCallbacks {
  saveAndNormalize: (offers: RawScrapedOffer[], storeId: string, jobId: string) => Promise<{ created: number; updated: number; normalized: number }>
  /** Bulk-load cached product cards by key (externalId or url). */
  getCachedCards?: (storeId: string, keys: string[]) => Promise<Map<string, CachedCard>>
  /** Upsert one product card into the persistent cache. */
  saveCard?: (storeId: string, card: CardToSave) => Promise<void>
}

/** Minimal Phase-1 entry shape required for cache-aware Phase 2. */
export interface CacheableEntry {
  externalId?: string
  url: string
  title?: string
  imageUrl?: string
  currentPrice?: number
  oldPrice?: number
}

export interface ScraperCheckpointCallbacks {
  saveCheckpoint: (category: string, pageNum: number, lastUrl: string | null, offersCollected: number) => Promise<void>
  /** Read a previously saved checkpoint — used by scrapers to resume after a crash. */
  getCheckpoint: (category: string) => Promise<{ pageNum: number; lastUrl: string | null; offersCollected: number } | null>
  startHeartbeat: (category: string) => void
  stopHeartbeat: (category: string) => void
}

export abstract class BaseScraper {
  abstract storeCode: string
  protected readonly logger = new (require('@nestjs/common').Logger)(this.constructor.name)
  protected readonly PAGE_RECREATE_INTERVAL = 15
  protected readonly OPERATION_TIMEOUT = 120000

  abstract scrape(store: Store, jobId: string, callbacks?: ScraperCallbacks, checkpointCallbacks?: ScraperCheckpointCallbacks): Promise<ScraperResult>

  /**
   * Robust navigation with escalating timeouts and backoff.
   *
   * Why not tiny timeouts (2/5/10s): under parallel scraping the OS DNS resolver
   * and the network are saturated, so `domcontentloaded` legitimately needs
   * 5-12s. A 2s timeout aborts the in-flight navigation; rapid abort+retry leaves
   * Chromium's network stack half-torn-down and produces `ERR_NAME_NOT_RESOLVED`.
   * A generous first attempt means we almost never retry, which avoids the DNS
   * storm entirely.
   *
   * DNS/connection errors get a longer cooldown between attempts so the resolver
   * can recover before we hit it again.
   *
   * Returns the Response, or null if all attempts failed (caller decides what to do).
   */
  protected async gotoWithRetry(
    page: Page,
    url: string,
    opts?: { timeouts?: number[]; waitUntil?: 'domcontentloaded' | 'load' | 'commit' },
  ): Promise<Response | null> {
    const timeouts = opts?.timeouts ?? [12000, 30000, 60000]
    const waitUntil = opts?.waitUntil ?? 'domcontentloaded'

    for (let attempt = 0; attempt < timeouts.length; attempt++) {
      try {
        return await page.goto(url, { waitUntil, timeout: timeouts[attempt] })
      } catch (err) {
        const msg = String(err)
        const isNetError =
          /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_SOCKET/i.test(
            msg,
          )

        if (attempt < timeouts.length - 1) {
          // DNS/connection failures need a real cooldown; plain timeouts a short one.
          const backoff = isNetError ? 6000 + attempt * 4000 : 1500 + attempt * 1500
          this.logger.warn(
            `goto ${attempt + 1}/${timeouts.length} failed for ${url} ` +
              `(${isNetError ? 'network/DNS error' : 'timeout'}), retrying in ${Math.round(backoff / 1000)}s`,
          )
          await page.waitForTimeout(backoff)
        } else {
          this.logger.error(`goto failed after ${timeouts.length} attempts for ${url}: ${err}`)
        }
      }
    }

    return null
  }

  /** Cache key for a product: stable externalId when present, else the URL. */
  protected cacheKey(entry: { externalId?: string | null; url: string }): string {
    return entry.externalId && entry.externalId.length > 0 ? entry.externalId : entry.url
  }

  /**
   * Debug cap: max number of valid ("good") products to collect from a single
   * catalog page in Phase 1. Limits both the offers produced and the product
   * cards visited. null = no limit (production).
   */
  protected maxGoodPerPage(): number | null {
    const raw = process.env.SCRAPER_MAX_GOOD_PER_PAGE
    if (!raw) return null
    const n = parseInt(raw, 10)
    return isNaN(n) || n <= 0 ? null : n
  }

  /**
   * Price is NEVER cached — it must be refreshed from the catalog list on every
   * run. Strip every price-related key from a payload before it is persisted into
   * (or rebuilt from) wine_card, so a stale price can never leak through the cache.
   */
  protected stripPriceFields(payload: any): any {
    if (!payload || typeof payload !== 'object') return payload
    const PRICE_KEYS = [
      'price', 'old_price', 'oldPrice', 'currentPrice', 'current_price',
      'basePrice', 'piecePrice', 'priceValue', 'cost',
      'discount', 'discountValue', 'discountType', 'discountPercent', 'showDiscount',
      'volumePrices', 'fullText', 'sale',
    ]
    const clone: Record<string, any> = { ...payload }
    for (const k of PRICE_KEYS) delete clone[k]
    return clone
  }

  /** Build an offer from a cached card + fresh Phase-1 prices, without visiting the page. */
  protected buildOfferFromCache(params: {
    externalId?: string
    title: string
    url: string
    imageUrl?: string
    currentPrice?: number
    oldPrice?: number
    payloadJson: any
  }): RawScrapedOffer {
    return {
      externalId: params.externalId,
      title: params.title,
      url: params.url,
      imageUrl: params.imageUrl,
      // Price always comes fresh from the catalog list (Phase 1), never the cache.
      currentPrice: params.currentPrice,
      oldPrice: params.oldPrice,
      rawPayload: this.stripPriceFields(params.payloadJson ?? {}),
    }
  }

  /** True when extracted characteristics are worth caching (something real was found). */
  protected hasMeaningfulCard(f: {
    grapes: string[]; alcohol: number | null; appellation: string | null
    country: string | null; region: string | null; description?: string | null
  }): boolean {
    return f.grapes.length > 0 || f.alcohol != null || !!f.appellation || !!f.country || !!f.region || !!f.description
  }

  /** Pull the cacheable characteristics out of a freshly-scraped offer payload. */
  protected extractCardFields(payload: any): Omit<CardToSave, 'cardKey' | 'externalId' | 'url' | 'payloadJson'> {
    return {
      grapes: Array.isArray(payload?.grapes) ? payload.grapes : [],
      alcohol: typeof payload?.alcohol === 'number' ? payload.alcohol : null,
      appellation: payload?.appellation ?? null,
      country: payload?.country ?? null,
      region: payload?.region ?? null,
      color: payload?.color ?? null,
      description: (typeof payload?.description === 'string' && payload.description.trim().length > 0)
        ? payload.description.trim()
        : null,
    }
  }

  /**
   * Cache-aware Phase 2 for two-phase scrapers.
   *
   * For each Phase-1 entry: if its characteristics are already cached, build the
   * offer from cache + fresh list prices WITHOUT visiting the product page; only
   * cache misses navigate. Freshly scraped characteristics are written to the
   * cache. Inter-product delay is applied only after a real navigation (a miss).
   */
  protected async runCachedPhase2<E extends CacheableEntry>(
    page: Page,
    entries: E[],
    storeId: string,
    jobId: string,
    callbacks: ScraperCallbacks | undefined,
    scrapeOne: (page: Page, entry: E) => Promise<RawScrapedOffer | null>,
    betweenMissesDelayMs = 0,
  ): Promise<RawScrapedOffer[]> {
    const offers: RawScrapedOffer[] = []
    const keys = entries.map((e) => this.cacheKey(e))
    const cache = (await callbacks?.getCachedCards?.(storeId, keys)) ?? new Map<string, CachedCard>()

    let hits = 0
    let misses = 0

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const key = this.cacheKey(entry)
      // Only trust the cache when we also have a fresh list price for this entry.
      // If Phase 1 didn't capture a price, fall back to visiting the page so the
      // offer still gets a valid price (correctness over speed).
      const cached = entry.currentPrice != null ? cache.get(key) : undefined
      let offer: RawScrapedOffer | null = null

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
          hits++
          this.logger.log(`[Phase 2] ${i + 1}/${entries.length}: CACHE HIT ${entry.url}`)
        } else {
          this.logger.log(`[Phase 2] ${i + 1}/${entries.length}: scraping ${entry.url}`)
          offer = await scrapeOne(page, entry)
          misses++
          if (offer) {
            const fields = this.extractCardFields(offer.rawPayload)
            // Cache only when we actually extracted something — avoids locking in
            // a failed extraction (those products get retried on the next run).
            if (this.hasMeaningfulCard(fields)) {
              await callbacks?.saveCard?.(storeId, {
                cardKey: key,
                externalId: entry.externalId ?? null,
                url: entry.url,
                payloadJson: this.stripPriceFields(offer.rawPayload),
                ...fields,
              })
            }
          }
        }
      } catch (err) {
        this.logger.error(`[Phase 2] failed ${entry.url}: ${err}`)
      }

      if (offer) {
        offers.push(offer)
        if (callbacks) {
          const r = await callbacks.saveAndNormalize([offer], storeId, jobId)
          this.logger.log(`Saved: created=${r.created}, updated=${r.updated}, normalized=${r.normalized}`)
        }
      }

      if (!cached && betweenMissesDelayMs > 0 && i < entries.length - 1) {
        await randomDelay(page, betweenMissesDelayMs, Math.floor(betweenMissesDelayMs / 3))
      }
    }

    this.logger.log(`[Phase 2] complete: cacheHits=${hits}, scraped=${misses}, totalOffers=${offers.length}`)
    return offers
  }
}

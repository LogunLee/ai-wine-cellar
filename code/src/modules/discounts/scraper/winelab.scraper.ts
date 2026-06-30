import { Injectable } from '@nestjs/common'
import { Browser, BrowserContext, Page, Response } from 'playwright'
import { Store } from '@prisma/client'
import {
  BaseScraper,
  BlockedError,
  RawScrapedOffer,
  ScraperCallbacks,
  ScraperCheckpointCallbacks,
  ScraperResult,
} from './base-scraper'
import { createStealthBrowser, randomDelay } from './stealth-browser'

@Injectable()
export class WineLabScraper extends BaseScraper {
  storeCode = 'winelab'

  private readonly batchSize = 20
  private readonly maxServerErrorAttempts = 5
  private readonly maxCategoryLoadIterations = 1000
  private readonly maxConsecutiveNoCodeGrowth = 5

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
    let opsCount = 0
    let heartbeatStarted = false

    try {
      const { browser: stealthBrowser, contextOptions } = await createStealthBrowser()

      browser = stealthBrowser
      context = await browser.newContext(contextOptions)

      const setupPage = async (): Promise<Page> => {
        if (page) {
          await page.close()
        }

        page = await context!.newPage()
        opsCount = 0

        page.on('request', (request) => {
          const url = request.url()

          if (this.shouldLogWineLabNetworkUrl(url)) {
            this.logger.log(`WINELAB REQUEST: ${request.method()} ${url}`)
          }
        })

        page.on('response', async (response) => {
          const url = response.url()
          const status = response.status()

          if (this.shouldLogWineLabNetworkUrl(url)) {
            this.logger.log(`WINELAB RESPONSE: ${status} ${url}`)
          }

          if (status >= 500 && url.includes('winelab.ru')) {
            this.logger.warn(`Got HTTP ${status} from ${url}`)
          }
        })

        return page
      }

      page = await setupPage()

      // Save an initial checkpoint immediately so that resumeStalledJobs can
      // detect a crash even if the server goes down during code collection
      // (before any batch checkpoint is written).
      await checkpointCallbacks?.saveCheckpoint('all', 0, null, 0)

      this.logger.log('Visiting homepage to establish session')

      await this.gotoWithServerErrorRetry(page, 'https://www.winelab.ru/', 'Homepage')

      await randomDelay(page, 2000, 1000)
      await this.closeModals(page)

      const catalogCategories = [
        {
          url: 'https://www.winelab.ru/catalog/vino',
          label: 'Still wines',
        },
        {
          url: 'https://www.winelab.ru/catalog/shampanskie-i-igristye-vina',
          label: 'Sparkling wines',
        },
      ]

      const allCodes = new Set<string>()

      for (const category of catalogCategories) {
        const categoryCodes = await this.collectProductCodesFromCategory(
          page,
          category.url,
          category.label,
        )

        this.logger.log(
          `${category.label}: collected ${categoryCodes.length} product codes from category`,
        )

        for (const code of categoryCodes) {
          allCodes.add(code)
        }
      }

      const uniqueCodes = [...allCodes]

      this.logger.log(`Total unique product codes collected from categories: ${uniqueCodes.length}`)

      if (uniqueCodes.length === 0) {
        throw new BlockedError('WineLab: ни одного кода товара из категорий — вероятна блокировка/VPN (пустой каталог)')
      }

      const sparklingUrlPattern = 'shampanskie-i-igristye-vina'

      const wineRegex = /^[\u0412\u0432]\u0438\u043d\u043e/i
      const portRegex = /^[\u041f\u043f]\u043e\u0440\u0442\u0432\u0435\u0439\u043d/i
      const vermouthRegex = /^[\u0412\u0432]\u0435\u0440\u043c\u0443\u0442/i
      const sparklingRegex =
        /[\u0438\u0418]\u0433\u0440\u0438\u0441\u0442\u043e\u0435|[\u0428\u0448]\u0430\u043c\u043f\u0430\u043d\u0441\u043a\u043e\u0435/i

      const isWine = (name: string): boolean => {
        return (
          wineRegex.test(name) ||
          portRegex.test(name) ||
          vermouthRegex.test(name) ||
          sparklingRegex.test(name)
        )
      }

      let batchNum = 0
      let totalFetched = 0
      let totalMatchedWine = 0
      let totalAvailableOffers = 0

      // Read the checkpoint saved from a previous (crashed) run.
      // pageNum > 0 means batches 1..pageNum were already fully processed.
      const savedCp = checkpointCallbacks
        ? await checkpointCallbacks.getCheckpoint('all')
        : null
      const resumeBatchNum = savedCp && savedCp.pageNum > 0 ? savedCp.pageNum : 0
      if (resumeBatchNum > 0) {
        this.logger.log(
          `WineLab: resuming from checkpoint — skipping batches 1..${resumeBatchNum} ` +
          `(already processed in previous run, ${savedCp!.offersCollected} offers saved)`,
        )
      }

      checkpointCallbacks?.startHeartbeat('all')
      heartbeatStarted = true

      for (let i = 0; i < uniqueCodes.length; i += this.batchSize) {
        batchNum++

        // Skip batches that were fully processed before the crash.
        if (batchNum <= resumeBatchNum) {
          this.logger.log(`Batch ${batchNum}: skipping (processed in previous run)`)
          continue
        }

        opsCount++

        if (opsCount >= this.PAGE_RECREATE_INTERVAL) {
          this.logger.log(`Recreating page after ${opsCount} ops, batch=${batchNum}`)

          page = await setupPage()

          await this.gotoWithServerErrorRetry(
            page,
            'https://www.winelab.ru/',
            'Homepage after page recreate',
          )

          await this.closeModals(page)
        }

        const batch = uniqueCodes.slice(i, i + this.batchSize)

        this.logger.log(
          `Batch ${batchNum}: fetching ${batch.length} products ` +
            `(${i + batch.length}/${uniqueCodes.length})`,
        )

        const data = await this.fetchBatchWithRetry(page!, batch, batchNum)

        if (!data || data.error) {
          this.logger.error(`Batch ${batchNum} failed: ${data ? JSON.stringify(data) : 'null'}`)
          continue
        }

        if (!Array.isArray(data)) {
          this.logger.error(
            `Batch ${batchNum} returned unexpected response: ${JSON.stringify(data).slice(0, 1000)}`,
          )

          continue
        }

        totalFetched += data.length

        const batchOffers: RawScrapedOffer[] = []

        let batchMatchedWine = 0
        let batchAvailableOffers = 0
        let batchSkippedWithoutCode = 0
        let batchSkippedNotWine = 0
        let batchSkippedOutOfStock = 0

        for (const p of data) {
          const name = p.name || ''
          const code = p.code?.toString() || null
          const productUrl = p.url || ''
          const stockLevel = p.stock?.stockLevel ?? null
          const stockStatus = p.stock?.stockLevelStatus ?? null
          const volumePrices = p.volumePrices || []

          this.logger.log(
            `Batch ${batchNum} product: ` +
              `code=${code || 'no-code'}, ` +
              `name="${name}", ` +
              `url="${productUrl}", ` +
              `stockLevel=${stockLevel}, ` +
              `stockStatus=${stockStatus}`,
          )

          if (!code) {
            batchSkippedWithoutCode++
            this.logger.log(`Batch ${batchNum} skipped without code: name="${name}"`)
            continue
          }

          if (!isWine(name)) {
            batchSkippedNotWine++
            this.logger.log(`Batch ${batchNum} skipped not wine: code=${code}, name="${name}"`)
            continue
          }

          totalMatchedWine++
          batchMatchedWine++

          const isSparkling = productUrl.includes(sparklingUrlPattern)
          const nameLower = name.toLowerCase()

          let wineType = 'OTHER'

          if (isSparkling) {
            wineType = 'SPARKLING'
          } else if (nameLower.includes('красное')) {
            wineType = 'RED'
          } else if (nameLower.includes('белое')) {
            wineType = 'WHITE'
          } else if (nameLower.includes('розовое')) {
            wineType = 'ROSE'
          } else if (nameLower.includes('игристое') || nameLower.includes('шампанское')) {
            wineType = 'SPARKLING'
          } else if (nameLower.includes('портвейн')) {
            wineType = 'FORTIFIED'
          } else if (nameLower.includes('вермут')) {
            wineType = 'FORTIFIED'
          }

          const volumeMatch = name.match(/(\d+[,.]\d+)\s*л/)

          const volumeMl = volumeMatch
            ? Math.round(parseFloat(volumeMatch[1].replace(',', '.')) * 1000)
            : undefined

          const country = p.country || null
          const categories = p.categories || []
          const region = categories.length > 1 ? categories[1].name : null

          let currentPrice: number | undefined
          let oldPrice: number | undefined

          if (volumePrices.length >= 2) {
            oldPrice = volumePrices[0]?.value
            currentPrice = volumePrices[1]?.value
          } else if (volumePrices.length === 1) {
            currentPrice = volumePrices[0]?.value
          } else {
            currentPrice = p.price?.value ?? undefined
          }

          if (stockLevel === 0) {
            batchSkippedOutOfStock++

            this.logger.log(
              `Batch ${batchNum} skipped out of stock by stockLevel: ` +
                `code=${code}, ` +
                `name="${name}", ` +
                `stockLevel=${stockLevel}, ` +
                `stockStatus=${stockStatus}`,
            )

            continue
          }

          totalAvailableOffers++
          batchAvailableOffers++

          this.logger.log(
            `Batch ${batchNum} accepted offer: ` +
              `code=${code}, ` +
              `name="${name}", ` +
              `stockLevel=${stockLevel}, ` +
              `stockStatus=${stockStatus}, ` +
              `wineType=${wineType}, ` +
              `currentPrice=${currentPrice}, ` +
              `oldPrice=${oldPrice}`,
          )

          const fullUrl = `https://www.winelab.ru${p.url || '/catalog/vino/product/' + p.code + '/'}`
          batchOffers.push({
            externalId: code,
            title: name,
            url: fullUrl,
            imageUrl: (() => {
            const u = p.images?.[0]?.url
            if (!u) return undefined
            return u.startsWith('http') ? u : `https://www.winelab.ru${u}`
          })(),
            currentPrice,
            oldPrice,
            rawPayload: {
              title: name,
              url: p.url,
              code: p.code,
              price: p.price,
              volumePrices: p.volumePrices,
              discount: p.discount,
              country,
              region,
              manufacturer: p.manufacturer,
              countryProduct: p.countryProduct,
              alcoholContent: p.alcoholContent,
              brand: p.brand,
              stickers: p.stickers,
              potentialPromotions: p.potentialPromotions,
              wineType,
              volumeMl,
              categories: categories.map((c: any) => c.name),
              stockLevel,
              stockStatus,
              stock: p.stock,
            },
          })
        }

        // ── Phase 2b: characteristics (cache-aware) ──
        // A wine's grapes/alcohol never change, so a product card is visited ONCE.
        // On subsequent runs cached characteristics are merged into the (freshly
        // priced) Phase-1 offer without re-visiting the page.
        const batchKeys = batchOffers.map(o => this.cacheKey({ externalId: o.externalId, url: o.url }))
        const batchCache = (await callbacks?.getCachedCards?.(store.id, batchKeys)) ?? new Map()

        for (let j = 0; j < batchOffers.length; j++) {
          const offer = batchOffers[j]
          const key = this.cacheKey({ externalId: offer.externalId, url: offer.url })
          const payload = offer.rawPayload as Record<string, any>
          const cached = batchCache.get(key)

          if (cached) {
            payload.grapes = cached.grapes ?? []
            if (cached.alcohol !== null) payload.alcoholContentPage = cached.alcohol
            if (cached.appellation) payload.appellation = cached.appellation
            if (cached.country) payload.countryPage = cached.country
            if (cached.region) payload.regionPage = cached.region
            if (cached.description) payload.description = cached.description
            const cachedChars = (cached.payloadJson as any)?.characteristics
            if (cachedChars) payload.characteristics = cachedChars
            this.logger.log(`Phase 2b: CACHE HIT ${offer.url}`)
            continue
          }

          try {
            const chars = await this.scrapeProductCharacteristics(page!, offer.url)
            // Country/region/alcohol already come from the API in Phase 1 — the card
            // is visited for grapes + description, so cache when either is obtained.
            const meaningful = chars.grapes.length > 0 || !!chars.description
            if (meaningful) {
              payload.grapes = chars.grapes
              if (chars.alcohol !== null) payload.alcoholContentPage = chars.alcohol
              if (chars.appellation !== null) payload.appellation = chars.appellation
              if (chars.country) payload.countryPage = chars.country
              if (chars.region) payload.regionPage = chars.region
              if (chars.description) payload.description = chars.description
              if (chars.characteristics) payload.characteristics = chars.characteristics
              // Persist to cache so this card is never re-visited.
              await callbacks?.saveCard?.(store.id, {
                cardKey: key,
                externalId: offer.externalId ?? null,
                url: offer.url,
                grapes: chars.grapes ?? [],
                alcohol: chars.alcohol,
                appellation: chars.appellation,
                country: chars.country,
                region: chars.region,
                color: null,
                description: chars.description,
                payloadJson: {
                  grapes: chars.grapes ?? [],
                  alcoholContentPage: chars.alcohol,
                  appellation: chars.appellation,
                  countryPage: chars.country,
                  regionPage: chars.region,
                  description: chars.description,
                  characteristics: chars.characteristics ?? {},
                },
              })
            }
          } catch (error) {
            this.logger.warn(`Phase 2b: failed ${offer.url}: ${error}`)
          }
          if (j < batchOffers.length - 1) {
            await randomDelay(page!, 2000, 1000)
          }
        }

        offers.push(...batchOffers)

        this.logger.log(
          `Batch ${batchNum} summary: ` +
            `requestedCodes=${batch.length}, ` +
            `fetched=${data.length}, ` +
            `matchedWine=${batchMatchedWine}, ` +
            `availableOffers=${batchAvailableOffers}, ` +
            `skippedWithoutCode=${batchSkippedWithoutCode}, ` +
            `skippedNotWine=${batchSkippedNotWine}, ` +
            `skippedOutOfStock=${batchSkippedOutOfStock}, ` +
            `totalFetched=${totalFetched}, ` +
            `totalMatchedWine=${totalMatchedWine}, ` +
            `totalAvailableOffers=${totalAvailableOffers}, ` +
            `totalOffers=${offers.length}`,
        )

        if (callbacks && batchOffers.length > 0) {
          const result = await callbacks.saveAndNormalize(batchOffers, store.id, jobId)

          this.logger.log(
            `Batch normalized: ` +
              `sent=${batchOffers.length}, ` +
              `created=${result.created}, ` +
              `updated=${result.updated}, ` +
              `normalized=${result.normalized}`,
          )
        } else if (callbacks && batchOffers.length === 0) {
          this.logger.log(`Batch ${batchNum}: no available offers to normalize`)
        }

        await checkpointCallbacks?.saveCheckpoint('all', batchNum, null, offers.length)

        this.logger.log('Waiting with jitter...')

        await randomDelay(page!, 1500, 500)
      }

      checkpointCallbacks?.stopHeartbeat('all')
      heartbeatStarted = false

      await checkpointCallbacks?.saveCheckpoint('all', batchNum, null, offers.length)

      this.logger.log(
        `Total: ` +
          `${totalFetched} products fetched, ` +
          `${totalMatchedWine} wines matched, ` +
          `${totalAvailableOffers} available offers, ` +
          `${offers.length} offers collected`,
      )
    } catch (error) {
      this.logger.error(`Scraping error: ${error}`)
      throw error
    } finally {
      if (heartbeatStarted) {
        checkpointCallbacks?.stopHeartbeat('all')
      }

      if (browser) {
        await browser.close()
      }
    }

    return { offers }
  }

  private async collectProductCodesFromCategory(
    page: Page,
    categoryUrl: string,
    label: string,
  ): Promise<string[]> {
    this.logger.log(`${label}: opening category ${categoryUrl}`)

    await this.gotoWithServerErrorRetry(page, categoryUrl, label)
    await randomDelay(page, 4000, 2000)
    await this.closeModals(page)

    const codes = new Set<string>()

    const maxIterations = process.env.SCRAPER_MAX_PAGES
      ? parseInt(process.env.SCRAPER_MAX_PAGES, 10)
      : this.maxCategoryLoadIterations
    const maxGood = this.maxGoodPerPage()

    let previousSize = 0
    let consecutiveNoGrowth = 0
    let iteration = 0
    let contextRetries = 0
    const MAX_CONTEXT_RETRIES = 3

    while (true) {
      iteration++

      if (iteration > maxIterations) {
        this.logger.log(`${label}: reached max iterations (${maxIterations}), stopping`)
        break
      }

      let availabilityState: { productCards: number; addToCartButtons: number; notifyButtons: number; allNotify: boolean }
      let pageCodes: string[]

      try {
        await this.scrollToBottom(page)
        availabilityState = await this.getCatalogPageAvailabilityState(page)
        pageCodes = await this.extractProductCodesFromPage(page)
      } catch (evalError) {
        const msg = String(evalError)
        if (
          (msg.includes('context was destroyed') || msg.includes('Target closed')) &&
          contextRetries < MAX_CONTEXT_RETRIES
        ) {
          contextRetries++
          this.logger.warn(
            `${label}: execution context destroyed, re-navigating (${contextRetries}/${MAX_CONTEXT_RETRIES})`,
          )
          await this.gotoWithServerErrorRetry(page, categoryUrl, label)
          await randomDelay(page, 4000, 2000)
          await this.closeModals(page)
          continue
        }
        throw evalError
      }

      this.logger.log(
        `${label}: availability state: ` +
          `productCards=${availabilityState.productCards}, ` +
          `addToCartButtons=${availabilityState.addToCartButtons}, ` +
          `notifyButtons=${availabilityState.notifyButtons}, ` +
          `allNotify=${availabilityState.allNotify}`,
      )

      if (availabilityState.allNotify) {
        this.logger.log(
          `${label}: page contains only notify products, stopping category collection without adding this page codes`,
        )

        break
      }

      for (const code of pageCodes) {
        codes.add(code)
      }

      // Debug cap: limit codes (→ product cards) collected per category.
      if (maxGood && codes.size >= maxGood) {
        this.logger.log(`${label}: reached SCRAPER_MAX_GOOD_PER_PAGE (${maxGood}), stopping collection`)
        break
      }

      const currentSize = codes.size

      this.logger.log(
        `${label}: iteration=${iteration}, ` +
          `pageCodes=${pageCodes.length}, ` +
          `uniqueCodes=${currentSize}, ` +
          `previousUniqueCodes=${previousSize}`,
      )

      if (currentSize === previousSize) {
        consecutiveNoGrowth++

        this.logger.log(
          `${label}: product code count did not grow. ` +
            `consecutiveNoGrowth=${consecutiveNoGrowth}/${this.maxConsecutiveNoCodeGrowth}`,
        )

        if (consecutiveNoGrowth >= this.maxConsecutiveNoCodeGrowth) {
          this.logger.log(`${label}: stopping because product code count stopped growing`)
          break
        }
      } else {
        consecutiveNoGrowth = 0
      }

      previousSize = currentSize

      await this.scrollToBottom(page)
      await page.waitForTimeout(1000)

      const loadMoreInfo = await this.getLoadMoreInfo(page)

      this.logger.log(`${label}: load more info: ${JSON.stringify(loadMoreInfo)}`)

      if (!loadMoreInfo.found || loadMoreInfo.disabled || loadMoreInfo.visible === false) {
        this.logger.log(`${label}: no active load more link, category collection completed`)
        break
      }

      this.logger.log(`${label}: clicking load more`)

      const clicked = await this.clickLoadMore(page)

      if (!clicked) {
        this.logger.log(`${label}: failed to click load more, category collection completed`)
        break
      }

      this.logger.log(`${label}: waiting after load more click`)

      await page.waitForTimeout(2000)
      await randomDelay(page, 1000, 500)
    }

    const all = [...codes]
    return maxGood ? all.slice(0, maxGood) : all
  }

  private async getCatalogPageAvailabilityState(page: Page): Promise<{
    productCards: number
    addToCartButtons: number
    notifyButtons: number
    allNotify: boolean
  }> {
    return page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.product-card, .productcard, [data-product-code], [data-code], .productcard__info',
        ),
      )

      const normalizedCards = cards.filter((card) => {
        const text = card.innerText?.trim() || ''
        const productCode =
          card.getAttribute('data-product-code') ||
          card.getAttribute('data-code') ||
          card.querySelector('[data-product-code]')?.getAttribute('data-product-code') ||
          card.querySelector('[data-code]')?.getAttribute('data-code')

        return !!text || !!productCode
      })

      let addToCartButtons = 0
      let notifyButtons = 0

      for (const card of normalizedCards) {
        const text = card.innerText.toLowerCase()

        if (text.includes('в корзину')) {
          addToCartButtons++
        }

        if (text.includes('уведомить')) {
          notifyButtons++
        }
      }

      return {
        productCards: normalizedCards.length,
        addToCartButtons,
        notifyButtons,
        allNotify:
          normalizedCards.length > 0 &&
          addToCartButtons === 0 &&
          notifyButtons > 0,
      }
    })
  }

  private async extractProductCodesFromPage(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const codes = new Set<string>()

      const addCodeFromText = (text: string | null | undefined): void => {
        if (!text) {
          return
        }

        const matches = text.match(/product\/(\d{7})/g) || []

        for (const match of matches) {
          const code = match.replace('product/', '')

          if (code) {
            codes.add(code)
          }
        }
      }

      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/product/"]'))

      for (const link of links) {
        addCodeFromText(link.getAttribute('href'))
        addCodeFromText(link.href)
      }

      const productElements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-product-code], [data-code]'),
      )

      for (const element of productElements) {
        const productCode = element.getAttribute('data-product-code')
        const code = element.getAttribute('data-code')

        if (productCode && /^\d{7}$/.test(productCode)) {
          codes.add(productCode)
        }

        if (code && /^\d{7}$/.test(code)) {
          codes.add(code)
        }
      }

      const html = document.body?.innerHTML || ''

      addCodeFromText(html)

      return [...codes]
    })
  }

  private async scrollToBottom(page: Page): Promise<void> {
    try {
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0
          const distance = 800
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight

            window.scrollBy(0, distance)
            totalHeight += distance

            if (totalHeight >= scrollHeight - window.innerHeight) {
              clearInterval(timer)
              resolve()
            }
          }, 150)
        })
      })

      await page.waitForTimeout(1000)
    } catch (error) {
      this.logger.warn(`Failed to scroll to bottom: ${error}`)
    }
  }

  private async getLoadMoreInfo(page: Page): Promise<{
    found: boolean
    disabled: boolean | null
    text: string | null
    className: string | null
    href: string | null
    dataPage: string | null
    visible: boolean | null
  }> {
    return page.evaluate(() => {
      const selectors = [
        'a.js-pagination-btn-more',
        'a.page-link-more',
        'a.wl-btn-link.page-link-more',
        '.js-pagination-btn-more',
        '.page-link-more',
        'button',
        'a',
      ]

      const elements = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)),
      )

      const uniqueElements = Array.from(new Set(elements))

      const el = uniqueElements.find((element) => {
        const text = element.textContent?.trim().toLowerCase() || ''
        const className = element.className || ''

        return (
          className.includes('js-pagination-btn-more') ||
          className.includes('page-link-more') ||
          text.includes('загрузить ещё') ||
          text.includes('загрузить еще') ||
          text.includes('показать ещё') ||
          text.includes('показать еще')
        )
      })

      if (!el) {
        return {
          found: false,
          disabled: null,
          text: null,
          className: null,
          href: null,
          dataPage: null,
          visible: null,
        }
      }

      const disabled =
        el.getAttribute('disabled') !== null ||
        el.className.includes('disabled') ||
        el.getAttribute('aria-disabled') === 'true'

      const visible =
        !!el.offsetParent &&
        getComputedStyle(el).visibility !== 'hidden' &&
        getComputedStyle(el).display !== 'none'

      return {
        found: true,
        disabled,
        text: el.textContent?.trim() || '',
        className: el.className || '',
        href: el instanceof HTMLAnchorElement ? el.href : el.getAttribute('href'),
        dataPage: el.getAttribute('data-page'),
        visible,
      }
    })
  }

  private async clickLoadMore(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const selectors = [
        'a.js-pagination-btn-more',
        'a.page-link-more',
        'a.wl-btn-link.page-link-more',
        '.js-pagination-btn-more',
        '.page-link-more',
      ]

      const elements = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)),
      )

      const uniqueElements = Array.from(new Set(elements))

      const el = uniqueElements.find((element) => {
        const text = element.textContent?.trim().toLowerCase() || ''
        const className = element.className || ''

        return (
          className.includes('js-pagination-btn-more') ||
          className.includes('page-link-more') ||
          text.includes('загрузить ещё') ||
          text.includes('загрузить еще') ||
          text.includes('показать ещё') ||
          text.includes('показать еще')
        )
      })

      if (!el) {
        return false
      }

      const disabled =
        el.getAttribute('disabled') !== null ||
        el.className.includes('disabled') ||
        el.getAttribute('aria-disabled') === 'true'

      if (disabled) {
        return false
      }

      el.scrollIntoView({
        block: 'center',
        inline: 'center',
      })

      el.click()

      return true
    })
  }

  private shouldLogWineLabNetworkUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url)

      if (parsedUrl.hostname !== 'www.winelab.ru') {
        return false
      }

      return (
        parsedUrl.pathname.includes('catalog') ||
        parsedUrl.pathname.includes('product') ||
        parsedUrl.pathname.includes('ajax') ||
        parsedUrl.pathname.includes('api') ||
        parsedUrl.pathname.includes('load') ||
        parsedUrl.pathname.includes('page') ||
        parsedUrl.pathname.includes('pagination') ||
        parsedUrl.pathname.includes('filter') ||
        parsedUrl.pathname.includes('search') ||
        parsedUrl.pathname.includes('show') ||
        parsedUrl.pathname.includes('more') ||
        parsedUrl.pathname.includes('view')
      )
    } catch {
      return false
    }
  }

  private async gotoWithServerErrorRetry(
    page: Page,
    url: string,
    label: string,
  ): Promise<Response | null> {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= this.maxServerErrorAttempts; attempt++) {
      try {
        this.logger.log(
          `${label}: opening page, attempt ${attempt}/${this.maxServerErrorAttempts}: ${url}`,
        )

        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        })

        const status = response?.status() ?? null
        const serverErrorPage = await this.getServerErrorPageState(page)

        if ((status && status >= 500) || serverErrorPage.isServerError) {
          throw new Error(
            `${label}: server error while opening page. ` +
              `status=${status || 'unknown'}, url=${url}, title="${serverErrorPage.title}"`,
          )
        }

        return response
      } catch (error) {
        lastError = error

        if (attempt >= this.maxServerErrorAttempts) {
          break
        }

        // Сеть пропала/сменилась (VPN) — ждём восстановления, не тратя попытки.
        if (!(await this.checkInternet())) {
          this.logger.warn(`${label}: сеть недоступна — жду восстановления перед повтором`)
          await this.waitForConnectivity()
        }

        const delayMs = this.getBackoffDelayMs(attempt)

        this.logger.warn(
          `${label}: failed to open page, retrying in ${Math.round(delayMs / 1000)}s. ` +
            `attempt=${attempt}/${this.maxServerErrorAttempts}, error=${error}`,
        )

        await page.waitForTimeout(delayMs)
      }
    }

    throw new Error(
      `${label}: failed to open page after ${this.maxServerErrorAttempts} attempts. ` +
        `Last error: ${lastError}`,
    )
  }

  private async fetchBatchWithRetry(
    page: Page,
    batch: string[],
    batchNum: number,
    attempt: number = 1,
  ): Promise<any> {
    try {
      const result = await page.evaluate(async (codes) => {
        const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        })

        const contentType = resp.headers.get('content-type') || ''

        if (!contentType.includes('application/json')) {
          const text = await resp.text()

          return {
            error: 'Not JSON',
            status: resp.status,
            preview: text.substring(0, 200),
          }
        }

        return await resp.json()
      }, batch)

      if (result && result.status >= 500) {
        throw new Error(`HTTP ${result.status}: ${result.preview || ''}`)
      }

      return result
    } catch (error) {
      if (attempt >= this.maxServerErrorAttempts) {
        return {
          error: `Failed after ${attempt} attempts`,
          cause: String(error),
        }
      }

      const delayMs = this.getBackoffDelayMs(attempt)

      this.logger.warn(
        `Batch ${batchNum}: fetch failed, retrying in ${Math.round(delayMs / 1000)}s. ` +
          `attempt=${attempt}/${this.maxServerErrorAttempts}, error=${error}`,
      )

      await page.waitForTimeout(delayMs)

      return this.fetchBatchWithRetry(page, batch, batchNum, attempt + 1)
    }
  }

  private getBackoffDelayMs(attempt: number): number {
    const baseDelayMs = 5000
    const maxDelayMs = 60000
    const delayMs = baseDelayMs * Math.pow(2, attempt - 1)

    return Math.min(delayMs, maxDelayMs)
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

      return {
        isServerError,
        title,
        bodyText,
      }
    })
  }

  private async scrapeProductCharacteristics(page: Page, url: string): Promise<{
    grapes: string[]
    alcohol: number | null
    appellation: string | null
    country: string | null
    region: string | null
    description: string | null
    characteristics?: Record<string, string>
  }> {
    const empty = { grapes: [], alcohol: null, appellation: null, country: null, region: null, description: null, characteristics: {} }
    try {
      const response = await this.gotoWithRetry(page, url)

      if (!response || response.status() >= 400) {
        this.logger.warn(`Phase 2b: HTTP ${response?.status() ?? 'no response'} for ${url}`)
        return empty
      }

      // winelab.ru is a heavy SPA — the characteristics block renders late, can be
      // below the fold, and the full spec list (with grapes) may sit behind a
      // collapsed "Характеристики" tab/accordion. Scroll, expand, then wait.
      await page.waitForTimeout(1500)
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      } catch {}
      await page.waitForTimeout(1000)
      // Try to expand any characteristics/specification accordion or tab.
      try {
        await page.evaluate(() => {
          const wanted = /характеристик|все характеристики|подробнее|состав|показать ещё|показать еще/i
          const clickable = Array.from(
            document.querySelectorAll<HTMLElement>('button, a, [role="button"], [class*="tab"], [class*="accordion"], [class*="spoiler"], summary'),
          )
          for (const el of clickable) {
            const t = (el.textContent || '').trim()
            if (t && wanted.test(t) && t.length < 40) {
              try { el.click() } catch {}
            }
          }
        })
      } catch {}
      await page.waitForTimeout(1200)
      try {
        await page.waitForFunction(
          () => /сорт|крепость|регион|виноград|содержание сахара/i.test(document.body?.innerText || ''),
          { timeout: 5000 },
        )
      } catch {}

      const result = await page.evaluate(() => {
        // Universal label→value extractor — independent of CSS class names.
        // Finds any leaf element whose text is exactly a known wine label, then
        // takes the value from the next element sibling, or (when the value is a
        // bare text node) from the remainder of the parent's text.
        // NOTE: labels are matched case-INSENSITIVELY. WineLab renders the grape
        // label as "Сорт Винограда" (capital В), which a case-sensitive match
        // would miss. Keys in `chars` are stored lowercased.
        const wineLabels = [
          'Страна', 'Страна происхождения', 'Регион', 'Сорт', 'Сорта', 'Состав',
          'Цвет', 'Крепость', 'Алкоголь', 'ABV', 'Объем', 'Объём', 'Сахар',
          'Содержание сахара', 'Производитель', 'Изготовитель', 'Год урожая', 'Год',
          'Аппелласьон', 'Апелласьон', 'Апелляция', 'AOC', 'Сорт винограда',
          'Сорта винограда', 'Виноград', 'Бренд', 'Торговая марка', 'Выдержка',
        ]
        const wineLabelsLower = wineLabels.map((l) => l.toLowerCase())
        const norm = (t: string) => (t || '').replace(/\s+/g, ' ').trim().replace(/:+$/, '').trim()
        const chars: Record<string, string> = {}

        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>('th, td, dt, dd, span, div, li, p, b, strong'),
        )
        for (const el of candidates) {
          const label = norm(el.textContent || '')
          const labelLower = label.toLowerCase()
          if (!wineLabelsLower.includes(labelLower)) continue
          if (chars[labelLower]) continue

          let value = ''
          let sib = el.nextElementSibling
          while (sib && !value) {
            const t = norm(sib.textContent || '')
            if (t && t.toLowerCase() !== labelLower) value = (sib.textContent || '').trim()
            sib = sib.nextElementSibling
          }
          if (!value && el.parentElement) {
            const parentText = norm(el.parentElement.textContent || '')
            if (parentText.toLowerCase().startsWith(labelLower) && parentText.length > label.length) {
              value = parentText.slice(label.length).replace(/^[:\-–—\s]+/, '').trim()
            }
          }
          if (value && value.length < 300) chars[labelLower] = value
        }

        // Grape varieties (keys are lowercased)
        const grapeRaw =
          chars['сорт винограда'] || chars['сорта винограда'] || chars['сорта'] ||
          chars['состав'] || chars['сорт'] || chars['виноград'] || ''
        const grapes = grapeRaw
          .split(/[,;]/)
          .map((g: string) => g.replace(/\s*\d+(\.\d+)?%.*$/, '').trim())
          .filter(Boolean)

        // Alcohol
        const alcoholText = chars['крепость'] || chars['алкоголь'] || chars['abv'] || ''
        const alcoholMatch = alcoholText.match(/([\d.]+)/)
        const alcohol = alcoholMatch ? parseFloat(alcoholMatch[1]) : null

        // Appellation
        const appellation =
          chars['аппелласьон'] || chars['апелласьон'] || chars['aoc'] || chars['апелляция'] || null

        const country = chars['страна'] || chars['страна происхождения'] || null
        const region = chars['регион'] || null

        // Description: WineLab keeps free-text notes in tabs under #product-detail-tabs
        // ("Описание", "Производитель", "О бренде", "Рекомендуемое употребление",
        // "Отзывы"). Collect every tab's text EXCEPT reviews, which are user content.
        const descParts: string[] = []
        document.querySelectorAll<HTMLElement>('#product-detail-tabs .w-tabs__content, .js-w-tab-content').forEach((el) => {
          const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
          if (!t) return
          if (/^отзыв/i.test(t)) return // skip the reviews tab
          if (t.length < 30) return
          descParts.push(t)
        })
        // Dedup (the same content can match several selectors) and join.
        const seen = new Set<string>()
        const description = descParts
          .filter((p) => (seen.has(p) ? false : (seen.add(p), true)))
          .join('\n\n')
          .slice(0, 4000) || null

        return {
          grapes, alcohol, appellation, country, region, description,
          characteristics: chars,
          _debug: { charKeys: Object.keys(chars), bodyLen: (document.body?.innerText || '').length },
        }
      })

      if (result.grapes.length === 0) {
        this.logger.warn(
          `Phase 2b: no grapes for ${url} — charKeys=[${result._debug.charKeys.join(', ')}], bodyLen=${result._debug.bodyLen}`,
        )
      }

      const { _debug, ...chars } = result
      return chars
    } catch (error) {
      this.logger.warn(`Phase 2b error for ${url}: ${error}`)
      return empty
    }
  }

  private async closeModals(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const modal = document.getElementById('age-confirm-modal')

        if (modal) {
          modal.remove()
        }

        const overlay = document.querySelector('.w-modal__overlay')

        if (overlay) {
          overlay.remove()
        }

        const buttons = Array.from(document.querySelectorAll('button'))

        const adultButton = buttons.find((button) => {
          const text = button.textContent?.trim().toLowerCase() || ''

          return (
            text.includes('18') ||
            text.includes('мне есть') ||
            text.includes('подтвердить') ||
            text.includes('да')
          )
        })

        if (adultButton) {
          adultButton.click()
        }

        const closeButtons = buttons.filter((button) => {
          const text = button.textContent?.trim().toLowerCase() || ''

          return text === 'закрыть' || text === 'понятно' || text.includes('продолжить')
        })

        closeButtons.forEach((button) => button.click())
      })

      await page.waitForTimeout(1000)
    } catch (error) {
      this.logger.warn(`Failed to close modals: ${error}`)
    }
  }
}
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
        throw new Error('WineLab: no product codes collected from categories')
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

      const maxBatches = process.env.SCRAPER_MAX_PAGES
        ? parseInt(process.env.SCRAPER_MAX_PAGES, 10)
        : null

      let batchNum = 0
      let totalFetched = 0
      let totalMatchedWine = 0
      let totalAvailableOffers = 0

      checkpointCallbacks?.startHeartbeat('all')
      heartbeatStarted = true

      for (let i = 0; i < uniqueCodes.length; i += this.batchSize) {
        batchNum++

        if (maxBatches && batchNum > maxBatches) {
          this.logger.log(`Reached max batches limit (${maxBatches}), stopping`)
          break
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

          batchOffers.push({
            externalId: code,
            title: name,
            url: `https://www.winelab.ru${p.url || '/catalog/vino/product/' + p.code + '/'}`,
            imageUrl: p.images?.[0]?.url ? `https://www.winelab.ru${p.images[0].url}` : undefined,
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
    await randomDelay(page, 2000, 1000)
    await this.closeModals(page)

    const codes = new Set<string>()

    let previousSize = 0
    let consecutiveNoGrowth = 0
    let iteration = 0

    while (true) {
      iteration++

      if (iteration > this.maxCategoryLoadIterations) {
        throw new Error(
          `${label}: exceeded max category load iterations (${this.maxCategoryLoadIterations}). ` +
            `Stopping to prevent infinite loop.`,
        )
      }

      await this.scrollToBottom(page)

      const availabilityState = await this.getCatalogPageAvailabilityState(page)

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

      const pageCodes = await this.extractProductCodesFromPage(page)

      for (const code of pageCodes) {
        codes.add(code)
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

    return [...codes]
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
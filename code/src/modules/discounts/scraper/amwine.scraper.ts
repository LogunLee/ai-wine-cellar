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
export class AmwineScraper extends BaseScraper {
  storeCode = 'amwine'

  private readonly maxServerErrorAttempts = 5
  private readonly maxCatalogIterations = 1000
  private readonly maxConsecutiveEmpty = 3
  private readonly maxConsecutiveNoIncrease = 3
  private readonly maxConsecutiveZeroOfferPages = 5

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
        if (page) {
          await page.close()
        }

        page = await context!.newPage()
        lastServerError = null

        page.on('response', async (response) => {
          const status = response.status()

          if (status >= 500 && response.url().includes('amwine.ru')) {
            lastServerError = {
              status,
              url: response.url(),
            }

            this.logger.warn(`Got HTTP ${status} from ${response.url()}`)
          }
        })

        return page
      }

      page = await setupPage()

      const resetServerError = (): void => {
        lastServerError = null
      }

      const getLastServerError = (): { status: number; url: string } | null => {
        return lastServerError
      }

      const scrapeCategory = async (
        catalogUrl: string,
        label: string,
        categoryKey: string,
        forceWineType?: string,
      ): Promise<void> => {
        const maxPages = process.env.SCRAPER_MAX_PAGES
          ? parseInt(process.env.SCRAPER_MAX_PAGES, 10)
          : null

        const wineTypeMap: Record<string, string> = {
          '17': 'RED',
          '18': 'WHITE',
          '19': 'ROSE',
        }

        let pageNum = 1
        let totalWine = 0
        let previousCount = 0
        let consecutiveEmpty = 0
        let consecutiveNoIncrease = 0
        let consecutiveZeroOfferPages = 0
        let iterationCount = 0
        let heartbeatStarted = false

        try {
          await this.gotoWithServerErrorRetry(
            page!,
            catalogUrl,
            label,
            resetServerError,
            getLastServerError,
          )

          await randomDelay(page!, 2000, 1000)
          await this.closeModals(page!)

          checkpointCallbacks?.startHeartbeat(categoryKey)
          heartbeatStarted = true

          while (true) {
            iterationCount++

            if (iterationCount > this.maxCatalogIterations) {
              throw new Error(
                `${label}: exceeded max catalog iterations (${this.maxCatalogIterations}). ` +
                  `Stopping to prevent infinite scraping loop.`,
              )
            }

            if (maxPages && pageNum > maxPages) {
              this.logger.log(`Reached max pages limit (${maxPages}), stopping ${label}`)
              break
            }

            const pageError = await this.getServerErrorPageState(page!)

            if (pageError.isServerError) {
              throw new Error(
                `${label}: AMWINE returned server error page before parsing products. ` +
                  `title="${pageError.title}", body="${pageError.bodyText}"`,
              )
            }

            const catalogProps = await page!.evaluate(() => (window as any).catalogProps)

            const countryMap: Record<string, string> = {}
            const colorMap: Record<string, string> = {}
            const sugarMap: Record<string, string> = {}

            if (catalogProps?.country?.values) {
              for (const [, v] of Object.entries(catalogProps.country.values)) {
                const val = v as any
                countryMap[val.code] = val.value
              }
            }

            if (catalogProps?.color?.values) {
              for (const [, v] of Object.entries(catalogProps.color.values)) {
                const val = v as any
                colorMap[val.id] = val.value
              }
            }

            if (catalogProps?.sugar?.values) {
              for (const [, v] of Object.entries(catalogProps.sugar.values)) {
                const val = v as any
                sugarMap[val.id] = val.value
              }
            }

            const products = await page!.evaluate(() => {
              const w = window as any

              if (Array.isArray(w.products)) {
                return w.products
              }

              return []
            })

            if (!products || products.length === 0) {
              const emptyState = await this.getEmptyProductsDebugState(page!)

              if (emptyState.isServerError) {
                throw new Error(
                  `${label}: AMWINE returned server error page instead of catalog. ` +
                    `title="${emptyState.title}", body="${emptyState.bodyText}"`,
                )
              }

              this.logger.log(
                `No products on ${label} page ${pageNum}, stopping. ` +
                  `url=${emptyState.url}, title=${emptyState.title}`,
              )

              break
            }

            const newProducts = products.slice(previousCount)

            this.logger.log(
              `${label} page ${pageNum}: ${newProducts.length} new products ` +
                `(total in window: ${products.length}, previousCount=${previousCount})`,
            )

            const batchOffers: RawScrapedOffer[] = []

            let skippedByName = 0
            let skippedByAvailability = 0

            for (const p of newProducts) {
              const name = p.name || ''

              if (name.length < 5) {
                skippedByName++
                continue
              }

              if (!p.available) {
                skippedByAvailability++
                continue
              }

              const props = p.props || {}

              const country = countryMap[props.country] || null
              const colorName = colorMap[props.color] || null
              const sugarName = sugarMap[props.sugar] || null

              const wineType =
                forceWineType || (props.color ? wineTypeMap[props.color] || 'OTHER' : 'OTHER')

              const volumeMl = props.value
                ? Math.round(parseFloat(props.value) * 1000)
                : undefined

              const grapes = Array.isArray(props.grape_sort) ? props.grape_sort : []

              let currentPrice = p.price ? parseFloat(p.price) : undefined

              let oldPrice = p.old_price
                ? parseFloat(p.old_price)
                : props.old_price_77
                  ? parseFloat(props.old_price_77)
                  : undefined

              const badgePercent = this.extractPercentFromBadges(p.badge)

              if (badgePercent && p.price) {
                oldPrice = Math.round(parseFloat(p.price))
                currentPrice = Math.round(oldPrice * (1 - badgePercent / 100))
              } else {
                if ((!currentPrice || currentPrice === 0) && oldPrice) {
                  currentPrice = oldPrice
                  oldPrice = undefined
                }

                if (currentPrice && oldPrice) {
                  const discount = ((oldPrice - currentPrice) / oldPrice) * 100

                  if (discount < 1) {
                    oldPrice = undefined
                  }
                }
              }

              batchOffers.push({
                externalId: p.id?.toString(),
                title: name,
                url: `https://amwine.ru${p.link || ''}`,
                imageUrl: p.preview_picture || undefined,
                currentPrice,
                oldPrice,
                rawPayload: {
                  title: name,
                  url: p.link,
                  id: p.id,
                  price: p.price,
                  old_price: p.old_price,
                  sale: p.sale,
                  country,
                  countrySlug: props.country,
                  color: colorName,
                  colorId: props.color,
                  sugar: sugarName,
                  sugarId: props.sugar,
                  alcohol: props.alco,
                  volume: props.value,
                  volumeMl,
                  region: props.region,
                  grapes,
                  brand: props.brand,
                  producer: props.producer,
                  wineType,
                  available: p.available,
                  availableQuantity: p.available_quantity,
                  badge: p.badge,
                  rating: props.rating_from_reviews,
                  article: props.article,
                },
              })
            }

            offers.push(...batchOffers)
            totalWine += batchOffers.length

            this.logger.log(
              `${label} page ${pageNum}: ` +
                `newProducts=${newProducts.length}, ` +
                `batchOffers=${batchOffers.length}, ` +
                `skippedByName=${skippedByName}, ` +
                `skippedByAvailability=${skippedByAvailability}, ` +
                `categoryTotalWines=${totalWine}, ` +
                `allOffers=${offers.length}`,
            )

            if (batchOffers.length === 0) {
              consecutiveZeroOfferPages++

              this.logger.log(
                `${label} page ${pageNum}: offers count did not increase. ` +
                  `consecutiveZeroOfferPages=${consecutiveZeroOfferPages}/${this.maxConsecutiveZeroOfferPages}`,
              )

              if (consecutiveZeroOfferPages >= this.maxConsecutiveZeroOfferPages) {
                this.logger.log(
                  `${label}: offers count did not increase for ` +
                    `${this.maxConsecutiveZeroOfferPages} consecutive loaded pages. ` +
                    `Stopping this category.`,
                )

                break
              }
            } else {
              consecutiveZeroOfferPages = 0
            }

            if (newProducts.length === 0) {
              consecutiveEmpty++

              this.logger.log(`Consecutive empty iterations: ${consecutiveEmpty}`)

              if (consecutiveEmpty >= this.maxConsecutiveEmpty) {
                this.logger.log(
                  `No new products for ${this.maxConsecutiveEmpty} iterations, stopping ${label}`,
                )

                break
              }
            } else {
              consecutiveEmpty = 0
            }

            if (callbacks && batchOffers.length > 0) {
              const result = await callbacks.saveAndNormalize(batchOffers, store.id, jobId)

              this.logger.log(
                `Batch normalized: ` +
                  `sent=${batchOffers.length}, ` +
                  `created=${result.created}, ` +
                  `updated=${result.updated}, ` +
                  `normalized=${result.normalized}`,
              )
            }

            await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, catalogUrl, offers.length)

            previousCount = products.length

            const loadMoreInfo = await this.getLoadMoreInfo(page!)

            this.logger.log(
              `Load more info for ${label} page ${pageNum}: ${JSON.stringify(loadMoreInfo)}`,
            )

            if (!loadMoreInfo.found || loadMoreInfo.disabled) {
              this.logger.log(`No active load more button for ${label}, stopping`)
              break
            }

            const productsBefore = products.length

            const productsAfter = await this.clickLoadMoreWithServerErrorRetry(
              page!,
              label,
              productsBefore,
              resetServerError,
              getLastServerError,
            )

            this.logger.log(`Products: ${productsBefore} -> ${productsAfter}`)

            if (productsAfter <= productsBefore) {
              consecutiveNoIncrease++

              this.logger.log(
                `Products count did not increase after load more. ` +
                  `Consecutive no-increase iterations: ${consecutiveNoIncrease}`,
              )

              if (consecutiveNoIncrease >= this.maxConsecutiveNoIncrease) {
                this.logger.log(
                  `No product count increase for ${this.maxConsecutiveNoIncrease} iterations, stopping ${label}`,
                )

                break
              }
            } else {
              consecutiveNoIncrease = 0
            }

            pageNum++
          }

          await checkpointCallbacks?.saveCheckpoint(categoryKey, pageNum, null, offers.length)
        } finally {
          if (heartbeatStarted) {
            checkpointCallbacks?.stopHeartbeat(categoryKey)
          }
        }
      }

      await scrapeCategory('https://amwine.ru/catalog/vino/', 'Still wines', 'still')

      await scrapeCategory(
        'https://amwine.ru/catalog/igristoe_vino_i_shampanskoe/',
        'Sparkling wines',
        'sparkling',
        'SPARKLING',
      )

      this.logger.log(`Total offers collected: ${offers.length}`)
    } catch (error) {
      this.logger.error(`Scraping error: ${error}`)
      throw error
    } finally {
      if (browser) {
        await browser.close()
      }
    }

    return { offers }
  }

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

        if (attempt >= this.maxServerErrorAttempts) {
          break
        }

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

        if (attempt >= this.maxServerErrorAttempts) {
          break
        }

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
        {
          timeout: timeoutMs,
        },
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

      return {
        isServerError,
        title,
        bodyText,
      }
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

      return {
        url,
        title,
        bodyText,
        isServerError,
      }
    })
  }

  private async closeModals(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const modal = document.getElementById('modal-for-adult')

        if (modal) {
          modal.remove()
        }

        const buttons = Array.from(document.querySelectorAll('button'))

        const ageBtn = buttons.find((b) => b.textContent?.includes('18 лет'))

        if (ageBtn) {
          ageBtn.click()
        }

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

  private extractPercentFromBadges(badge: any): number | undefined {
    if (!badge) {
      return undefined
    }

    const badges = Array.isArray(badge) ? badge : [badge]

    for (const b of badges) {
      if (b.text && typeof b.text === 'string') {
        const match = b.text.match(/(\d+)%/)

        if (match) {
          return parseInt(match[1], 10)
        }
      }
    }

    return undefined
  }
}
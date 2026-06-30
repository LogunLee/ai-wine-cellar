import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Store, ScrapeJobStatus } from '@prisma/client'
import { PrismaService } from '../../../shared/database/prisma.service'
import { BaseScraper, ScraperResult, ScraperCallbacks } from './base-scraper'
import { NormalizerService } from '../normalizer/normalizer.service'
import { SchedulerService } from '../scheduler/scheduler.service'

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name)
  private scrapers = new Map<string, BaseScraper>()
  private schedulerService: SchedulerService | null = null
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>()

  // ── Anti-false-success / stall-watchdog config ──
  /** Доля от прошлого успешного прогона, ниже которой результат считаем блокировкой. */
  private readonly MIN_RATIO = parseFloat(process.env.SCRAPER_MIN_RATIO || '0.5')
  /** Протухший heartbeat дольше этого → джоба считается зависшей. */
  private readonly STALL_MS = parseInt(process.env.SCRAPER_STALL_MS || '240000', 10)
  private stallWatchdog: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizerService: NormalizerService,
  ) {}

  setSchedulerService(scheduler: SchedulerService) {
    this.schedulerService = scheduler
  }

  async onModuleInit() {
  }

  async resumeAllStalled() {
    await this.resumeStalledJobs()
  }

  registerScraper(scraper: BaseScraper) {
    this.scrapers.set(scraper.storeCode, scraper)
    this.logger.log(`Registered scraper: ${scraper.storeCode}`)
  }

  getScraper(storeCode: string): BaseScraper | undefined {
    return this.scrapers.get(storeCode)
  }

  async resumeStalledJobs() {
    const checkpoints = await this.prisma.scrapeCheckpoint.findMany({
      distinct: ['storeId'],
    })

    if (checkpoints.length === 0) {
      this.logger.log('No checkpoints found, nothing to resume')
      await this.prisma.scrapeJob.updateMany({
        where: { status: 'running' },
        data: { status: 'failed', errorMessage: 'Server restarted, no checkpoints to resume from' },
      })
      return
    }

    const storeIds = checkpoints.map(c => c.storeId)
    const stalledJobs = await this.prisma.scrapeJob.findMany({
      where: { status: 'running', storeId: { in: storeIds } },
      include: { store: true },
      orderBy: { startedAt: 'asc' },
    })

    if (stalledJobs.length === 0) {
      this.logger.log('No stalled scrape jobs to resume')
      return
    }

    this.logger.log(`Found ${stalledJobs.length} stalled scrape jobs with checkpoints, resuming...`)

    for (const job of stalledJobs) {
      await this.prisma.scrapeJob.updateMany({
        where: { storeId: job.storeId, status: 'running' },
        data: { status: 'failed', errorMessage: 'Server restarted, resuming from checkpoint' },
      })
      this.logger.log(`Resuming scrape for ${job.store.name} (started: ${job.startedAt})`)
      if (this.schedulerService) {
        this.schedulerService.runManualScrape(job.storeId).catch(err => {
          this.logger.error(`Failed to resume scrape for ${job.store.name}: ${err}`)
        })
      }
    }
  }

  async saveCheckpoint(storeId: string, category: string, pageNum: number, lastUrl: string | null, offersCollected: number) {
    await this.prisma.scrapeCheckpoint.upsert({
      where: { storeId_category: { storeId, category } },
      update: { pageNum, lastUrl, offersCollected, heartbeatAt: new Date() },
      create: { storeId, category, pageNum, lastUrl, offersCollected },
    })
  }

  async heartbeat(storeId: string, category: string) {
    await this.prisma.scrapeCheckpoint.updateMany({
      where: { storeId, category },
      data: { heartbeatAt: new Date() },
    })
  }

  async clearCheckpoint(storeId: string, category: string) {
    await this.prisma.scrapeCheckpoint.deleteMany({ where: { storeId, category } })
  }

  async clearAllCheckpoints(storeId: string) {
    await this.prisma.scrapeCheckpoint.deleteMany({ where: { storeId } })
  }

  async runScrapeJob(store: Store): Promise<void> {
    let scraper = this.getScraper(store.parserType)
    if (!scraper) scraper = this.getScraper(store.code)
    if (!scraper) {
      this.logger.warn(`No scraper found for store: ${store.name} (parserType: ${store.parserType}, code: ${store.code})`)
      return
    }

    const job = await this.prisma.scrapeJob.create({
      data: {
        storeId: store.id,
        status: 'running' as ScrapeJobStatus,
        startedAt: new Date(),
      },
    })

    const callbacks: ScraperCallbacks = {
      saveAndNormalize: async (offers, storeId, jobId) => {
        let createdCount = 0
        let updatedCount = 0
        const newRawIds: string[] = []

        for (const offer of offers) {
          const contentHash = this.computeContentHash(storeId, offer)
          const existing = await this.prisma.rawOffer.findUnique({
            where: { storeId_contentHash: { storeId, contentHash } },
          })

          if (existing) {
            await this.prisma.rawOffer.update({
              where: { id: existing.id },
              data: {
                rawImageUrl: offer.imageUrl ?? null,
                rawCurrentPrice: offer.currentPrice !== undefined ? offer.currentPrice : undefined,
                rawOldPrice: offer.oldPrice !== undefined ? offer.oldPrice : undefined,
                rawDiscountPercent: offer.discountPercent ?? null,
                rawAvailability: offer.availability ?? null,
                rawPayloadJson: offer.rawPayload as any,
                scrapeJobId: jobId,
                collectedAt: new Date(),
              },
            })
            updatedCount++
          } else {
            const raw = await this.prisma.rawOffer.create({
              data: {
                storeId,
                scrapeJobId: jobId,
                externalId: offer.externalId ?? null,
                rawTitle: offer.title,
                rawUrl: offer.url,
                rawImageUrl: offer.imageUrl ?? null,
                rawCurrentPrice: offer.currentPrice !== undefined ? offer.currentPrice : undefined,
                rawOldPrice: offer.oldPrice !== undefined ? offer.oldPrice : undefined,
                rawDiscountPercent: offer.discountPercent ?? null,
                rawAvailability: offer.availability ?? null,
                rawPayloadJson: offer.rawPayload as any,
                contentHash,
              },
            })
            createdCount++
            newRawIds.push(raw.id)
          }
        }

        if (newRawIds.length > 0) {
          this.normalizerService.normalizeByIds(newRawIds).catch(err => {
            this.logger.error(`Background normalization failed: ${err}`)
          })
        }

        // Sync imageUrl to existing discount_offers that still have null imageUrl
        await this.prisma.$executeRaw`
          UPDATE "discount_offer" doff
          SET "image_url" = ro."raw_image_url"
          FROM "raw_offer" ro
          WHERE doff."raw_offer_id" = ro."id"
            AND doff."image_url" IS NULL
            AND ro."raw_image_url" IS NOT NULL
            AND ro."store_id" = ${storeId}
        `

        return { created: createdCount, updated: updatedCount, normalized: newRawIds.length }
      },

      getCachedCards: async (storeId, keys) => {
        const map = new Map<string, any>()
        if (!keys || keys.length === 0) return map
        const cards = await this.prisma.wineCard.findMany({
          where: { storeId, cardKey: { in: keys } },
        })
        for (const c of cards) {
          map.set(c.cardKey, {
            grapes: c.grapes,
            alcohol: c.alcohol,
            appellation: c.appellation,
            country: c.country,
            region: c.region,
            color: c.color,
            description: c.description,
            payloadJson: c.payloadJson,
          })
        }
        return map
      },

      saveCard: async (storeId, card) => {
        await this.prisma.wineCard.upsert({
          where: { storeId_cardKey: { storeId, cardKey: card.cardKey } },
          create: {
            storeId,
            cardKey: card.cardKey,
            externalId: card.externalId,
            url: card.url,
            grapes: card.grapes,
            alcohol: card.alcohol,
            appellation: card.appellation,
            country: card.country,
            region: card.region,
            color: card.color,
            description: card.description,
            payloadJson: card.payloadJson as any,
          },
          update: {
            externalId: card.externalId,
            url: card.url,
            grapes: card.grapes,
            alcohol: card.alcohol,
            appellation: card.appellation,
            country: card.country,
            region: card.region,
            color: card.color,
            description: card.description,
            payloadJson: card.payloadJson as any,
          },
        })
      },
    }

    const startHeartbeat = (category: string) => {
      const interval = setInterval(async () => {
        await this.heartbeat(store.id, category)
      }, 30000)
      this.heartbeatIntervals.set(`${store.id}:${category}`, interval)
    }

    const stopHeartbeat = (category: string) => {
      const key = `${store.id}:${category}`
      const interval = this.heartbeatIntervals.get(key)
      if (interval) { clearInterval(interval); this.heartbeatIntervals.delete(key) }
    }

    try {
      this.logger.log(`Starting scrape job for store: ${store.name} (${store.code})`)

      const existingCheckpoints = await this.prisma.scrapeCheckpoint.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: 'asc' },
      })

      // Логический старт прогона. Старые данные НЕ удаляем заранее (mark-and-sweep):
      // если прогон окажется блокировкой/нулём — погреб скидок не обнулится. Сметаем
      // устаревшее только после валидного успеха. Cutoff = время начала логического
      // прогона: при резюме — первый чекпойнт (чтобы не снести данные, собранные до
      // перезапуска новым jobId), при свежем запуске — сейчас.
      const runCutoff = existingCheckpoints.length > 0 ? existingCheckpoints[0].createdAt : new Date()
      if (existingCheckpoints.length > 0) {
        this.logger.log(`Resuming ${store.name} from ${existingCheckpoints.length} checkpoint(s) (since ${runCutoff.toISOString()})`)
      } else {
        this.logger.log(`Fresh run for ${store.name} — старые данные сохраняются до валидного успеха`)
      }

      const result = await scraper.scrape(store, job.id, callbacks, {
        saveCheckpoint: (category, pageNum, lastUrl, offersCollected) => {
          this.logger.log(`Checkpoint saved: ${category} | page=${pageNum} | offers=${offersCollected}`)
          return this.saveCheckpoint(store.id, category, pageNum, lastUrl, offersCollected)
        },
        getCheckpoint: async (category) => {
          const cp = await this.prisma.scrapeCheckpoint.findUnique({
            where: { storeId_category: { storeId: store.id, category } },
          })
          if (!cp) return null
          return { pageNum: cp.pageNum, lastUrl: cp.lastUrl, offersCollected: cp.offersCollected }
        },
        startHeartbeat: (category) => startHeartbeat(category),
        stopHeartbeat: (category) => stopHeartbeat(category),
      })

      const found = result.offers.length

      // Anti-false-success: блок/VPN часто отдаёт страницу с 0 вин или резко меньше
      // обычного — это НЕ успех. Старые данные и чекпойнты не трогаем, чтобы можно
      // было дочистить позже/возобновить.
      const verdict = await this.validateRun(store, found, job.id)
      if (!verdict.ok) {
        this.logger.warn(`Scrape for ${store.name} выглядит как блокировка: ${verdict.reason} — сохраняю старые данные и чекпойнты`)
        await this.prisma.scrapeJob.update({
          where: { id: job.id },
          data: { status: 'failed' as ScrapeJobStatus, finishedAt: new Date(), foundCount: found, errorMessage: verdict.reason },
        })
        await this.prisma.store.update({
          where: { id: store.id },
          data: { lastErrorAt: new Date(), lastErrorMessage: verdict.reason },
        })
        this.stopHeartbeatsForStore(store.id)
        return
      }

      await this.prisma.scrapeJob.update({
        where: { id: job.id },
        data: { status: 'success' as ScrapeJobStatus, finishedAt: new Date(), foundCount: found },
      })

      await this.prisma.store.update({
        where: { id: store.id },
        data: { lastSuccessAt: new Date(), lastErrorMessage: null },
      })

      // Прогон валиден → теперь безопасно смести устаревшее (не обновлённое в этом
      // логическом прогоне) и закрыть чекпойнты.
      const swept = await this.sweepStaleOffers(store.id, runCutoff)
      await this.clearAllCheckpoints(store.id)
      this.stopHeartbeatsForStore(store.id)

      this.logger.log(`Scrape job completed for ${store.name}: found=${found}, swept stale=${swept}`)
    } catch (error) {
      this.logger.error(`Scrape job failed for ${store.name}: ${error}`)
      await this.prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: 'failed' as ScrapeJobStatus,
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      })

      await this.prisma.store.update({
        where: { id: store.id },
        data: {
          lastErrorAt: new Date(),
          lastErrorMessage: error instanceof Error ? error.message : String(error),
        },
      })
      // Чекпойнты НЕ чистим — чтобы возобновить с места падения. Останавливаем heartbeat.
      this.stopHeartbeatsForStore(store.id)
    }
  }

  /**
   * Валидация результата прогона: отличаем настоящий результат от блокировки/VPN.
   * 0 офферов → почти всегда блок (страница без вин). Резкая просадка относительно
   * прошлого успешного прогона → подозрение на частичную блокировку. Порог: доля
   * SCRAPER_MIN_RATIO от прошлого успеха ИЛИ абсолютный минимум store.configJson.minOffers.
   */
  private async validateRun(store: Store, found: number, jobId: string): Promise<{ ok: boolean; reason?: string }> {
    if (found === 0) {
      return { ok: false, reason: 'Собрано 0 офферов — вероятна блокировка/VPN (страница без вин)' }
    }
    const lastSuccess = await this.prisma.scrapeJob.findFirst({
      where: { storeId: store.id, status: 'success', id: { not: jobId } },
      orderBy: { finishedAt: 'desc' },
    })
    const baseline = lastSuccess?.foundCount ?? 0
    const floor = (store.configJson as any)?.minOffers
    const minByBaseline = baseline > 0 ? Math.floor(baseline * this.MIN_RATIO) : 0
    const minRequired = Math.max(typeof floor === 'number' ? floor : 0, minByBaseline)
    if (minRequired > 0 && found < minRequired) {
      return {
        ok: false,
        reason: `Собрано ${found} < порога ${minRequired} (прошлый успех ${baseline}) — вероятна частичная блокировка`,
      }
    }
    return { ok: true }
  }

  /**
   * Mark-and-sweep: удаляет офферы, не обновлённые в текущем логическом прогоне
   * (raw_offer.collectedAt < cutoff). collectedAt освежается при каждом пересохранении,
   * поэтому переживает резюме (новый jobId) и корректно убирает старые цены/исчезнувшие
   * позиции. Зависимые discount_offer удаляем первыми (FK optional → иначе осиротеют).
   */
  private async sweepStaleOffers(storeId: string, cutoff: Date): Promise<number> {
    const stale = await this.prisma.rawOffer.findMany({
      where: { storeId, collectedAt: { lt: cutoff } },
      select: { id: true },
    })
    const ids = stale.map((s) => s.id)
    if (ids.length === 0) return 0
    await this.prisma.discountOffer.deleteMany({ where: { rawOfferId: { in: ids } } })
    await this.prisma.rawOffer.deleteMany({ where: { id: { in: ids } } })
    return ids.length
  }

  private stopHeartbeatsForStore(storeId: string) {
    this.heartbeatIntervals.forEach((interval, key) => {
      if (key.startsWith(storeId)) {
        clearInterval(interval)
        this.heartbeatIntervals.delete(key)
      }
    })
  }

  /**
   * In-app сторож застрявших джоб: каждые 60с ищет «running»-джобы с протухшим
   * heartbeat (процесс жив, но конкретная джоба зависла) и переснимает их с чекпойнта.
   * Новые скрапы по расписанию НЕ запускает — только оживляет уже запущенные вручную.
   */
  startStallWatchdog() {
    if (this.stallWatchdog) return
    this.stallWatchdog = setInterval(() => {
      this.checkStalledJobs().catch((e) => this.logger.error(`Stall watchdog error: ${e}`))
    }, 60000)
    this.logger.log(`Stall watchdog started (interval 60s, stall threshold ${Math.round(this.STALL_MS / 1000)}s)`)
  }

  private async checkStalledJobs() {
    const cutoff = new Date(Date.now() - this.STALL_MS)
    const staleCps = await this.prisma.scrapeCheckpoint.findMany({
      where: { heartbeatAt: { lt: cutoff } },
      distinct: ['storeId'],
    })
    if (staleCps.length === 0) return
    const storeIds = staleCps.map((c) => c.storeId)
    const stalled = await this.prisma.scrapeJob.findMany({
      where: { status: 'running', storeId: { in: storeIds } },
      include: { store: true },
    })
    for (const job of stalled) {
      this.logger.warn(`Stall watchdog: ${job.store.name} heartbeat протух → возобновляю с чекпойнта`)
      await this.prisma.scrapeJob.updateMany({
        where: { storeId: job.storeId, status: 'running' },
        data: { status: 'failed', errorMessage: 'Зависание (heartbeat протух), возобновление с чекпойнта' },
      })
      if (this.schedulerService) {
        this.schedulerService.runManualScrape(job.storeId).catch((err) =>
          this.logger.error(`Failed to resume stalled scrape for ${job.store.name}: ${err}`),
        )
      }
    }
  }

  private computeContentHash(storeId: string, offer: { url: string; title: string; currentPrice?: number; oldPrice?: number; availability?: string }): string {
    const parts = [storeId, offer.url, offer.title, String(offer.currentPrice ?? ''), String(offer.oldPrice ?? ''), offer.availability ?? '']
    const str = parts.join('|')
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return Math.abs(hash).toString(36)
  }
}

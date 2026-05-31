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

        return { created: createdCount, updated: updatedCount, normalized: newRawIds.length }
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
      })

      if (existingCheckpoints.length === 0) {
        await this.prisma.rawOffer.deleteMany({ where: { storeId: store.id } })
        await this.prisma.discountOffer.deleteMany({ where: { storeId: store.id } })
        this.logger.log(`Cleared old data for ${store.name}`)
      } else {
        this.logger.log(`Resuming ${store.name} from ${existingCheckpoints.length} checkpoint(s)`)
      }

      const result = await scraper.scrape(store, job.id, callbacks, {
      saveCheckpoint: (category, pageNum, lastUrl, offersCollected) => {
        this.logger.log(`Checkpoint saved: ${category} | page=${pageNum} | offers=${offersCollected}`)
        return this.saveCheckpoint(store.id, category, pageNum, lastUrl, offersCollected)
      },
        startHeartbeat: (category) => startHeartbeat(category),
        stopHeartbeat: (category) => stopHeartbeat(category),
      })

      await this.prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: 'success' as ScrapeJobStatus,
          finishedAt: new Date(),
          foundCount: result.offers.length,
        },
      })

      await this.prisma.store.update({
        where: { id: store.id },
        data: { lastSuccessAt: new Date() },
      })

      await this.clearAllCheckpoints(store.id)

      this.heartbeatIntervals.forEach((interval, key) => {
        if (key.startsWith(store.id)) clearInterval(interval)
      })

      this.logger.log(`Scrape job completed for ${store.name}: found=${result.offers.length}`)
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

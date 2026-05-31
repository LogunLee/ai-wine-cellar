import { Injectable, Logger } from '@nestjs/common'
import { StoresService } from '../stores/stores.service'
import { ScraperService } from '../scraper/scraper.service'
import { NormalizerService } from '../normalizer/normalizer.service'
import { PrismaService } from '../../../shared/database/prisma.service'

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name)
  private readonly CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY || '3', 10)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storesService: StoresService,
    private readonly scraperService: ScraperService,
    private readonly normalizerService: NormalizerService,
  ) {}

  // Auto-scraping disabled. Run manually via POST /admin/discount-stores/:id/run

  async runManualScrape(storeId: string) {
    const store = await this.storesService.findOne(storeId)
    await this.scraperService.runScrapeJob(store)
    await this.normalizerService.normalizeAll(storeId)
  }

  async runAllScrapeJobs() {
    this.logger.log('Clearing scrape_job and scrape_checkpoint tables')
    await this.prisma.scrapeCheckpoint.deleteMany({})
    await this.prisma.scrapeJob.deleteMany({})

    const stores = await this.storesService.findAll()
    const activeStores = stores.filter((s) => s.active)

    this.logger.log(`Starting scrape for ${activeStores.length} stores (concurrency: ${this.CONCURRENCY})`)

    const queue = [...activeStores]
    const running: Promise<void>[] = []

    const runNext = async (store: any) => {
      this.logger.log(`Starting scrape for ${store.name} (running: ${running.length + 1}/${this.CONCURRENCY})`)
      try {
        await this.scraperService.runScrapeJob(store)
        await this.normalizerService.normalizeAll(store.id)
        this.logger.log(`Completed scrape for ${store.name}`)
      } catch (error) {
        this.logger.error(`Failed scrape for ${store.name}: ${error}`)
      }
    }

    while (queue.length > 0 || running.length > 0) {
      while (queue.length > 0 && running.length < this.CONCURRENCY) {
        const store = queue.shift()!
        this.logger.log(`Queue: launching ${store.name}, queue remaining: ${queue.length}`)
        const promise = runNext(store).then(() => {
          const idx = running.indexOf(promise)
          if (idx !== -1) running.splice(idx, 1)
          this.logger.log(`Queue: ${store.name} finished, running: ${running.length}`)
        })
        running.push(promise)
      }
      if (running.length > 0) {
        this.logger.log(`Queue: waiting for one of ${running.length} running jobs`)
        await Promise.race(running)
      }
    }
    this.logger.log('All scrape jobs completed')
  }
}

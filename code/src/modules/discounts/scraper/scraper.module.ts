import { Module, OnModuleInit, forwardRef } from '@nestjs/common'
import { ScraperService } from './scraper.service'
import { TestScraper } from './test.scraper'
import { CoolCleverScraper } from './coolclever.scraper'
import { SimpleWineScraper } from './simplewine.scraper'
import { WineLabScraper } from './winelab.scraper'
import { AmwineScraper } from './amwine.scraper'
import { FortwineScraper } from './fortwine.scraper'
import { MetroScraper } from './metro.scraper'
import { LentaScraper } from './lenta.scraper'
import { GlobusScraper } from './globus.scraper'
import { NormalizerModule } from '../normalizer/normalizer.module'
import { SchedulerModule } from '../scheduler/scheduler.module'
import { SchedulerService } from '../scheduler/scheduler.service'

@Module({
  imports: [NormalizerModule, forwardRef(() => SchedulerModule)],
  providers: [ScraperService, TestScraper, CoolCleverScraper, SimpleWineScraper, WineLabScraper, AmwineScraper, FortwineScraper, MetroScraper, LentaScraper, GlobusScraper],
  exports: [ScraperService],
})
export class ScraperModule implements OnModuleInit {
  constructor(
    private readonly scraperService: ScraperService,
    private readonly schedulerService: SchedulerService,
    private readonly testScraper: TestScraper,
    private readonly coolCleverScraper: CoolCleverScraper,
    private readonly simpleWineScraper: SimpleWineScraper,
    private readonly winelabScraper: WineLabScraper,
    private readonly amwineScraper: AmwineScraper,
    private readonly fortwineScraper: FortwineScraper,
    private readonly metroScraper: MetroScraper,
    private readonly lentaScraper: LentaScraper,
    private readonly globusScraper: GlobusScraper,
  ) {}

  async onModuleInit() {
    this.scraperService.setSchedulerService(this.schedulerService)
    this.scraperService.registerScraper(this.testScraper)
    this.scraperService.registerScraper(this.coolCleverScraper)
    this.scraperService.registerScraper(this.simpleWineScraper)
    this.scraperService.registerScraper(this.winelabScraper)
    this.scraperService.registerScraper(this.amwineScraper)
    this.scraperService.registerScraper(this.fortwineScraper)
    this.scraperService.registerScraper(this.metroScraper)
    this.scraperService.registerScraper(this.lentaScraper)
    this.scraperService.registerScraper(this.globusScraper)
    await this.scraperService.resumeAllStalled()
    this.scraperService.startStallWatchdog()
  }
}

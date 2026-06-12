import { Module, forwardRef } from '@nestjs/common'
import { StoresModule } from '../stores/stores.module'
import { ScraperModule } from '../scraper/scraper.module'
import { NormalizerModule } from '../normalizer/normalizer.module'
import { SchedulerService } from './scheduler.service'

@Module({
  imports: [forwardRef(() => StoresModule), ScraperModule, NormalizerModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

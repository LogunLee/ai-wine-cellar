import { Module } from '@nestjs/common'
import { StoresModule } from './stores/stores.module'
import { ScraperModule } from './scraper/scraper.module'
import { NormalizerModule } from './normalizer/normalizer.module'
import { DiscountsModule } from './discounts/discounts.module'
import { SchedulerModule } from './scheduler/scheduler.module'

@Module({
  imports: [StoresModule, ScraperModule, NormalizerModule, DiscountsModule, SchedulerModule],
  exports: [StoresModule, ScraperModule, NormalizerModule, DiscountsModule, SchedulerModule],
})
export class DiscountsFeatureModule {}

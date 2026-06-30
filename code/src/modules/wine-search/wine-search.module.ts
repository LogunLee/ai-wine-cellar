import { Module } from '@nestjs/common'
import { AiSettingsModule } from '../ai-settings/ai-settings.module'
import { WineSearchController } from './wine-search.controller'
import { WineSearchService } from './wine-search.service'

@Module({
  imports: [AiSettingsModule],
  controllers: [WineSearchController],
  providers: [WineSearchService],
})
export class WineSearchModule {}

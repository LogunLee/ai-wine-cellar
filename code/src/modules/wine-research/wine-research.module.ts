import { Module } from '@nestjs/common'
import { AiSettingsModule } from '../ai-settings/ai-settings.module'
import { WineResearchController } from './wine-research.controller'
import { WineResearchService } from './wine-research.service'

@Module({
  imports: [AiSettingsModule],
  controllers: [WineResearchController],
  providers: [WineResearchService],
})
export class WineResearchModule {}

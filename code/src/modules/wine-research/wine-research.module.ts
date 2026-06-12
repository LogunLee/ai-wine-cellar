import { Module } from '@nestjs/common'
import { AiModelsModule } from '../ai-models/ai-models.module'
import { WineResearchController } from './wine-research.controller'
import { WineResearchService } from './wine-research.service'

@Module({
  imports: [AiModelsModule],
  controllers: [WineResearchController],
  providers: [WineResearchService],
})
export class WineResearchModule {}

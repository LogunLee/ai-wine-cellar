import { Module } from '@nestjs/common'
import { AiModelsModule } from '../ai-models/ai-models.module'
import { WineSearchController } from './wine-search.controller'
import { WineSearchService } from './wine-search.service'

@Module({
  imports: [AiModelsModule],
  controllers: [WineSearchController],
  providers: [WineSearchService],
})
export class WineSearchModule {}

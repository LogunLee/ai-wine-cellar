import { Module } from '@nestjs/common'
import { AiSettingsModule } from '../ai-settings/ai-settings.module'
import { CellarAiSearchController } from './cellar-ai-search.controller'
import { CellarAiSearchService } from './cellar-ai-search.service'
import { EmbeddingService } from './embedding.service'
import { KbIndexService } from './kb-index.service'

@Module({
  imports: [AiSettingsModule],
  controllers: [CellarAiSearchController],
  providers: [CellarAiSearchService, EmbeddingService, KbIndexService],
  exports: [CellarAiSearchService, EmbeddingService, KbIndexService],
})
export class CellarAiSearchModule {}

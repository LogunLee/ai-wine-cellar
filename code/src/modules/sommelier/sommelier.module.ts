import { Module } from '@nestjs/common'
import { AiSettingsModule } from '../ai-settings/ai-settings.module'
import { CellarAiSearchModule } from '../cellar-ai-search/cellar-ai-search.module'
import { SommelierController } from './sommelier.controller'
import { SommelierService } from './sommelier.service'

@Module({
  imports: [AiSettingsModule, CellarAiSearchModule],
  controllers: [SommelierController],
  providers: [SommelierService],
})
export class SommelierModule {}

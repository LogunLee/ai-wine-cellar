import { Module } from '@nestjs/common'
import { WineCellarService } from './wine-cellar.service'
import { WineCellarController, CountriesController } from './wine-cellar.controller'
import { VivinoModule } from '../vivino/vivino.module'
import { WineCriticModule } from '../wine-critic/wine-critic.module'
import { CellarAiSearchModule } from '../cellar-ai-search/cellar-ai-search.module'

@Module({
  imports: [VivinoModule, WineCriticModule, CellarAiSearchModule],
  providers: [WineCellarService],
  controllers: [WineCellarController, CountriesController],
  exports: [WineCellarService],
})
export class WineCellarModule {}

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { DatabaseModule } from './shared/database/database.module'
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/user/user.module'
import { AiModelsModule } from './modules/ai-models/ai-models.module'
import { AiSettingsModule } from './modules/ai-settings/ai-settings.module'
import { WineSearchModule } from './modules/wine-search/wine-search.module'
import { WineResearchModule } from './modules/wine-research/wine-research.module'
import { WineCellarModule } from './modules/wine-cellar/wine-cellar.module'
import { CellarAiSearchModule } from './modules/cellar-ai-search/cellar-ai-search.module'
import { SommelierModule } from './modules/sommelier/sommelier.module'
import { TastingNotesModule } from './modules/tasting-notes/tasting-notes.module'
import { DiscountsFeatureModule } from './modules/discounts/discounts-feature.module'
import { PushModule } from './modules/push/push.module'
import { VivinoModule } from './modules/vivino/vivino.module'
import { WineCriticModule } from './modules/wine-critic/wine-critic.module'
import { FactsModule } from './modules/facts/facts.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UserModule,
    AiModelsModule,
    AiSettingsModule,
    WineSearchModule,
    WineResearchModule,
    WineCellarModule,
    CellarAiSearchModule,
    SommelierModule,
    TastingNotesModule,
    DiscountsFeatureModule,
    PushModule,
    VivinoModule,
    WineCriticModule,
    FactsModule,
  ],
})
export class AppModule {}

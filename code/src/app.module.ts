import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/user/user.module'
import { AiModelsModule } from './modules/ai-models/ai-models.module'
import { WineSearchModule } from './modules/wine-search/wine-search.module'
import { WineResearchModule } from './modules/wine-research/wine-research.module'
import { WineCellarModule } from './modules/wine-cellar/wine-cellar.module'
import { DiscountsFeatureModule } from './modules/discounts/discounts-feature.module'
import { PushModule } from './modules/push/push.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AuthModule,
    UserModule,
    AiModelsModule,
    WineSearchModule,
    WineResearchModule,
    WineCellarModule,
    DiscountsFeatureModule,
    PushModule,
  ],
})
export class AppModule {}

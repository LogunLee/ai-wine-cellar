import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/user/user.module'
import { AiModelsModule } from './modules/ai-models/ai-models.module'
import { WineSearchModule } from './modules/wine-search/wine-search.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    UserModule,
    AiModelsModule,
    WineSearchModule,
  ],
})
export class AppModule {}

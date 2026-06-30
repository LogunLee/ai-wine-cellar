import { Module } from '@nestjs/common'
import { KeyCryptoService } from '../../shared/crypto/key-crypto.service'
import { AiModelsModule } from '../ai-models/ai-models.module'
import { AiCatalogSeeder } from './ai-catalog.seeder'
import { AiRouterService } from './ai-router.service'
import { AiSettingsService } from './ai-settings.service'
import { AiSettingsController } from './ai-settings.controller'

@Module({
  imports: [AiModelsModule],
  controllers: [AiSettingsController],
  providers: [KeyCryptoService, AiCatalogSeeder, AiRouterService, AiSettingsService],
  exports: [AiRouterService],
})
export class AiSettingsModule {}

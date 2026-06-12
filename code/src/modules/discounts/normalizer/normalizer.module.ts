import { Module } from '@nestjs/common'
import { AiModelsModule } from '../../ai-models/ai-models.module'
import { NormalizerService } from './normalizer.service'
import { RegionResolverService } from './region-resolver.service'
import { GrapeResolverService } from './grape-resolver.service'

@Module({
  imports: [AiModelsModule],
  providers: [NormalizerService, RegionResolverService, GrapeResolverService],
  exports: [NormalizerService, RegionResolverService, GrapeResolverService],
})
export class NormalizerModule {}

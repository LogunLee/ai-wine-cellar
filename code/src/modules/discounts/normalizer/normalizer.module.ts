import { Module } from '@nestjs/common'
import { PrismaService } from '../../../shared/database/prisma.service'
import { AiModelsService } from '../../ai-models/ai-models.service'
import { NormalizerService } from './normalizer.service'
import { RegionResolverService } from './region-resolver.service'
import { GrapeResolverService } from './grape-resolver.service'

@Module({
  providers: [PrismaService, AiModelsService, NormalizerService, RegionResolverService, GrapeResolverService],
  exports: [NormalizerService, RegionResolverService, GrapeResolverService],
})
export class NormalizerModule {}

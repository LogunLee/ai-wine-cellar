import { Module } from '@nestjs/common'
import { PrismaService } from '../../../shared/database/prisma.service'
import { AiModelsService } from '../../ai-models/ai-models.service'
import { NormalizerService } from './normalizer.service'

@Module({
  providers: [PrismaService, AiModelsService, NormalizerService],
  exports: [NormalizerService],
})
export class NormalizerModule {}

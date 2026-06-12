import { Module } from '@nestjs/common'
import { VivinoService } from './vivino.service'
import { VivinoController } from './vivino.controller'

@Module({
  controllers: [VivinoController],
  providers: [VivinoService],
  exports: [VivinoService],
})
export class VivinoModule {}

import { Module, forwardRef } from '@nestjs/common'
import { StoresService } from './stores.service'
import { StoresController } from './stores.controller'
import { SchedulerModule } from '../scheduler/scheduler.module'
import { NormalizerModule } from '../normalizer/normalizer.module'

@Module({
  imports: [forwardRef(() => SchedulerModule), NormalizerModule],
  providers: [StoresService],
  controllers: [StoresController],
  exports: [StoresService],
})
export class StoresModule {}

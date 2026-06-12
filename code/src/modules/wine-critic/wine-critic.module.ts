import { Module } from '@nestjs/common'
import { WineCriticService } from './wine-critic.service'
import { WineCriticController } from './wine-critic.controller'

@Module({
  controllers: [WineCriticController],
  providers: [WineCriticService],
  exports: [WineCriticService],
})
export class WineCriticModule {}

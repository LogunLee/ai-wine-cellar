import { Module } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'
import { WineCellarService } from './wine-cellar.service'
import { WineCellarController, CountriesController } from './wine-cellar.controller'
import { VivinoModule } from '../vivino/vivino.module'
import { WineCriticModule } from '../wine-critic/wine-critic.module'

@Module({
  imports: [VivinoModule, WineCriticModule],
  providers: [PrismaService, WineCellarService],
  controllers: [WineCellarController, CountriesController],
  exports: [WineCellarService],
})
export class WineCellarModule {}

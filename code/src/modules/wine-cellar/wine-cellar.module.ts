import { Module } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'
import { WineCellarService } from './wine-cellar.service'
import { WineCellarController, CountriesController } from './wine-cellar.controller'

@Module({
  imports: [],
  providers: [PrismaService, WineCellarService],
  controllers: [WineCellarController, CountriesController],
  exports: [WineCellarService],
})
export class WineCellarModule {}

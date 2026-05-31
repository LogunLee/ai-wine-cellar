import { Module } from '@nestjs/common'
import { PrismaService } from '../../../shared/database/prisma.service'
import { DiscountsService } from './discounts.service'
import { DiscountsController } from './discounts.controller'

@Module({
  providers: [PrismaService, DiscountsService],
  controllers: [DiscountsController],
  exports: [DiscountsService],
})
export class DiscountsModule {}

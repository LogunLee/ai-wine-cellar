import { Module } from '@nestjs/common'
import { DiscountsService } from './discounts.service'
import { DiscountsController } from './discounts.controller'
import { ImageProxyService } from './image-proxy.service'
import { ImageProxyController } from './image-proxy.controller'

@Module({
  providers: [DiscountsService, ImageProxyService],
  controllers: [DiscountsController, ImageProxyController],
  exports: [DiscountsService],
})
export class DiscountsModule {}

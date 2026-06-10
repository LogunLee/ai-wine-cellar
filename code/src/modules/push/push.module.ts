import { Module } from '@nestjs/common'
import { PushService } from './push.service'
import { PushController } from './push.controller'
import { PrismaService } from '../../shared/database/prisma.service'

@Module({
  controllers: [PushController],
  providers: [PushService, PrismaService],
  exports: [PushService],
})
export class PushModule {}

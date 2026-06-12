import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/**
 * Единственный экземпляр PrismaService (один пул соединений pg) на всё приложение.
 * Модули НЕ должны добавлять PrismaService в свои providers — иначе Nest создаст
 * отдельный PrismaClient с собственным пулом на каждый модуль.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}

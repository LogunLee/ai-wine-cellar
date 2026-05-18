import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PrismaService } from '../../shared/database/prisma.service'
import { JwtStrategy } from '../auth/jwt.strategy'
import { AiModelsModule } from '../ai-models/ai-models.module'
import { WineSearchController } from './wine-search.controller'
import { WineSearchService } from './wine-search.service'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    AiModelsModule,
  ],
  controllers: [WineSearchController],
  providers: [PrismaService, WineSearchService, JwtStrategy],
})
export class WineSearchModule {}

import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PrismaService } from '../../shared/database/prisma.service'
import { JwtStrategy } from '../auth/jwt.strategy'
import { AiModelsModule } from '../ai-models/ai-models.module'
import { WineResearchController } from './wine-research.controller'
import { WineResearchService } from './wine-research.service'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    AiModelsModule,
  ],
  controllers: [WineResearchController],
  providers: [PrismaService, WineResearchService, JwtStrategy],
})
export class WineResearchModule {}

import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PrismaService } from '../../shared/database/prisma.service'
import { JwtStrategy } from '../auth/jwt.strategy'
import { AiModelsController } from './ai-models.controller'
import { AiModelsService } from './ai-models.service'

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
  ],
  controllers: [AiModelsController],
  providers: [PrismaService, AiModelsService, JwtStrategy],
  exports: [AiModelsService],
})
export class AiModelsModule {}

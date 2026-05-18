import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as { id: string }
    const tokens = await this.authService.generateTokens(user.id)

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173')
    const params = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    })

    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`)
  }

  @Post('refresh')
  async refresh(@Body() body: { refresh_token: string }) {
    return this.authService.refreshTokens(body.refresh_token)
  }

  @Post('logout')
  async logout(@Req() req: Request, @Body() body: { refresh_token: string }) {
    const user = req.user as { userId: string } | undefined
    if (user) {
      await this.authService.revokeRefreshToken(user.userId, body.refresh_token)
    }
    return { message: 'Logged out' }
  }

  @Get('me')
  async me(@Req() req: Request) {
    const user = req.user as { userId: string }
    return this.authService.getMe(user.userId)
  }
}

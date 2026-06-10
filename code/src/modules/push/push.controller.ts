import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Request } from 'express'
import { PushService } from './push.service'

@Controller('admin/push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('send-all')
  async sendAll(@Body() body: { title: string; body: string; route?: string }) {
    await this.pushService.sendToAll({
      title: body.title,
      body: body.body,
      data: body.route ? { route: body.route } : undefined,
    })
    return { ok: true }
  }

  @Post('send-me')
  @UseGuards(AuthGuard('jwt'))
  async sendMe(
    @Req() req: Request,
    @Body() body: { title: string; body: string; route?: string },
  ) {
    const user = req.user as { userId: string }
    await this.pushService.sendToUser(user.userId, {
      title: body.title,
      body: body.body,
      data: body.route ? { route: body.route } : undefined,
    })
    return { ok: true }
  }
}

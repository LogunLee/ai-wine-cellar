import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Response } from 'express'
import { CurrentUser } from '../../shared/auth/current-user.decorator'
import type { AuthUser } from '../../shared/auth/current-user.decorator'
import { SommelierService } from './sommelier.service'
import type { SendMessageDto } from './sommelier.dto'

@Controller('sommelier')
@UseGuards(AuthGuard('jwt'))
export class SommelierController {
  constructor(private readonly sommelier: SommelierService) {}

  /** Создать новый диалог. */
  @Post('sessions')
  createSession(@CurrentUser() user: AuthUser) {
    return this.sommelier.createSession(user.userId)
  }

  /** Список прошлых диалогов (история). */
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser) {
    return this.sommelier.listSessions(user.userId)
  }

  /** Диалог с сообщениями. */
  @Get('sessions/:id')
  getSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sommelier.getSession(user.userId, id)
  }

  /** Удалить диалог. */
  @Delete('sessions/:id')
  async deleteSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.sommelier.deleteSession(user.userId, id)
    return { ok: true }
  }

  /** Отправить сообщение в диалог → ответ сомелье (текст + picks). */
  @Post('sessions/:id/messages')
  sendMessage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SendMessageDto) {
    return this.sommelier.sendMessage(user.userId, id, body?.text ?? '')
  }

  /** То же, но потоком (NDJSON): печать ответа по мере генерации. */
  @Post('sessions/:id/messages/stream')
  async streamMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @Res() res: Response,
  ) {
    await this.sommelier.streamMessage(user.userId, id, body?.text ?? '', res)
  }
}

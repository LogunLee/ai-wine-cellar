import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../../shared/auth/current-user.decorator'
import type { AuthUser } from '../../shared/auth/current-user.decorator'
import { AiSettingsService } from './ai-settings.service'

@Controller('ai')
@UseGuards(AuthGuard('jwt'))
export class AiSettingsController {
  constructor(private readonly aiSettings: AiSettingsService) {}

  @Get('catalog')
  getCatalog() {
    return this.aiSettings.getCatalog()
  }

  @Get('settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.aiSettings.getSettings(user.userId)
  }

  @Put('providers/:code/key')
  saveKey(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() body: { apiKey: string },
  ) {
    return this.aiSettings.saveProviderKey(user.userId, code, body.apiKey)
  }

  @Post('providers/:code/key/test')
  testKey(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.aiSettings.testProviderKey(user.userId, code)
  }

  @Delete('providers/:code/key')
  deleteKey(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.aiSettings.deleteProviderKey(user.userId, code)
  }

  @Put('tasks/:code/setting')
  saveTaskSetting(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() body: { modelId: string; customPrompt?: string | null },
  ) {
    return this.aiSettings.saveTaskSetting(user.userId, code, body)
  }

  @Delete('tasks/:code/setting')
  deleteTaskSetting(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.aiSettings.deleteTaskSetting(user.userId, code)
  }
}

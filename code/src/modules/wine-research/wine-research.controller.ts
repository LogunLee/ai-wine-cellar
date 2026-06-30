import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../../shared/auth/current-user.decorator'
import type { AuthUser } from '../../shared/auth/current-user.decorator'
import { WineResearchService } from './wine-research.service'
import type { WineResearchInput, WineResearchResult } from './wine-research.service'

@Controller('wine-research')
@UseGuards(AuthGuard('jwt'))
export class WineResearchController {
  constructor(private readonly wineResearchService: WineResearchService) {}

  @Post('research')
  async research(
    @CurrentUser() user: AuthUser,
    @Body() body: WineResearchInput,
  ): Promise<WineResearchResult> {
    return this.wineResearchService.researchWine(user.userId, body)
  }
}

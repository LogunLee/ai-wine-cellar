import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { WineResearchService } from './wine-research.service'
import type { WineResearchInput, WineResearchResult } from './wine-research.service'

@Controller('wine-research')
@UseGuards(AuthGuard('jwt'))
export class WineResearchController {
  constructor(private readonly wineResearchService: WineResearchService) {}

  @Post('research')
  async research(@Body() body: WineResearchInput): Promise<WineResearchResult> {
    return this.wineResearchService.researchWine(body)
  }
}

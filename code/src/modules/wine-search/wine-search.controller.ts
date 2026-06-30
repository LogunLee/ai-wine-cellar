import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../../shared/auth/current-user.decorator'
import type { AuthUser } from '../../shared/auth/current-user.decorator'
import { WineSearchService, WineRecognitionResult } from './wine-search.service'

@Controller('wine-search')
@UseGuards(AuthGuard('jwt'))
export class WineSearchController {
  constructor(private readonly wineSearchService: WineSearchService) {}

  @Post('recognize')
  async recognize(
    @CurrentUser() user: AuthUser,
    @Body() body: { images: string[] },
  ): Promise<{ wines: WineRecognitionResult[] }> {
    const wines = await this.wineSearchService.recognizeWinesFromImages(user.userId, body.images)
    return { wines }
  }

  @Post('text-search')
  async textSearch(
    @CurrentUser() user: AuthUser,
    @Body() body: { text: string },
  ): Promise<{ wines: WineRecognitionResult[] }> {
    const wines = await this.wineSearchService.recognizeWineFromText(user.userId, body.text)
    return { wines }
  }
}

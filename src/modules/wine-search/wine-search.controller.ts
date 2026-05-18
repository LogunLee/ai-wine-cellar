import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { WineSearchService, WineRecognitionResult } from './wine-search.service'

@Controller('wine-search')
@UseGuards(AuthGuard('jwt'))
export class WineSearchController {
  constructor(private readonly wineSearchService: WineSearchService) {}

  @Post('recognize')
  async recognize(@Body() body: { imageBase64: string }): Promise<{ wines: WineRecognitionResult[] }> {
    const wines = await this.wineSearchService.recognizeWinesFromImage(body.imageBase64)
    return { wines }
  }
}

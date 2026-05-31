import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { WineSearchService, WineRecognitionResult } from './wine-search.service'

@Controller('wine-search')
@UseGuards(AuthGuard('jwt'))
export class WineSearchController {
  constructor(private readonly wineSearchService: WineSearchService) {}

  @Post('recognize')
  async recognize(@Body() body: { images: string[] }): Promise<{ wines: WineRecognitionResult[] }> {
    try {
      console.log('[wine-search] Incoming request, images count:', body.images?.length)
      const wines = await this.wineSearchService.recognizeWinesFromImages(body.images)
      return { wines }
    } catch (error) {
      console.error('[wine-search] Error:', error)
      throw error
    }
  }

  @Post('text-search')
  async textSearch(@Body() body: { text: string }): Promise<{ wines: WineRecognitionResult[] }> {
    try {
      console.log('[wine-search] Text search:', body.text)
      const wines = await this.wineSearchService.recognizeWineFromText(body.text)
      return { wines }
    } catch (error: any) {
      console.error('[wine-search] Text search error:', error)
      console.error('[wine-search] Stack:', error?.stack)
      throw new Error(error?.message || 'Text search failed')
    }
  }
}

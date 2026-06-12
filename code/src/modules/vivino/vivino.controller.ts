import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { VivinoService } from './vivino.service'

@Controller('vivino')
@UseGuards(AuthGuard('jwt'))
export class VivinoController {
  constructor(private readonly vivinoService: VivinoService) {}

  @Get('search')
  async search(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return { results: [] }
    const results = await this.vivinoService.searchResults(q.trim())
    return { results }
  }
}

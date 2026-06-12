import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { WineCriticService } from './wine-critic.service'

@Controller('wine-critic')
@UseGuards(AuthGuard('jwt'))
export class WineCriticController {
  constructor(private readonly wineCriticService: WineCriticService) {}

  @Get('search')
  async search(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return { results: [] }
    return { results: await this.wineCriticService.searchResults(q.trim()) }
  }
}

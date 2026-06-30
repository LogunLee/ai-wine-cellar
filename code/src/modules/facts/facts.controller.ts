import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { FactsService } from './facts.service'

@Controller('facts')
@UseGuards(AuthGuard('jwt'))
export class FactsController {
  constructor(private readonly facts: FactsService) {}

  /** Интересные факты дня (детерминированы по дате, кэш на сутки). */
  @Get('daily')
  async daily(@Query('count') count?: string) {
    const n = Math.min(5, Math.max(1, parseInt(count ?? '3', 10) || 3))
    return { facts: await this.facts.getDaily(n) }
  }
}

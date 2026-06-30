import { Body, Controller, Param, Post, Put, UseGuards, BadRequestException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../../shared/auth/current-user.decorator'
import type { AuthUser } from '../../shared/auth/current-user.decorator'
import { PrismaService } from '../../shared/database/prisma.service'
import { CellarAiSearchService } from './cellar-ai-search.service'
import { KbIndexService } from './kb-index.service'
import type { AiSearchDto, SaveDescriptionDto } from './cellar-ai-search.dto'

@Controller('wine-cellar')
@UseGuards(AuthGuard('jwt'))
export class CellarAiSearchController {
  constructor(
    private readonly search: CellarAiSearchService,
    private readonly kbIndex: KbIndexService,
    private readonly prisma: PrismaService,
  ) {}

  /** Умный подбор вина из погреба по свободному запросу. */
  @Post('ai-search')
  async aiSearch(@CurrentUser() user: AuthUser, @Body() body: AiSearchDto) {
    const query = (body?.query ?? '').trim()
    if (!query) throw new BadRequestException('Пустой запрос')
    return this.search.search(user.userId, query)
  }

  /** Сохранить описание бутылки (из внешних источников) и переиндексировать её векторно. */
  @Put(':id/description')
  async saveDescription(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SaveDescriptionDto,
  ) {
    const data: Record<string, string | null> = {}
    if (body.userDescription !== undefined) data.userDescription = body.userDescription
    if (body.sellerDescription !== undefined) data.sellerDescription = body.sellerDescription

    const updated = await this.prisma.cellarItem.updateMany({
      where: { id, cellar: { ownerId: user.userId } },
      data,
    })
    if (updated.count === 0) throw new BadRequestException('Бутылка не найдена')

    // best-effort re-index (no-op if VOYAGE/pgvector not active yet)
    const reindex = await this.kbIndex.indexCellarItemDescriptions(id).catch(() => ({ chunks: 0 }))
    return { ok: true, chunks: reindex.chunks }
  }
}

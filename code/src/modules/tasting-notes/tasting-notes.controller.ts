import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../../shared/auth/current-user.decorator'
import type { AuthUser } from '../../shared/auth/current-user.decorator'
import { TastingNotesService } from './tasting-notes.service'
import { VivinoNoteService } from './vivino-note.service'
import type {
  CreateTastingNoteDto,
  ListTastingNotesQuery,
  SaveVivinoNoteDto,
  UpdateTastingNoteDto,
} from './tasting-notes.dto'

@Controller('tasting-notes')
@UseGuards(AuthGuard('jwt'))
export class TastingNotesController {
  constructor(
    private readonly notes: TastingNotesService,
    private readonly vivino: VivinoNoteService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: ListTastingNotesQuery) {
    return this.notes.list(user.userId, query)
  }

  /**
   * Инкрементальная синхронизация: вернуть заметки, изменённые после `since` (серверное время
   * прошлой успешной синхронизации), плюс id удалённых и текущее серверное время.
   * Без `since` — полная выгрузка существующих заметок.
   */
  @Get('sync')
  async sync(@CurrentUser() user: AuthUser, @Query('since') since?: string) {
    return this.notes.syncChanges(user.userId, since)
  }

  @Get(':id')
  async getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notes.getOne(user.userId, id)
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateTastingNoteDto) {
    return this.notes.create(user.userId, body)
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateTastingNoteDto) {
    return this.notes.update(user.userId, id, body)
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.notes.remove(user.userId, id)
    return { message: 'Удалено' }
  }

  /** Сгенерировать Vivino-текст. НЕ сохраняет результат — только возвращает его. */
  @Post(':id/generate-vivino-note')
  async generateVivino(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const note = await this.notes.getForGeneration(user.userId, id)
    const vivinoNoteText = await this.vivino.generate(user.userId, note)
    return { vivinoNoteText }
  }

  /** Сохранить/обновить Vivino-версию (сценарий «в дополнение к исходной»). */
  @Patch(':id/vivino-note')
  async saveVivino(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SaveVivinoNoteDto) {
    return this.notes.saveVivinoNote(user.userId, id, body?.vivinoNoteText ?? '')
  }

  /** Удалить только Vivino-версию; личная заметка не меняется. */
  @Delete(':id/vivino-note')
  async deleteVivino(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notes.deleteVivinoNote(user.userId, id)
  }
}

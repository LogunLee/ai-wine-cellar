import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, WineType } from '@prisma/client'
import { PrismaService } from '../../shared/database/prisma.service'
import {
  CreateTastingNoteDto,
  ListTastingNotesQuery,
  ManualWineInput,
  SyncTastingNotesResult,
  TastingNoteView,
  TastingNoteWine,
  UpdateTastingNoteDto,
} from './tasting-notes.dto'

const TEXT_MAX = 5000
const RATING_MIN = 1
const RATING_MAX = 5
const EXCERPT_LEN = 200
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/** Заметка с подгруженной карточкой вина — основа для маппинга в API-форму. */
const noteInclude = {
  cellarItem: {
    include: { wineVintage: { include: { series: { include: { country: true } } } } },
  },
} satisfies Prisma.TastingNoteInclude

type NoteWithWine = Prisma.TastingNoteGetPayload<{ include: typeof noteInclude }>

@Injectable()
export class TastingNotesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────── list ───────────────────────────
  async list(userId: string, q: ListTastingNotesQuery) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1)
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))

    const where: Prisma.TastingNoteWhereInput = { userId, deletedAt: null }

    const ratingMin = q.rating_min ? parseFloat(q.rating_min) : undefined
    const ratingMax = q.rating_max ? parseFloat(q.rating_max) : undefined
    if (ratingMin !== undefined && !Number.isNaN(ratingMin)) where.rating = { gte: ratingMin }
    if (ratingMax !== undefined && !Number.isNaN(ratingMax)) {
      where.rating = { ...(where.rating as object), lte: ratingMax }
    }

    // Фильтры по типу/стране/региону работают только если данные есть у связанной карточки вина.
    const seriesFilter: Prisma.WineSeriesWhereInput = {}
    const search = q.search?.trim()
    if (search) {
      seriesFilter.OR = [
        { producer: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ]
    }
    const wineType = this.parseWineType(q.wine_type)
    if (wineType) seriesFilter.wineType = wineType
    const region = q.region?.trim()
    if (region) seriesFilter.region = { contains: region, mode: 'insensitive' }
    const country = q.country?.trim()
    if (country) {
      seriesFilter.country = {
        OR: [
          { iso2: country.toUpperCase() },
          { name: { contains: country, mode: 'insensitive' } },
          { nameRu: { contains: country, mode: 'insensitive' } },
        ],
      }
    }
    if (Object.keys(seriesFilter).length > 0) {
      where.cellarItem = { wineVintage: { series: seriesFilter } }
    }

    // Быстрый фильтр по году создания заметки (календарный год).
    const createdYear = q.created_year ? parseInt(q.created_year, 10) : undefined
    if (createdYear !== undefined && !Number.isNaN(createdYear)) {
      where.createdAt = {
        gte: new Date(Date.UTC(createdYear, 0, 1)),
        lt: new Date(Date.UTC(createdYear + 1, 0, 1)),
      }
    }

    const orderBy = this.parseSort(q.sort)

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tastingNote.count({ where }),
      this.prisma.tastingNote.findMany({
        where,
        include: noteInclude,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return {
      items: rows.map((r) => this.toView(r)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  }

  // ─────────────────────────── incremental sync ───────────────────────────
  async syncChanges(userId: string, since?: string): Promise<SyncTastingNotesResult> {
    // Фиксируем СЕРВЕРНОЕ время в начале — его клиент сохранит и пришлёт как `since` далее.
    const serverTime = new Date().toISOString()

    const where: Prisma.TastingNoteWhereInput = { userId }
    const sinceDate = since ? new Date(since) : null
    if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
      // Изменённые после since — ВКЛЮЧАЯ удалённые (updatedAt бампается и при soft-delete).
      where.updatedAt = { gt: sinceDate }
    } else {
      // Первая (полная) синхронизация — только существующие.
      where.deletedAt = null
    }

    const rows = await this.prisma.tastingNote.findMany({ where, include: noteInclude })
    const changed = rows.filter((r) => !r.deletedAt).map((r) => this.toView(r))
    const deletedIds = rows.filter((r) => r.deletedAt).map((r) => r.id)
    return { serverTime, changed, deletedIds }
  }

  // ─────────────────────────── get one ───────────────────────────
  async getOne(userId: string, id: string): Promise<TastingNoteView> {
    const note = await this.findOwned(userId, id)
    return this.toView(note)
  }

  // ─────────────────────────── create ───────────────────────────
  async create(userId: string, dto: CreateTastingNoteDto): Promise<TastingNoteView> {
    // Вино опционально: можно создать заметку без вина (укажут позже) или с ручным вводом.
    const rating = this.validateRating(dto.rating)
    const tastingDate = this.validateDate(dto.tastingDate, 'дата дегустации')
    this.validateText(dto.noteText, 'note_text')

    if (dto.cellarItemId) {
      // wine_id должен ссылаться на существующее вино, принадлежащее пользователю.
      await this.assertOwnsCellarItem(userId, dto.cellarItemId)
    }
    const manual = dto.cellarItemId ? null : this.manualData(dto.manualWine)

    const created = await this.prisma.tastingNote.create({
      data: {
        userId,
        cellarItemId: dto.cellarItemId ?? null,
        ...manual,
        tastingDate,
        rating,
        vintage: dto.vintage ?? null,
        noteText: this.clean(dto.noteText),
        place: this.clean(dto.place),
        price: dto.price ?? null,
        wouldBuyAgain: dto.wouldBuyAgain ?? null,
      },
      include: noteInclude,
    })
    return this.toView(created)
  }

  // ─────────────────────────── update ───────────────────────────
  async update(userId: string, id: string, dto: UpdateTastingNoteDto): Promise<TastingNoteView> {
    await this.findOwned(userId, id)

    const data: Prisma.TastingNoteUpdateInput = {}
    // Вино можно дозаполнить позже: привязать к погребу ИЛИ ввести вручную.
    if (dto.cellarItemId !== undefined && dto.cellarItemId) {
      await this.assertOwnsCellarItem(userId, dto.cellarItemId)
      data.cellarItem = { connect: { id: dto.cellarItemId } }
      Object.assign(data, this.manualData(null)) // очистить ручные поля
    } else if (dto.manualWine !== undefined) {
      data.cellarItem = { disconnect: true }
      Object.assign(data, this.manualData(dto.manualWine))
    }
    if (dto.rating !== undefined) data.rating = this.validateRating(dto.rating)
    if (dto.tastingDate !== undefined) data.tastingDate = this.validateDate(dto.tastingDate, 'дата дегустации')
    if (dto.vintage !== undefined) data.vintage = dto.vintage ?? null
    if (dto.noteText !== undefined) {
      this.validateText(dto.noteText, 'note_text')
      data.noteText = this.clean(dto.noteText)
    }
    if (dto.place !== undefined) data.place = this.clean(dto.place)
    if (dto.price !== undefined) data.price = dto.price ?? null
    if (dto.wouldBuyAgain !== undefined) data.wouldBuyAgain = dto.wouldBuyAgain ?? null

    const updated = await this.prisma.tastingNote.update({
      where: { id },
      data,
      include: noteInclude,
    })
    return this.toView(updated)
  }

  // ─────────────────────────── delete (soft) ───────────────────────────
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id)
    await this.prisma.tastingNote.update({ where: { id }, data: { deletedAt: new Date() } })
  }

  // ─────────────────────── Vivino-версия: save / update ───────────────────────
  /** Сценарий «сохранить в дополнение»: пишем vivino_note_text, не трогая note_text. */
  async saveVivinoNote(userId: string, id: string, text: string): Promise<TastingNoteView> {
    const note = await this.findOwned(userId, id)
    const cleaned = (text ?? '').trim()
    if (!cleaned) throw new BadRequestException('Пустой текст Vivino-заметки')
    this.validateText(cleaned, 'vivino_note_text')

    const now = new Date()
    const updated = await this.prisma.tastingNote.update({
      where: { id },
      data: {
        vivinoNoteText: cleaned,
        vivinoNoteCreatedAt: note.vivinoNoteCreatedAt ?? now,
        vivinoNoteUpdatedAt: now,
      },
      include: noteInclude,
    })
    return this.toView(updated)
  }

  /** Удалить только Vivino-версию; исходная личная заметка остаётся без изменений. */
  async deleteVivinoNote(userId: string, id: string): Promise<TastingNoteView> {
    await this.findOwned(userId, id)
    const updated = await this.prisma.tastingNote.update({
      where: { id },
      data: { vivinoNoteText: null, vivinoNoteCreatedAt: null, vivinoNoteUpdatedAt: null },
      include: noteInclude,
    })
    return this.toView(updated)
  }

  /** Данные для генерации Vivino-текста (заметка + карточка вина). Бросает 404 чужому/несуществующему. */
  async getForGeneration(userId: string, id: string): Promise<NoteWithWine> {
    return this.findOwned(userId, id)
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async findOwned(userId: string, id: string): Promise<NoteWithWine> {
    const note = await this.prisma.tastingNote.findFirst({
      where: { id, userId, deletedAt: null },
      include: noteInclude,
    })
    if (!note) throw new NotFoundException('Заметка не найдена')
    return note
  }

  /** Поля manual* для записи: из ручного ввода вина либо все null (очистка). */
  private manualData(m?: ManualWineInput | null) {
    return {
      manualProducer: this.clean(m?.producer),
      manualName: this.clean(m?.name),
      manualVintageYear: m?.vintageYear ?? null,
      manualCountry: this.clean(m?.country),
      manualRegion: this.clean(m?.region),
      manualWineType: this.parseWineType(m?.wineType ?? undefined) ?? null,
    }
  }

  private async assertOwnsCellarItem(userId: string, cellarItemId: string) {
    const item = await this.prisma.cellarItem.findFirst({
      where: { id: cellarItemId, deletedAt: null, cellar: { ownerId: userId } },
      select: { id: true },
    })
    if (!item) throw new BadRequestException('Вино не найдено в вашем погребе')
  }

  private validateRating(value: unknown): number {
    const r = typeof value === 'number' ? value : parseFloat(String(value))
    // Сравниваем на сетке 0.1 с допуском на ошибку float (4.3 → 43.0000001).
    const onGrid = Math.abs(Math.round(r * 10) - r * 10) < 1e-6
    if (!Number.isFinite(r) || r < RATING_MIN || r > RATING_MAX || !onGrid) {
      throw new BadRequestException('Оценка должна быть от 1 до 5 с шагом 0,1')
    }
    return Math.round(r * 10) / 10
  }

  private validateDate(value: string, label: string): Date {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`Некорректная ${label}`)
    return d
  }

  private validateText(text: string | null | undefined, field: string) {
    if (text != null && text.length > TEXT_MAX) {
      throw new BadRequestException(`Поле ${field} не должно превышать ${TEXT_MAX} символов`)
    }
  }

  private clean(text: string | null | undefined): string | null {
    if (text == null) return null
    const t = text.trim()
    return t.length ? t : null
  }

  private parseWineType(input?: string): WineType | undefined {
    if (!input) return undefined
    const up = input.toUpperCase()
    return (Object.values(WineType) as string[]).includes(up) ? (up as WineType) : undefined
  }

  private parseSort(sort?: string): Prisma.TastingNoteOrderByWithRelationInput[] {
    switch (sort) {
      case 'rating_desc':
        return [{ rating: 'desc' }, { tastingDate: 'desc' }, { createdAt: 'desc' }]
      case 'rating_asc':
        return [{ rating: 'asc' }, { tastingDate: 'desc' }, { createdAt: 'desc' }]
      case 'tasting_date_asc':
        return [{ tastingDate: 'asc' }, { createdAt: 'asc' }]
      case 'tasting_date_desc':
      default:
        // По умолчанию: новые дегустации сверху; при равной дате — более новые по created_at.
        return [{ tastingDate: 'desc' }, { createdAt: 'desc' }]
    }
  }

  private toView(note: NoteWithWine): TastingNoteView {
    const wine = this.toWine(note)
    const noteText = note.noteText ?? null
    return {
      id: note.id,
      wine,
      vintage: note.vintage ?? wine.vintageYear,
      tastingDate: this.dateOnly(note.tastingDate),
      rating: Number(note.rating),
      noteText,
      noteExcerpt: noteText ? this.excerpt(noteText) : null,
      vivinoNoteText: note.vivinoNoteText ?? null,
      hasVivinoNote: !!note.vivinoNoteText,
      vivinoNoteCreatedAt: note.vivinoNoteCreatedAt?.toISOString() ?? null,
      vivinoNoteUpdatedAt: note.vivinoNoteUpdatedAt?.toISOString() ?? null,
      place: note.place ?? null,
      price: note.price != null ? Number(note.price) : null,
      wouldBuyAgain: note.wouldBuyAgain ?? null,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }
  }

  private toWine(note: NoteWithWine): TastingNoteWine {
    // Заметка без привязки к погребу: ручной ввод вина (или пусто, если ничего не указано).
    if (!note.cellarItem) {
      return {
        cellarItemId: null,
        producer: note.manualProducer ?? null,
        name: note.manualName ?? null,
        wineType: note.manualWineType ?? null,
        country: note.manualCountry ?? null,
        countryIso2: null,
        region: note.manualRegion ?? null,
        appellation: null,
        vintageYear: note.manualVintageYear ?? null,
        grapes: null,
        photoPath: null,
      }
    }
    const series = note.cellarItem?.wineVintage?.series
    const comp = note.cellarItem?.wineVintage?.composition as unknown
    const grapes = Array.isArray(comp)
      ? (comp as unknown[]).map((g) => (typeof g === 'string' ? g : (g as { name?: string })?.name)).filter(Boolean) as string[]
      : null
    return {
      cellarItemId: note.cellarItemId,
      producer: series?.producer ?? null,
      name: series?.name ?? null,
      wineType: series?.wineType ?? null,
      country: series?.country?.nameRu || series?.country?.name || null,
      countryIso2: series?.country?.iso2 ?? null,
      region: series?.region ?? null,
      appellation: series?.appellation ?? null,
      vintageYear: note.cellarItem?.wineVintage?.vintageYear ?? null,
      grapes: grapes && grapes.length ? grapes : null,
      photoPath: note.cellarItem?.photoPath ?? null,
    }
  }

  private excerpt(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim()
    return flat.length > EXCERPT_LEN ? flat.slice(0, EXCERPT_LEN).trimEnd() + '…' : flat
  }

  private dateOnly(d: Date): string {
    return d.toISOString().slice(0, 10)
  }
}

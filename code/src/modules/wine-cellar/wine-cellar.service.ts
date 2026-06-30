import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'
import { Prisma, WineType } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { VivinoService } from '../vivino/vivino.service'
import { WineCriticService } from '../wine-critic/wine-critic.service'
import { KbIndexService } from '../cellar-ai-search/kb-index.service'

/** Включение связей вина для карточки погреба (серия + винтаж + страна). */
const CELLAR_ITEM_INCLUDE = {
  wineVintage: { include: { series: { include: { country: true } } } },
} satisfies Prisma.CellarItemInclude

type CellarItemWithWine = Prisma.CellarItemGetPayload<{ include: typeof CELLAR_ITEM_INCLUDE }>

/** Браузерный User-Agent — без него многие источники отдают антибот-страницу (HTML) вместо картинки. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/**
 * Определяет расширение по «магическим байтам». Возвращает null, если буфер — НЕ изображение
 * (например, HTML-страница антибота, сохранённая под видом .jpg). Это главный предохранитель:
 * раньше его не было, и в uploads попадал HTML.
 */
function sniffImageExt(buf: Buffer): string | null {
  if (buf.length < 12) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png'
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return '.gif'
  // WEBP: "RIFF"...."WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp'
  return null
}

export interface AddWineToCellarDto {
  producer: string
  name: string
  vintageYear?: number
  region?: string
  appellation?: string | null
  country?: string
  wineType?: string
  quantity: number
  grapes?: string[]
  userDescription?: string | null
  sellerDescription?: string | null
  producerDescription?: string | null
  purchasePrice?: number | null
  currency?: string | null
  storageLocation?: string | null
}

@Injectable()
export class WineCellarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vivino: VivinoService,
    private readonly critic: WineCriticService,
    private readonly kbIndex: KbIndexService,
  ) {}

  /**
   * Fire-and-forget re-embedding of a bottle's descriptions into wine_desc_chunk.
   * Best-effort: a no-op when Voyage/pgvector are not active, and never blocks the
   * API response. EmbeddingService retries on Voyage 429 internally.
   */
  private reindexDescriptions(cellarItemId: string): void {
    this.kbIndex.indexCellarItemDescriptions(cellarItemId).catch(() => undefined)
  }

  async getCountries() {
    return this.prisma.country.findMany({ orderBy: { name: 'asc' } })
  }

  async getCellarItems(userId: string) {
    const cellar = await this.prisma.wineCellar.findFirst({
      where: { ownerId: userId },
    })

    if (!cellar) return []

    const items = await this.prisma.cellarItem.findMany({
      where: { cellarId: cellar.id, status: 'IN_CELLAR', deletedAt: null },
      include: CELLAR_ITEM_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })

    return items.map((item) => this.mapCellarItem(item))
  }

  /** Маппинг строки погреба в API-форму (используется списком и инкрементальной синхронизацией). */
  private mapCellarItem(item: CellarItemWithWine) {
    const series = item.wineVintage.series
    const composition = item.wineVintage.composition as string[] | null
    return {
      id: item.id,
      producer: series.producer,
      name: series.name,
      vintageYear: item.wineVintage.vintageYear,
      region: series.region,
      appellation: series.appellation,
      country: series.country?.name,
      countryIso2: series.country?.iso2,
      wineType: series.wineType,
      grapes: Array.isArray(composition) ? composition : null,
      quantity: item.quantity,
      status: item.status,
      photoPath: item.photoPath,
      purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : null,
      currency: item.currency ?? null,
      storageLocation: item.storageLocation ?? null,
      userDescription: item.userDescription ?? null,
      sellerDescription: item.sellerDescription ?? null,
      producerDescription: item.producerDescription ?? null,
      createdAt: item.createdAt,
      vivinoUrl: series.vivinoUrl ?? null,
      wineSearcherUrl: series.wineSearcherUrl ?? null,
      criticScores: (series.criticScores as Record<string, number> | null) ?? null,
    }
  }

  /**
   * Инкрементальная синхронизация погреба: изменения после серверного времени `since`.
   * Возвращает upsert-список (changed) и id выбывших бутылок (deletedIds — удалённые/списанные),
   * плюс текущее серверное время. Без `since` — полная выгрузка.
   */
  async syncCellarChanges(userId: string, since?: string) {
    const serverTime = new Date().toISOString()
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) return { serverTime, changed: [], deletedIds: [] as string[] }

    const sinceDate = since ? new Date(since) : null
    if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
      const rows = await this.prisma.cellarItem.findMany({
        where: { cellarId: cellar.id, updatedAt: { gt: sinceDate } },
        include: CELLAR_ITEM_INCLUDE,
      })
      const isActive = (r: CellarItemWithWine) => r.status === 'IN_CELLAR' && !r.deletedAt
      return {
        serverTime,
        changed: rows.filter(isActive).map((r) => this.mapCellarItem(r)),
        deletedIds: rows.filter((r) => !isActive(r)).map((r) => r.id),
      }
    }
    // Полная выгрузка (первый синк).
    const rows = await this.prisma.cellarItem.findMany({
      where: { cellarId: cellar.id, status: 'IN_CELLAR', deletedAt: null },
      include: CELLAR_ITEM_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    return { serverTime, changed: rows.map((r) => this.mapCellarItem(r)), deletedIds: [] as string[] }
  }

  async addToCellar(userId: string, dto: AddWineToCellarDto) {
    let cellar = await this.prisma.wineCellar.findFirst({
      where: { ownerId: userId },
    })

    if (!cellar) {
      cellar = await this.prisma.wineCellar.create({
        data: { ownerId: userId, name: 'Мой погреб' },
      })
    }

    const series = await this.findOrCreateSeries(dto)
    this.enrichSeriesInBackground(series, dto.vintageYear)

    let vintage = await this.prisma.wineVintage.findFirst({
      where: {
        seriesId: series.id,
        vintageYear: dto.vintageYear || null,
      },
    })

    if (!vintage) {
      vintage = await this.prisma.wineVintage.create({
        data: {
          seriesId: series.id,
          vintageYear: dto.vintageYear || null,
          composition: dto.grapes && dto.grapes.length > 0 ? dto.grapes : undefined,
        },
      })
    }

    const created = await this.prisma.cellarItem.create({
      data: {
        cellarId: cellar.id,
        wineVintageId: vintage.id,
        quantity: dto.quantity,
        userDescription: dto.userDescription ?? null,
        sellerDescription: dto.sellerDescription ?? null,
        producerDescription: dto.producerDescription ?? null,
        purchasePrice: dto.purchasePrice ?? null,
        currency: dto.currency ?? null,
        storageLocation: dto.storageLocation ?? null,
      },
    })

    // Описание могло прийти прямо при добавлении бутылки → сразу строим векторы.
    if (dto.userDescription?.trim() || dto.sellerDescription?.trim() || dto.producerDescription?.trim()) {
      this.reindexDescriptions(created.id)
    }
    return created
  }

  async updateCellarItem(userId: string, itemId: string, dto: Partial<AddWineToCellarDto> & { quantity?: number }) {
    const { item } = await this.getOwnedItem(userId, itemId)
    const series = item.wineVintage.series

    if (dto.producer !== undefined || dto.name !== undefined || dto.country !== undefined || dto.region !== undefined || dto.wineType !== undefined) {
      const wineType = dto.wineType ? this.normalizeWineType(dto.wineType) : this.normalizeWineType(series.wineType)
      const countryId = (dto.country && (await this.findCountryId(dto.country))) || series.countryId

      await this.prisma.wineSeries.update({
        where: { id: series.id },
        data: {
          producer: dto.producer ?? series.producer,
          name: dto.name ?? series.name,
          countryId,
          region: dto.region !== undefined ? dto.region : series.region,
          wineType,
        },
      })
    }

    if (dto.vintageYear !== undefined && dto.vintageYear !== item.wineVintage.vintageYear) {
      let vintage = await this.prisma.wineVintage.findFirst({
        where: { seriesId: series.id, vintageYear: dto.vintageYear || null },
      })
      if (!vintage) {
        vintage = await this.prisma.wineVintage.create({
          data: { seriesId: series.id, vintageYear: dto.vintageYear || null },
        })
      }
      await this.prisma.cellarItem.update({
        where: { id: itemId },
        data: { wineVintageId: vintage.id, quantity: dto.quantity ?? item.quantity },
      })
    } else if (dto.quantity !== undefined) {
      await this.prisma.cellarItem.update({
        where: { id: itemId },
        data: { quantity: dto.quantity },
      })
    }

    // Описания могут редактироваться через общий PUT → пишем и переиндексируем векторы.
    if (dto.userDescription !== undefined || dto.sellerDescription !== undefined) {
      const descData: { userDescription?: string | null; sellerDescription?: string | null } = {}
      if (dto.userDescription !== undefined) descData.userDescription = dto.userDescription
      if (dto.sellerDescription !== undefined) descData.sellerDescription = dto.sellerDescription
      await this.prisma.cellarItem.update({ where: { id: itemId }, data: descData })
      this.reindexDescriptions(itemId)
    }

    const updated = await this.prisma.cellarItem.findUnique({
      where: { id: itemId },
      include: { wineVintage: { include: { series: { include: { country: true } } } } },
    })
    return {
      id: updated!.id,
      producer: updated!.wineVintage.series.producer,
      name: updated!.wineVintage.series.name,
      vintageYear: updated!.wineVintage.vintageYear,
      region: updated!.wineVintage.series.region,
      country: updated!.wineVintage.series.country?.name,
      wineType: updated!.wineVintage.series.wineType,
      quantity: updated!.quantity,
      status: updated!.status,
      createdAt: updated!.createdAt,
    }
  }

  async deleteCellarItem(userId: string, itemId: string) {
    const { item } = await this.getOwnedItem(userId, itemId)

    await this.prisma.cellarItem.update({
      where: { id: item.id },
      data: { deletedAt: new Date() },
    })

    // Бутылка удалена → убираем её векторы, чтобы не всплывала в семантическом поиске.
    await this.kbIndex.removeCellarItemDescriptions(item.id).catch(() => undefined)
  }

  async getNotesCount(userId: string): Promise<{ count: number }> {
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) return { count: 0 }
    const count = await this.prisma.note.count({
      where: { cellarId: cellar.id, noteType: 'MANUAL', deletedAt: null },
    })
    return { count }
  }

  async getCellarNote(userId: string, itemId: string) {
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) return null

    const note = await this.prisma.note.findFirst({
      where: { cellarItemId: itemId, cellarId: cellar.id, noteType: 'MANUAL', deletedAt: null },
    })
    return note ? { id: note.id, text: note.text } : null
  }

  async saveCellarNote(userId: string, itemId: string, text: string) {
    const { cellar } = await this.getOwnedItem(userId, itemId)

    const existing = await this.prisma.note.findFirst({
      where: { cellarItemId: itemId, cellarId: cellar.id, noteType: 'MANUAL', deletedAt: null },
    })

    if (existing) {
      if (!text.trim()) {
        await this.prisma.note.update({ where: { id: existing.id }, data: { deletedAt: new Date() } })
        return null
      }
      return this.prisma.note.update({ where: { id: existing.id }, data: { text } })
    }

    if (!text.trim()) return null

    return this.prisma.note.create({
      data: { cellarId: cellar.id, cellarItemId: itemId, noteType: 'MANUAL', text },
    })
  }

  async uploadCellarPhoto(userId: string, itemId: string, file: Express.Multer.File) {
    const { cellar } = await this.getOwnedItem(userId, itemId)

    const ext = path.extname(file.originalname) || '.jpg'
    return this.persistItemPhoto(cellar.id, itemId, file.buffer, ext)
  }

  async fetchWinePhoto(userId: string, itemId: string, wine: { producer: string; name: string; vintageYear?: number }) {
    const { cellar } = await this.getOwnedItem(userId, itemId)

    const query = `${wine.producer} ${wine.name} ${wine.vintageYear || ''} wine label`.trim()
    const imageUrl = await this.searchWineImage(query)
    if (!imageUrl) return { photoPath: null }

    const response = await fetch(imageUrl, { headers: { 'User-Agent': BROWSER_UA, 'Accept': 'image/*' } })
    const buffer = Buffer.from(await response.arrayBuffer())
    const ext = sniffImageExt(buffer)
    if (!ext) return { photoPath: null }
    return this.persistItemPhoto(cellar.id, itemId, buffer, ext)
  }

  /**
   * Предпросмотр обогащения для карточки распознанного вина (без записи в БД):
   * ссылка Vivino + ссылка Wine-Searcher + оценки критиков.
   */
  async enrichPreview(dto: { producer: string; name: string; vintageYear?: number }) {
    const [vivinoUrl, ws] = await Promise.all([
      this.vivino.findWineUrl(dto.producer, dto.name, dto.vintageYear),
      this.critic.findWine(dto.producer, dto.name, dto.vintageYear),
    ])
    return {
      vivinoUrl: vivinoUrl ?? null,
      wineSearcherUrl: ws?.url ?? null,
      criticScores: ws && Object.keys(ws.scores).length > 0 ? ws.scores : null,
    }
  }

  /** Топ картинок по запросу вина — для ручного выбора фото бутылки. */
  async getPhotoCandidates(wine: { producer: string; name: string; vintageYear?: number }) {
    // Каскад от точного запроса к широкому: первый непустой результат побеждает
    const year = wine.vintageYear || ''
    const queries = [
      `${wine.producer} ${wine.name} ${year} wine bottle`.replace(/\s+/g, ' ').trim(),
      `${wine.producer} ${wine.name} wine label`.replace(/\s+/g, ' ').trim(),
      `${wine.name} ${year} wine`.replace(/\s+/g, ' ').trim(),
    ].filter((q, i, arr) => q.length > 8 && arr.indexOf(q) === i)

    for (const query of queries) {
      const images = await this.searchWineImages(query, 10)
      if (images.length > 0) return { images }
    }
    return { images: [] }
  }

  /** Сохраняет к бутылке фото, выбранное пользователем из кандидатов. */
  async setItemPhotoFromUrl(userId: string, itemId: string, imageUrl: string) {
    const { cellar } = await this.getOwnedItem(userId, itemId)

    let parsed: URL
    try {
      parsed = new URL(imageUrl)
    } catch {
      throw new NotFoundException('Некорректный URL картинки')
    }
    const host = parsed.hostname
    const isPrivate =
      parsed.protocol !== 'https:' ||
      host === 'localhost' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      host.endsWith('.local')
    if (isPrivate) throw new NotFoundException('Недопустимый URL картинки')

    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'image/*' },
    })
    if (!response.ok) throw new NotFoundException('Не удалось скачать картинку')
    const buffer = Buffer.from(await response.arrayBuffer())

    // Проверяем СОДЕРЖИМОЕ, а не заголовок/расширение: если это не изображение
    // (HTML антибота, пустой ответ и т.п.) — отказываем, чтобы мусор не попал в uploads.
    const ext = sniffImageExt(buffer)
    if (!ext) throw new NotFoundException('Скачанный файл не является изображением')
    return this.persistItemPhoto(cellar.id, itemId, buffer, ext)
  }

  async setVivinoUrl(userId: string, itemId: string, vivinoUrl: string): Promise<{ ok: boolean }> {
    const { item } = await this.getOwnedItem(userId, itemId)

    await this.prisma.wineSeries.update({
      where: { id: item.wineVintage.seriesId },
      data: { vivinoUrl },
    })
    return { ok: true }
  }

  async setWineSearcherUrl(userId: string, itemId: string, wineSearcherUrl: string): Promise<{ ok: boolean }> {
    const { item } = await this.getOwnedItem(userId, itemId)

    await this.prisma.wineSeries.update({
      where: { id: item.wineVintage.seriesId },
      data: { wineSearcherUrl },
    })

    // Re-fetch critic scores for the newly chosen URL in background
    this.critic.extractScoresFromUrl(wineSearcherUrl).then((scores) => {
      if (scores) {
        this.prisma.wineSeries
          .update({ where: { id: item.wineVintage.seriesId }, data: { criticScores: scores } })
          .catch(() => {})
      }
    })

    return { ok: true }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Погреб пользователя + его бутылка; 404 если чего-то нет. */
  private async getOwnedItem(userId: string, itemId: string) {
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) throw new NotFoundException('Погреб не найден')

    const item = await this.prisma.cellarItem.findFirst({
      where: { id: itemId, cellarId: cellar.id, deletedAt: null },
      include: { wineVintage: { include: { series: true } } },
    })
    if (!item) throw new NotFoundException('Вино не найдено')

    return { cellar, item }
  }

  private async findCountryId(input: string): Promise<string | undefined> {
    const country = await this.prisma.country.findFirst({
      where: {
        OR: [
          { iso2: input.toUpperCase() },
          { name: { contains: input, mode: 'insensitive' } },
        ],
      },
    })
    return country?.id
  }

  private async findOrCreateSeries(dto: AddWineToCellarDto) {
    const wineType = this.normalizeWineType(dto.wineType)

    let series = await this.prisma.wineSeries.findFirst({
      where: {
        producer: dto.producer,
        name: dto.name,
        country: { iso2: dto.country?.toUpperCase() || undefined },
      },
      include: { country: true },
    })
    if (series) return series

    let countryId = dto.country ? await this.findCountryId(dto.country) : undefined

    if (!countryId) {
      const fallback = await this.prisma.country.findFirst({ where: { iso2: 'FR' } })
      countryId = fallback
        ? fallback.id
        : (await this.prisma.country.create({ data: { iso2: 'FR', iso3: 'FRA', name: 'France' } })).id
    }

    series = await this.prisma.wineSeries.create({
      data: {
        producer: dto.producer,
        name: dto.name,
        countryId,
        region: dto.region || null,
        appellation: dto.appellation || null,
        wineType,
      },
      include: { country: true },
    })

    if (!series) {
      throw new NotFoundException('Не удалось создать серию вина')
    }
    return series
  }

  /** Fire-and-forget подтягивание ссылок Vivino/Wine-Searcher и оценок критиков. */
  private enrichSeriesInBackground(
    series: { id: string; producer: string; name: string; vivinoUrl: string | null; wineSearcherUrl: string | null },
    vintageYear?: number,
  ) {
    if (!series.vivinoUrl) {
      this.vivino.findWineUrl(series.producer, series.name, vintageYear).then((url) => {
        if (url) {
          this.prisma.wineSeries.update({ where: { id: series.id }, data: { vivinoUrl: url } }).catch(() => {})
        }
      })
    }

    if (!series.wineSearcherUrl) {
      this.critic.findWine(series.producer, series.name, vintageYear).then((result) => {
        if (result) {
          this.prisma.wineSeries.update({
            where: { id: series.id },
            data: {
              wineSearcherUrl: result.url,
              ...(Object.keys(result.scores).length > 0 && { criticScores: result.scores }),
            },
          }).catch(() => {})
        }
      })
    }
  }

  /** Сохраняет картинку в uploads/cellar и пишет photoPath в cellarItem. */
  private async persistItemPhoto(cellarId: string, itemId: string, buffer: Buffer, ext: string) {
    const uploadDir = path.join(process.cwd(), 'uploads', 'cellar')
    fs.mkdirSync(uploadDir, { recursive: true })

    const fileName = `${cellarId}_${itemId}_${Date.now()}${ext}`
    fs.writeFileSync(path.join(uploadDir, fileName), buffer)

    const photoPath = `/uploads/cellar/${fileName}`
    await this.prisma.cellarItem.update({
      where: { id: itemId },
      data: { photoPath },
    })

    return { photoPath }
  }

  private async searchWineImage(query: string): Promise<string | null> {
    const images = await this.searchWineImages(query, 1)
    return images[0] ?? null
  }

  private async searchWineImages(query: string, limit: number): Promise<string[]> {
    try {
      const jinaKey = process.env.JINA_API_KEY
      if (!jinaKey) return []

      const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`
      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${jinaKey}`,
          'X-Return-Format': 'image',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
      })

      if (!response.ok) return []

      const data = await response.json()
      const urls: string[] = (data.data ?? [])
        .map((d: any) => d?.url)
        .filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http'))
      return urls.slice(0, limit)
    } catch {
      return []
    }
  }

  private normalizeWineType(input?: string | null): WineType {
    if (!input) return WineType.OTHER
    const map: Record<string, WineType> = {
      RED: WineType.RED,
      WHITE: WineType.WHITE,
      ROSE: WineType.ROSE,
      SPARKLING: WineType.SPARKLING,
      SWEET: WineType.SWEET,
      FORTIFIED: WineType.FORTIFIED,
    }
    return map[input.toUpperCase()] || WineType.OTHER
  }
}

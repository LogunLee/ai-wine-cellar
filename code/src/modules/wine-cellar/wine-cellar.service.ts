import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'
import { WineType } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { VivinoService } from '../vivino/vivino.service'
import { WineCriticService } from '../wine-critic/wine-critic.service'

export interface AddWineToCellarDto {
  producer: string
  name: string
  vintageYear?: number
  region?: string
  country?: string
  wineType?: string
  quantity: number
}

@Injectable()
export class WineCellarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vivino: VivinoService,
    private readonly critic: WineCriticService,
  ) {}

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
      include: {
        wineVintage: {
          include: {
            series: {
              include: { country: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return items.map((item) => {
      const series = item.wineVintage.series
      const composition = item.wineVintage.composition as string[] | null
      return {
        id: item.id,
        producer: series.producer,
        name: series.name,
        vintageYear: item.wineVintage.vintageYear,
        region: series.region,
        country: series.country?.name,
        countryIso2: series.country?.iso2,
        wineType: series.wineType,
        grapes: Array.isArray(composition) ? composition : null,
        quantity: item.quantity,
        status: item.status,
        createdAt: item.createdAt,
        vivinoUrl: series.vivinoUrl ?? null,
        wineSearcherUrl: series.wineSearcherUrl ?? null,
        criticScores: (series.criticScores as Record<string, number> | null) ?? null,
      }
    })
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
        },
      })
    }

    return this.prisma.cellarItem.create({
      data: {
        cellarId: cellar.id,
        wineVintageId: vintage.id,
        quantity: dto.quantity,
      },
    })
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

    const response = await fetch(imageUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    const ext = imageUrl.includes('.webp') ? '.webp' : imageUrl.includes('.png') ? '.png' : '.jpg'
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
    try {
      const jinaKey = process.env.JINA_API_KEY
      if (!jinaKey) return null

      const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`
      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${jinaKey}`,
          'X-Return-Format': 'image',
          'Accept': 'application/json',
        },
      })

      if (!response.ok) return null

      const data = await response.json()
      return data.data?.length > 0 ? data.data[0].url : null
    } catch {
      return null
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

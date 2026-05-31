import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'
import { WineType } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

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
  constructor(private readonly prisma: PrismaService) {}

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
      const composition = item.wineVintage.composition as string[] | null
      return {
        id: item.id,
        producer: item.wineVintage.series.producer,
        name: item.wineVintage.series.name,
        vintageYear: item.wineVintage.vintageYear,
        region: item.wineVintage.series.region,
        country: item.wineVintage.series.country?.name,
        countryIso2: item.wineVintage.series.country?.iso2,
        wineType: item.wineVintage.series.wineType,
        grapes: Array.isArray(composition) ? composition : null,
        quantity: item.quantity,
        status: item.status,
        createdAt: item.createdAt,
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

    const wineType = this.normalizeWineType(dto.wineType)

    let series = await this.prisma.wineSeries.findFirst({
      where: {
        producer: dto.producer,
        name: dto.name,
        country: { iso2: dto.country?.toUpperCase() || undefined },
      },
      include: { country: true },
    })

    if (!series) {
      let countryId: string | undefined
      if (dto.country) {
        const country = await this.prisma.country.findFirst({
          where: {
            OR: [
              { iso2: dto.country.toUpperCase() },
              { name: { contains: dto.country, mode: 'insensitive' } },
            ],
          },
        })
        if (country) countryId = country.id
      }

      if (!countryId) {
        const fallback = await this.prisma.country.findFirst({
          where: { iso2: 'FR' },
        })
        if (fallback) {
          countryId = fallback.id
        } else {
          const created = await this.prisma.country.create({
            data: { iso2: 'FR', iso3: 'FRA', name: 'France' },
          })
          countryId = created.id
        }
      }

      if (countryId) {
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
      }
    }

    if (!series) {
      throw new NotFoundException('Не удалось создать серию вина')
    }

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

    const cellarItem = await this.prisma.cellarItem.create({
      data: {
        cellarId: cellar.id,
        wineVintageId: vintage.id,
        quantity: dto.quantity,
      },
    })

    return cellarItem
  }

  async updateCellarItem(userId: string, itemId: string, dto: Partial<AddWineToCellarDto> & { quantity?: number }) {
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) throw new NotFoundException('Погреб не найден')

    const item = await this.prisma.cellarItem.findFirst({
      where: { id: itemId, cellarId: cellar.id, deletedAt: null },
      include: { wineVintage: { include: { series: true } } },
    })
    if (!item) throw new NotFoundException('Вино не найдено')

    const series = item.wineVintage.series

    if (dto.producer !== undefined || dto.name !== undefined || dto.country !== undefined || dto.region !== undefined || dto.wineType !== undefined) {
      const wineType = dto.wineType ? this.normalizeWineType(dto.wineType) : this.normalizeWineType(series.wineType)

      let countryId = series.countryId
      if (dto.country) {
        const country = await this.prisma.country.findFirst({
          where: {
            OR: [
              { iso2: dto.country.toUpperCase() },
              { name: { contains: dto.country, mode: 'insensitive' } },
            ],
          },
        })
        if (country) countryId = country.id
      }

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

    return this.prisma.cellarItem.findUnique({
      where: { id: itemId },
      include: { wineVintage: { include: { series: { include: { country: true } } } } },
    }).then((updated) => ({
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
    }))
  }

  async deleteCellarItem(userId: string, itemId: string) {
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) throw new NotFoundException('Погреб не найден')

    const item = await this.prisma.cellarItem.findFirst({
      where: { id: itemId, cellarId: cellar.id, deletedAt: null },
    })
    if (!item) throw new NotFoundException('Вино не найдено')

    await this.prisma.cellarItem.update({
      where: { id: itemId },
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
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) throw new NotFoundException('Погреб не найден')

    const item = await this.prisma.cellarItem.findFirst({
      where: { id: itemId, cellarId: cellar.id, deletedAt: null },
    })
    if (!item) throw new NotFoundException('Вино не найдено')

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
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) throw new NotFoundException('Погреб не найден')

    const item = await this.prisma.cellarItem.findFirst({
      where: { id: itemId, cellarId: cellar.id, deletedAt: null },
    })
    if (!item) throw new NotFoundException('Вино не найдено')

    const uploadDir = path.join(process.cwd(), 'uploads', 'cellar')
    fs.mkdirSync(uploadDir, { recursive: true })

    const ext = path.extname(file.originalname) || '.jpg'
    const fileName = `${cellar.id}_${itemId}_${Date.now()}${ext}`
    const filePath = path.join(uploadDir, fileName)

    fs.writeFileSync(filePath, file.buffer)

    const photoPath = `/uploads/cellar/${fileName}`
    await this.prisma.cellarItem.update({
      where: { id: itemId },
      data: { photoPath },
    })

    return { photoPath }
  }

  async fetchWinePhoto(userId: string, itemId: string, wine: { producer: string; name: string; vintageYear?: number }) {
    const cellar = await this.prisma.wineCellar.findFirst({ where: { ownerId: userId } })
    if (!cellar) throw new NotFoundException('Погреб не найден')

    const item = await this.prisma.cellarItem.findFirst({
      where: { id: itemId, cellarId: cellar.id, deletedAt: null },
    })
    if (!item) throw new NotFoundException('Вино не найдено')

    const query = `${wine.producer} ${wine.name} ${wine.vintageYear || ''} wine label`.trim()
    const imageUrl = await this.searchWineImage(query)

    if (imageUrl) {
      const uploadDir = path.join(process.cwd(), 'uploads', 'cellar')
      fs.mkdirSync(uploadDir, { recursive: true })

      const response = await fetch(imageUrl)
      const buffer = Buffer.from(await response.arrayBuffer())
      const ext = imageUrl.includes('.webp') ? '.webp' : imageUrl.includes('.png') ? '.png' : '.jpg'
      const fileName = `${cellar.id}_${itemId}_${Date.now()}${ext}`
      const filePath = path.join(uploadDir, fileName)
      fs.writeFileSync(filePath, buffer)

      const photoPath = `/uploads/cellar/${fileName}`
      await this.prisma.cellarItem.update({
        where: { id: itemId },
        data: { photoPath },
      })

      return { photoPath }
    }

    return { photoPath: null }
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
      if (data.data && data.data.length > 0) {
        return data.data[0].url
      }

      return null
    } catch {
      return null
    }
  }

  private normalizeWineType(input?: string): WineType {
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

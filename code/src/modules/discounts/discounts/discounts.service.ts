import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../shared/database/prisma.service'

export interface DiscountFilters {
  storeId?: string
  seller?: string
  country?: string
  region?: string
  wineType?: string
  minDiscount?: number
  minPrice?: number
  maxPrice?: number
  vintage?: string
  availability?: string
  confidence?: string
  status?: string
  search?: string
  grapes?: string[]
  monosort?: boolean
  page?: number
  limit?: number
  sort?: string
}

@Injectable()
export class DiscountsService {
  private readonly logger = new Logger(DiscountsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getOffers(filters: DiscountFilters) {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 20
    const skip = (page - 1) * limit

    const where: any = {
      deleted: false,
      status: { not: 'hidden' },
    }

    if (filters.storeId) where.storeId = filters.storeId
    if (filters.seller) where.sellerName = { contains: filters.seller, mode: 'insensitive' }
    if (filters.country) where.country = filters.country
    if (filters.region) where.region = { contains: filters.region, mode: 'insensitive' }
    if (filters.wineType) where.wineType = filters.wineType
    if (filters.minDiscount) where.discountPercent = { gte: filters.minDiscount }
    if (filters.minPrice || filters.maxPrice) {
      where.currentPrice = {}
      if (filters.minPrice) where.currentPrice.gte = filters.minPrice
      if (filters.maxPrice) where.currentPrice.lte = filters.maxPrice
    }
    if (filters.vintage) where.vintage = filters.vintage
    if (filters.availability) where.availability = { contains: filters.availability, mode: 'insensitive' }
    if (filters.confidence) where.confidence = filters.confidence
    if (filters.status) where.status = filters.status
    if (filters.search) {
      where.OR = [
        { wineNameRaw: { contains: filters.search, mode: 'insensitive' } },
        { producer: { contains: filters.search, mode: 'insensitive' } },
        { wineName: { contains: filters.search, mode: 'insensitive' } },
      ]
    }
    if (filters.grapes && filters.grapes.length > 0) {
      where.grapes = { hasSome: filters.grapes }
    }
    if (filters.monosort) {
      where.grapeCount = 1
    }

    const orderBy = this.getOrderBy(filters.sort)

    try {
      const [items, total] = await Promise.all([
        this.prisma.discountOffer.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
        this.prisma.discountOffer.count({ where }),
      ])

      return {
        items: items.map((item) => ({
          id: item.id,
          sellerName: item.sellerName,
          producer: item.producer,
          wineName: item.wineName,
          wineNameRaw: item.wineNameRaw,
          fullName: item.fullName,
          vintage: item.vintage,
          country: item.country,
          region: item.region,
          regionCanonical: item.regionCanonical,
          appellation: item.appellation,
          originZone: item.originZone,
          sweetness: item.sweetness,
          alcohol: item.alcohol,
          ageingVessel: item.ageingVessel,
          storagePotential: item.storagePotential,
          description: item.description,
          wineType: item.wineType,
          volumeMl: item.volumeMl,
          currentPrice: parseFloat(String(item.currentPrice)),
          oldPrice: item.oldPrice ? parseFloat(String(item.oldPrice)) : null,
          discountPercent: item.discountPercent,
          discountAmount: item.discountAmount ? parseFloat(String(item.discountAmount)) : null,
          currency: item.currency,
          url: item.url,
          imageUrl: item.imageUrl,
          availability: item.availability,
          grapes: item.grapes,
          grapeCount: item.grapeCount,
          confidence: item.confidence,
          status: item.status,
          lastCheckedAt: item.lastCheckedAt,
        })),
        total,
        page,
        limit,
      }
    } catch (error) {
      this.logger.error(`getOffers error: ${error}`)
      throw error
    }
  }

  async getLastUpdated(): Promise<{ lastUpdated: string | null }> {
    const result = await this.prisma.$queryRaw<{ min_last: Date | null }[]>`
      SELECT MIN(max_per_store) AS min_last
      FROM (
        SELECT MAX("finished_at") AS max_per_store
        FROM "scrape_job"
        WHERE status IN ('success', 'partial_success')
          AND "finished_at" IS NOT NULL
        GROUP BY "store_id"
      ) sub
    `
    const dt = result[0]?.min_last
    return { lastUpdated: dt ? dt.toISOString() : null }
  }

  async getFilterOptions(): Promise<{ grapes: string[]; countries: string[] }> {
    const [grapesRaw, countriesRaw] = await Promise.all([
      this.prisma.$queryRaw<{ grape: string }[]>`
        SELECT grape, COUNT(*) AS cnt
        FROM (
          SELECT UNNEST(grapes) AS grape
          FROM "discount_offer"
          WHERE deleted = false
        ) t
        WHERE grape <> ''
        GROUP BY grape
        HAVING COUNT(*) >= 3
        ORDER BY cnt DESC
        LIMIT 80
      `,
      this.prisma.discountOffer.findMany({
        where: { deleted: false, country: { not: null }, status: { not: 'hidden' } },
        select: { country: true },
        distinct: ['country'],
        orderBy: { country: 'asc' },
      }),
    ])
    return {
      grapes: grapesRaw.map((r) => r.grape).filter(Boolean),
      countries: countriesRaw.map((r) => r.country).filter(Boolean) as string[],
    }
  }

  private getOrderBy(sort?: string) {
    const order: any = {}
    switch (sort) {
      case 'currentPrice_asc':
        order.currentPrice = 'asc'
        break
      case 'currentPrice_desc':
        order.currentPrice = 'desc'
        break
      case 'oldPrice_asc':
        order.oldPrice = 'asc'
        break
      case 'oldPrice_desc':
        order.oldPrice = 'desc'
        break
      case 'discountPercent_asc':
        order.discountPercent = 'asc'
        break
      case 'discountPercent_desc':
      default:
        return [{ discountPercent: { sort: 'desc', nulls: 'last' } }, { oldPrice: { sort: 'desc', nulls: 'last' } }]
    }
    return order
  }
}

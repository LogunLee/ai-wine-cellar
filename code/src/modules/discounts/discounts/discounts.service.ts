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
          fullName: item.fullName,
          vintage: item.vintage,
          country: item.country,
          region: item.region,
          originZone: item.originZone,
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

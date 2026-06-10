import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { DiscountsService } from './discounts.service'
import type { DiscountFilters } from './discounts.service'

@Controller('discounts')
@UseGuards(AuthGuard('jwt'))
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Get('last-updated')
  @UseGuards(AuthGuard('jwt'))
  async getLastUpdated() {
    return this.discountsService.getLastUpdated()
  }

  @Get('filter-options')
  @UseGuards(AuthGuard('jwt'))
  async getFilterOptions() {
    return this.discountsService.getFilterOptions()
  }

  @Get('offers')
  async getOffers(@Query() query: Record<string, string>) {
    const filters: DiscountFilters = {
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      sort: query.sort,
      storeId: query.storeId,
      seller: query.seller,
      country: query.country,
      region: query.region,
      wineType: query.wineType,
      minDiscount: query.minDiscount ? parseInt(query.minDiscount, 10) : undefined,
      minPrice: query.minPrice ? parseInt(query.minPrice, 10) : undefined,
      maxPrice: query.maxPrice ? parseInt(query.maxPrice, 10) : undefined,
      vintage: query.vintage,
      availability: query.availability,
      confidence: query.confidence,
      status: query.status,
      search: query.search,
      grapes: query.grapes ? query.grapes.split(',').filter(Boolean) : undefined,
      monosort: query.monosort === 'true',
    }
    return this.discountsService.getOffers(filters)
  }
}

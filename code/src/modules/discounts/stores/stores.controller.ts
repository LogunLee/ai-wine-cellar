import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { StoresService } from './stores.service'
import type { CreateStoreDto, UpdateStoreDto } from './stores.service'
import { SchedulerService } from '../scheduler/scheduler.service'
import { NormalizerService } from '../normalizer/normalizer.service'

@Controller('admin/discount-stores')
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly schedulerService: SchedulerService,
    private readonly normalizerService: NormalizerService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.storesService.findAll()
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string) {
    return this.storesService.findOne(id)
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto)
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.storesService.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string) {
    return this.storesService.remove(id)
  }

  @Post(':id/toggle-active')
  @UseGuards(AuthGuard('jwt'))
  toggleActive(@Param('id') id: string) {
    return this.storesService.toggleActive(id)
  }

  @Post(':id/run')
  async runScrape(@Param('id') id: string) {
    this.schedulerService.runManualScrape(id).catch(err => {
      console.error(`Background scrape job failed for store ${id}:`, err);
    });
    return { message: 'Scrape job started' }
  }

  @Post('run-all')
  async runAllScrape() {
    this.schedulerService.runAllScrapeJobs().catch(err => {
      console.error(`Background scrape jobs failed:`, err);
    });
    return { message: 'All scrape jobs started' }
  }

  @Post('normalize')
  @UseGuards(AuthGuard('jwt'))
  async normalize(@Query('storeId') storeId?: string) {
    const result = await this.normalizerService.normalizeAll(storeId)
    return { message: 'Normalization completed', ...result }
  }
}

import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { StoresService } from './stores.service'
import type { CreateStoreDto, UpdateStoreDto } from './stores.service'
import { SchedulerService } from '../scheduler/scheduler.service'
import { NormalizerService } from '../normalizer/normalizer.service'
import { RegionResolverService } from '../normalizer/region-resolver.service'
import { GrapeResolverService } from '../normalizer/grape-resolver.service'

@Controller('admin/discount-stores')
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly schedulerService: SchedulerService,
    private readonly normalizerService: NormalizerService,
    private readonly regionResolver: RegionResolverService,
    private readonly grapeResolver: GrapeResolverService,
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
    this.schedulerService.runAllScrapeJobs()
      // After a full scrape, top up the region/grape dictionaries via the LLM.
      .then(() => this.resolveDictionariesQuietly())
      .catch(err => {
        console.error(`Background scrape jobs failed:`, err);
      });
    return { message: 'All scrape jobs started' }
  }

  /**
   * Resolve new regions & grapes into their canonical dictionaries after a scrape.
   * NEVER throws: LLM quota (429) or any other failure must NOT fail the scrape run.
   * Whatever can't be resolved now (quota) is simply picked up on the next run —
   * the backlog shrinks each time. Both resolvers are idempotent.
   */
  private async resolveDictionariesQuietly() {
    try {
      const g = await this.grapeResolver.resolvePending()
      console.log(`[run-all] grape resolve: ${JSON.stringify(g)}`)
    } catch (e) {
      console.error('[run-all] grape resolve skipped:', e)
    }
    try {
      const r = await this.regionResolver.resolvePending()
      console.log(`[run-all] region resolve: ${JSON.stringify(r)}`)
    } catch (e) {
      console.error('[run-all] region resolve skipped:', e)
    }
  }

  @Post('normalize')
  @UseGuards(AuthGuard('jwt'))
  async normalize(@Query('storeId') storeId?: string) {
    const result = await this.normalizerService.normalizeAll(storeId)
    return { message: 'Normalization completed', ...result }
  }

  /**
   * Resolve new raw regions into the canonical reference book via the LLM (Gemini).
   * Decoupled from scraping: run after a scrape to unify regions. Unguarded for
   * local ops convenience, like /run.
   */
  @Post('resolve-regions')
  async resolveRegions(@Query('limit') limit?: string) {
    const result = await this.regionResolver.resolvePending(limit ? parseInt(limit, 10) : 100)
    return { message: 'Region resolution completed', ...result }
  }

  /**
   * Resolve new raw grapes into the canonical synonym dictionary via the LLM
   * (Gemini), then backfill existing offers. Run after a scrape to unify varieties.
   */
  @Post('resolve-grapes')
  async resolveGrapes(@Query('limit') limit?: string) {
    const result = await this.grapeResolver.resolvePending(limit ? parseInt(limit, 10) : 200)
    return { message: 'Grape resolution completed', ...result }
  }
}

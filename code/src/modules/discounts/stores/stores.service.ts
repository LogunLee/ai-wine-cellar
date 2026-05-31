import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../shared/database/prisma.service'
import { Store, StoreParserType } from '@prisma/client'

export interface CreateStoreDto {
  name: string
  code: string
  baseUrl: string
  parserType: StoreParserType
  scrapePeriodMinutes?: number
  currency?: string
  country?: string
  configJson?: Record<string, unknown>
  active?: boolean
}

export interface UpdateStoreDto {
  name?: string
  baseUrl?: string
  parserType?: StoreParserType
  scrapePeriodMinutes?: number
  currency?: string
  country?: string
  configJson?: Record<string, unknown>
  active?: boolean
}

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.store.findMany({
      where: { deleted: false },
      orderBy: [{ name: 'asc' }],
    })
  }

  async findOne(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id, deleted: false },
    })
    if (!store) throw new NotFoundException('Store not found')
    return store
  }

  async create(dto: CreateStoreDto): Promise<Store> {
    return this.prisma.store.create({
      data: {
        name: dto.name,
        code: dto.code,
        baseUrl: dto.baseUrl,
        parserType: dto.parserType,
        scrapePeriodMinutes: dto.scrapePeriodMinutes ?? 60,
        currency: dto.currency ?? 'RUB',
        country: dto.country,
        configJson: dto.configJson as any,
        active: dto.active ?? true,
      },
    })
  }

  async update(id: string, dto: UpdateStoreDto): Promise<Store> {
    await this.findOne(id)
    const { configJson, ...rest } = dto
    return this.prisma.store.update({
      where: { id },
      data: {
        ...rest,
        ...(configJson && { configJson: configJson as any }),
      },
    })
  }

  async remove(id: string): Promise<Store> {
    await this.findOne(id)
    return this.prisma.store.update({
      where: { id },
      data: { deleted: true },
    })
  }

  async toggleActive(id: string): Promise<Store> {
    const store = await this.findOne(id)
    return this.prisma.store.update({
      where: { id },
      data: { active: !store.active },
    })
  }

  async getActiveStores(): Promise<Store[]> {
    return this.prisma.store.findMany({
      where: { active: true, deleted: false },
    })
  }
}

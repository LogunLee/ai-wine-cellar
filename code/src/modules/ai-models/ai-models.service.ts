import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'
import { AiModelPurpose } from '@prisma/client'

export interface CreateAiModelDto {
  name: string
  provider: string
  purpose: AiModelPurpose
  apiKey: string
  baseUrl?: string
  promptConfig?: Record<string, unknown>
  isDefault?: boolean
}

export interface UpdateAiModelDto {
  name?: string
  provider?: string
  purpose?: AiModelPurpose
  apiKey?: string
  baseUrl?: string
  promptConfig?: Record<string, unknown>
  isDefault?: boolean
  isActive?: boolean
}

@Injectable()
export class AiModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.aiModel.findMany({ orderBy: [{ purpose: 'asc' }, { name: 'asc' }] })
  }

  async findOne(id: string) {
    const model = await this.prisma.aiModel.findUnique({ where: { id } })
    if (!model) throw new NotFoundException('AI model not found')
    return model
  }

  async create(dto: CreateAiModelDto) {
    if (dto.isDefault) {
      await this.prisma.aiModel.updateMany({
        where: { purpose: dto.purpose, isDefault: true },
        data: { isDefault: false },
      })
    }

    return this.prisma.aiModel.create({
      data: {
        name: dto.name,
        provider: dto.provider,
        purpose: dto.purpose,
        apiKey: dto.apiKey,
        baseUrl: dto.baseUrl,
        promptConfig: dto.promptConfig as any,
        isDefault: dto.isDefault ?? false,
      },
    })
  }

  async update(id: string, dto: UpdateAiModelDto) {
    await this.findOne(id)

    if (dto.isDefault && dto.purpose) {
      await this.prisma.aiModel.updateMany({
        where: { purpose: dto.purpose, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
    }

    const { promptConfig, ...rest } = dto
    return this.prisma.aiModel.update({
      where: { id },
      data: {
        ...rest,
        ...(promptConfig && { promptConfig: promptConfig as any }),
      },
    })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.aiModel.delete({ where: { id } })
  }

  async getDefaultForPurpose(purpose: AiModelPurpose) {
    const model = await this.prisma.aiModel.findFirst({
      where: { purpose, isDefault: true, isActive: true },
    })
    if (!model) throw new NotFoundException(`No default model for purpose: ${purpose}`)
    return model
  }

  async setDefault(id: string) {
    const model = await this.findOne(id)

    await this.prisma.aiModel.updateMany({
      where: { purpose: model.purpose, isDefault: true },
      data: { isDefault: false },
    })

    return this.prisma.aiModel.update({
      where: { id },
      data: { isDefault: true },
    })
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { AiModelsService } from './ai-models.service'
import type { CreateAiModelDto, UpdateAiModelDto } from './ai-models.service'

/** apiKey никогда не покидает сервер — во всех ответах он заменяется маской. */
function sanitize<T extends { apiKey: string }>(model: T): Omit<T, 'apiKey'> & { apiKeyMask: string } {
  const { apiKey, ...rest } = model
  return { ...rest, apiKeyMask: apiKey ? `••••${apiKey.slice(-4)}` : '' }
}

@Controller('ai-models')
@UseGuards(AuthGuard('jwt'))
export class AiModelsController {
  constructor(private readonly aiModelsService: AiModelsService) {}

  @Get()
  async findAll() {
    return (await this.aiModelsService.findAll()).map(sanitize)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return sanitize(await this.aiModelsService.findOne(id))
  }

  @Post()
  async create(@Body() dto: CreateAiModelDto) {
    return sanitize(await this.aiModelsService.create(dto))
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAiModelDto) {
    return sanitize(await this.aiModelsService.update(id, dto))
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return sanitize(await this.aiModelsService.remove(id))
  }

  @Post(':id/set-default')
  async setDefault(@Param('id') id: string) {
    return sanitize(await this.aiModelsService.setDefault(id))
  }
}

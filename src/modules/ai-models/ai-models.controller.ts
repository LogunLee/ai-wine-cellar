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
import { AiModelsService, CreateAiModelDto, UpdateAiModelDto } from './ai-models.service'

@Controller('ai-models')
@UseGuards(AuthGuard('jwt'))
export class AiModelsController {
  constructor(private readonly aiModelsService: AiModelsService) {}

  @Get()
  findAll() {
    return this.aiModelsService.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aiModelsService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateAiModelDto) {
    return this.aiModelsService.create(dto)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAiModelDto) {
    return this.aiModelsService.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.aiModelsService.remove(id)
  }

  @Post(':id/set-default')
  setDefault(@Param('id') id: string) {
    return this.aiModelsService.setDefault(id)
  }
}

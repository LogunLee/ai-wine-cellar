import { Module } from '@nestjs/common'
import { AiSettingsModule } from '../ai-settings/ai-settings.module'
import { TastingNotesController } from './tasting-notes.controller'
import { TastingNotesService } from './tasting-notes.service'
import { VivinoNoteService } from './vivino-note.service'

@Module({
  imports: [AiSettingsModule],
  controllers: [TastingNotesController],
  providers: [TastingNotesService, VivinoNoteService],
  exports: [TastingNotesService],
})
export class TastingNotesModule {}

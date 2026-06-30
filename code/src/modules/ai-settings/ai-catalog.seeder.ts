import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'
import { PROVIDER_SEEDS, TASK_SEEDS } from './ai-catalog.data'

/** Upsert справочников провайдеров/моделей/задач при старте приложения. */
@Injectable()
export class AiCatalogSeeder implements OnModuleInit {
  private readonly logger = new Logger(AiCatalogSeeder.name)

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const p of PROVIDER_SEEDS) {
        const provider = await this.prisma.aiProvider.upsert({
          where: { code: p.code },
          create: {
            code: p.code,
            name: p.name,
            baseUrl: p.baseUrl,
            keyInstructions: p.keyInstructions,
            keyConsoleUrl: p.keyConsoleUrl,
            freeTierNote: p.freeTierNote,
            sortOrder: p.sortOrder,
          },
          update: {
            name: p.name,
            baseUrl: p.baseUrl,
            keyInstructions: p.keyInstructions,
            keyConsoleUrl: p.keyConsoleUrl,
            freeTierNote: p.freeTierNote,
            sortOrder: p.sortOrder,
            isActive: true,
          },
        })

        for (const m of p.models) {
          await this.prisma.aiProviderModel.upsert({
            where: { providerId_code: { providerId: provider.id, code: m.code } },
            create: {
              providerId: provider.id,
              code: m.code,
              name: m.name,
              capabilities: m.capabilities,
              note: m.note ?? null,
            },
            update: {
              name: m.name,
              capabilities: m.capabilities,
              note: m.note ?? null,
              isActive: true,
            },
          })
        }
      }

      for (const t of TASK_SEEDS) {
        await this.prisma.aiTask.upsert({
          where: { code: t.code },
          create: {
            code: t.code,
            name: t.name,
            description: t.description,
            scope: t.scope,
            requiredCapability: t.requiredCapability,
            defaultPrompt: t.defaultPrompt,
            promptVersion: t.promptVersion,
            promptEditable: t.promptEditable,
            requiresModel: t.requiresModel ?? true,
            recommendedModel: t.recommendedModel,
            trialLimit: t.trialLimit,
            sortOrder: t.sortOrder,
          },
          update: {
            name: t.name,
            description: t.description,
            scope: t.scope,
            requiredCapability: t.requiredCapability,
            defaultPrompt: t.defaultPrompt,
            promptVersion: t.promptVersion,
            promptEditable: t.promptEditable,
            requiresModel: t.requiresModel ?? true,
            recommendedModel: t.recommendedModel,
            // trialLimit намеренно НЕ перезаписывается: его можно крутить руками в БД
            sortOrder: t.sortOrder,
            isActive: true,
          },
        })
      }

      this.logger.log(`AI catalog seeded: ${PROVIDER_SEEDS.length} providers, ${TASK_SEEDS.length} tasks`)
    } catch (err) {
      this.logger.error(`AI catalog seeding failed: ${err}`)
    }
  }
}

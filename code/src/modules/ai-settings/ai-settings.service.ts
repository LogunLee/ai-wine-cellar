import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../shared/database/prisma.service'
import { KeyCryptoService } from '../../shared/crypto/key-crypto.service'

@Injectable()
export class AiSettingsService {
  private readonly logger = new Logger(AiSettingsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: KeyCryptoService,
    private readonly config: ConfigService,
  ) {}

  /** Каталог провайдеров и моделей + инструкции. Ключей здесь нет. */
  async getCatalog() {
    const providers = await this.prisma.aiProvider.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { models: { where: { isActive: true }, orderBy: { code: 'asc' } } },
    })
    return {
      providers: providers.map((p) => ({
        code: p.code,
        name: p.name,
        keyConsoleUrl: p.keyConsoleUrl,
        keyInstructions: p.keyInstructions,
        freeTierNote: p.freeTierNote,
        models: p.models.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          capabilities: m.capabilities,
          note: m.note,
        })),
      })),
    }
  }

  /** Задачи (USER) + настройки пользователя + маски ключей + остатки trial. */
  async getSettings(userId: string) {
    const [tasks, settings, keys, usages] = await Promise.all([
      this.prisma.aiTask.findMany({
        where: { scope: 'USER', isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.userTaskSetting.findMany({
        where: { userId },
        include: { model: { include: { provider: true } } },
      }),
      this.prisma.userProviderKey.findMany({
        where: { userId },
        include: { provider: true },
      }),
      this.prisma.aiTrialUsage.findMany({ where: { userId } }),
    ])

    const usageByTask = new Map(usages.map((u) => [u.taskCode, u.used]))
    const settingByTask = new Map(settings.map((s) => [s.taskCode, s]))

    return {
      providerKeys: keys.map((k) => ({
        providerCode: k.provider.code,
        keyMask: `••••${k.keyLast4}`,
        isValid: k.isValid,
        checkedAt: k.checkedAt,
      })),
      tasks: tasks.map((t) => {
        const s = settingByTask.get(t.code)
        const used = usageByTask.get(t.code) ?? 0
        return {
          code: t.code,
          name: t.name,
          description: t.description,
          requiredCapability: t.requiredCapability,
          promptEditable: t.promptEditable,
          requiresModel: t.requiresModel,
          defaultPrompt: t.promptEditable ? t.defaultPrompt : null,
          recommendedModel: t.recommendedModel,
          trialLimit: t.trialLimit,
          trialUsed: used,
          setting: s
            ? {
                modelId: s.modelId,
                modelCode: s.model?.code ?? null,
                modelName: s.model?.name ?? null,
                providerCode: s.model?.provider.code ?? null,
                customPrompt: s.customPrompt,
              }
            : null,
        }
      }),
    }
  }

  async saveProviderKey(userId: string, providerCode: string, apiKey: string) {
    if (!apiKey || apiKey.trim().length < 8) {
      throw new BadRequestException('Ключ слишком короткий')
    }
    if (!this.crypto.available) {
      throw new BadRequestException('Шифрование ключей не настроено на сервере (AI_KEY_ENCRYPTION_SECRET)')
    }
    const provider = await this.requireProvider(providerCode)
    const trimmed = apiKey.trim()

    const encKey = this.crypto.encrypt(trimmed)
    const keyLast4 = trimmed.slice(-4)

    await this.prisma.userProviderKey.upsert({
      where: { userId_providerId: { userId, providerId: provider.id } },
      create: { userId, providerId: provider.id, encKey, keyLast4 },
      update: { encKey, keyLast4, isValid: null, checkedAt: null },
    })

    return { providerCode, keyMask: `••••${keyLast4}` }
  }

  async deleteProviderKey(userId: string, providerCode: string) {
    const provider = await this.requireProvider(providerCode)
    await this.prisma.userProviderKey.deleteMany({
      where: { userId, providerId: provider.id },
    })
    // Настройки задач на моделях этого провайдера сбрасываем — без ключа они мертвы
    await this.prisma.userTaskSetting.deleteMany({
      where: { userId, model: { providerId: provider.id } },
    })
    return { ok: true }
  }

  /** Тестовый вызов GET {baseUrl}/models — дёшево и работает у всех трёх провайдеров. */
  async testProviderKey(userId: string, providerCode: string) {
    const provider = await this.requireProvider(providerCode)
    const key = await this.prisma.userProviderKey.findUnique({
      where: { userId_providerId: { userId, providerId: provider.id } },
    })
    if (!key) throw new NotFoundException('Ключ не сохранён')

    let ok = false
    let error: string | null = null
    try {
      const apiKey = this.crypto.decrypt(Buffer.from(key.encKey))
      let res: Response
      if (provider.code === 'voyage') {
        // У Voyage нет GET /models — проверяем крошечным embeddings-запросом.
        res = await fetch(`${provider.baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ input: ['ping'], model: this.config.get<string>('VOYAGE_MODEL') || 'voyage-3.5' }),
          signal: AbortSignal.timeout(15_000),
        })
      } else {
        res = await fetch(`${provider.baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15_000),
        })
      }
      // 429 = ключ валиден, просто упёрся в лимит — считаем подключение рабочим.
      ok = res.ok || res.status === 429
      if (!ok) {
        // Gemini отвечает 400 на невалидный ключ, остальные — 401/403
        error =
          res.status === 400 || res.status === 401 || res.status === 403
            ? 'Провайдер не принял ключ — проверьте, что он скопирован целиком'
            : `Провайдер ответил ошибкой ${res.status}`
      }
    } catch {
      error = 'Не удалось связаться с провайдером — попробуйте позже'
    }

    await this.prisma.userProviderKey.update({
      where: { id: key.id },
      data: { isValid: ok, checkedAt: new Date() },
    })

    return { ok, error }
  }

  async saveTaskSetting(userId: string, taskCode: string, dto: { modelId?: string | null; customPrompt?: string | null }) {
    const task = await this.prisma.aiTask.findUnique({ where: { code: taskCode } })
    if (!task || !task.isActive || task.scope !== 'USER') {
      throw new NotFoundException('Задача не найдена')
    }

    const customPrompt = task.promptEditable ? (dto.customPrompt?.trim() || null) : null

    // Промпт-задача без модели (например, «внешнее исследование»)
    if (!task.requiresModel) {
      await this.prisma.userTaskSetting.upsert({
        where: { userId_taskCode: { userId, taskCode } },
        create: { userId, taskCode, modelId: null, customPrompt },
        update: { modelId: null, customPrompt },
      })
      return { ok: true }
    }

    if (!dto.modelId) throw new BadRequestException('Не выбрана модель')

    const model = await this.prisma.aiProviderModel.findUnique({
      where: { id: dto.modelId },
      include: { provider: true },
    })
    if (!model || !model.isActive) throw new NotFoundException('Модель не найдена')
    if (!model.capabilities.includes(task.requiredCapability)) {
      throw new BadRequestException(`Модель ${model.name} не поддерживает «${task.requiredCapability}» — выберите другую`)
    }

    const key = await this.prisma.userProviderKey.findUnique({
      where: { userId_providerId: { userId, providerId: model.providerId } },
    })
    if (!key) {
      throw new BadRequestException(`Сначала добавьте ключ провайдера ${model.provider.name}`)
    }

    await this.prisma.userTaskSetting.upsert({
      where: { userId_taskCode: { userId, taskCode } },
      create: { userId, taskCode, modelId: model.id, customPrompt },
      update: { modelId: model.id, customPrompt },
    })

    return { ok: true }
  }

  async deleteTaskSetting(userId: string, taskCode: string) {
    await this.prisma.userTaskSetting.deleteMany({ where: { userId, taskCode } })
    return { ok: true }
  }

  private async requireProvider(code: string) {
    const provider = await this.prisma.aiProvider.findUnique({ where: { code } })
    if (!provider || !provider.isActive) throw new NotFoundException('Провайдер не найден')
    return provider
  }
}

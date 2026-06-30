import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../shared/database/prisma.service'
import { KeyCryptoService } from '../../shared/crypto/key-crypto.service'
import { AiModelsService } from '../ai-models/ai-models.service'
import { AiModelPurpose, AiTask } from '@prisma/client'

/** Провайдер эмбеддингов и параметры триала для семантического поиска. */
const VOYAGE_PROVIDER_CODE = 'voyage'
const VOYAGE_TRIAL_CODE = 'voyage_embedding'
export const VOYAGE_TRIAL_LIMIT = 10

/** Результат резолва Voyage-ключа для поиска. */
export type VoyageKeyResult =
  | { apiKey: string; source: 'user' | 'trial' }
  | { apiKey: null; reason: 'trial_exhausted' | 'not_configured' }

/** Разрешённые параметры AI-вызова для конкретного пользователя и задачи. */
export interface ResolvedAi {
  source: 'user' | 'trial' | 'system'
  providerCode: string
  modelCode: string
  baseUrl: string
  apiKey: string
  /** true — вызывать POST {baseUrl}/chat/completions с Bearer; false — нативный Gemini generateContent */
  openAiCompatible: boolean
  /** Кастомный промпт пользователя (только source=user и только если задан) */
  promptOverride: string | null
  /** Конфиг промпта из системной таблицы ai_model (только trial/system) */
  promptConfig: Record<string, unknown> | null
  /** Остаток пробных вызовов ПОСЛЕ текущего (только source=trial) */
  trialRemaining?: number
}

export class TrialExhaustedException extends HttpException {
  constructor(taskCode: string, limit: number) {
    super(
      {
        statusCode: 402,
        code: 'TRIAL_EXHAUSTED',
        message: `Пробные вызовы для этой задачи закончились (${limit}). Подключите свою AI-модель в настройках.`,
        taskCode,
      },
      402,
    )
  }
}

@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: KeyCryptoService,
    private readonly aiModels: AiModelsService,
    private readonly config: ConfigService,
  ) {}

  // ─── Voyage (эмбеддинги семантического поиска) ──────────────────────────────

  /**
   * Ключ Voyage для запроса пользователя: его собственный ключ → пробный режим на
   * серверном ключе (лимит VOYAGE_TRIAL_LIMIT) → null с причиной. Триал списывать
   * только после успешного вызова через commitVoyageTrialUse().
   */
  async resolveVoyageSearchKey(userId: string): Promise<VoyageKeyResult> {
    const userKey = await this.getUserVoyageKey(userId)
    if (userKey) return { apiKey: userKey, source: 'user' }

    const serverKey = this.config.get<string>('VOYAGE_API_KEY')
    if (!serverKey) return { apiKey: null, reason: 'not_configured' }

    const usage = await this.prisma.aiTrialUsage.findUnique({
      where: { userId_taskCode: { userId, taskCode: VOYAGE_TRIAL_CODE } },
    })
    if ((usage?.used ?? 0) >= VOYAGE_TRIAL_LIMIT) return { apiKey: null, reason: 'trial_exhausted' }
    return { apiKey: serverKey, source: 'trial' }
  }

  /** Списать один пробный Voyage-поиск (вызывать ТОЛЬКО после успешного эмбеддинга). */
  commitVoyageTrialUse(userId: string): Promise<void> {
    return this.commitTrialUse(userId, VOYAGE_TRIAL_CODE)
  }

  /**
   * Ключ для фоновой (ре)индексации описаний бутылки: ключ владельца, иначе
   * серверный. Без триал-лимита — объём мал и это не интерактивный путь.
   */
  async voyageKeyForIndexing(userId: string): Promise<string | null> {
    const userKey = await this.getUserVoyageKey(userId)
    if (userKey) return userKey
    return this.config.get<string>('VOYAGE_API_KEY') ?? null
  }

  private async getUserVoyageKey(userId: string): Promise<string | null> {
    if (!this.crypto.available) return null
    const provider = await this.prisma.aiProvider.findUnique({ where: { code: VOYAGE_PROVIDER_CODE } })
    if (!provider) return null
    const key = await this.prisma.userProviderKey.findUnique({
      where: { userId_providerId: { userId, providerId: provider.id } },
    })
    if (!key) return null
    try {
      return this.crypto.decrypt(Buffer.from(key.encKey))
    } catch {
      return null
    }
  }

  async resolveForUser(userId: string, taskCode: string): Promise<ResolvedAi> {
    const task = await this.prisma.aiTask.findUnique({ where: { code: taskCode } })
    if (!task || !task.isActive) throw new NotFoundException(`Unknown AI task: ${taskCode}`)

    if (task.scope === 'SYSTEM') return this.resolveSystem(task)

    // 1. Собственная настройка пользователя
    const setting = await this.prisma.userTaskSetting.findUnique({
      where: { userId_taskCode: { userId, taskCode } },
      include: { model: { include: { provider: true } } },
    })

    if (setting?.model && setting.model.isActive && setting.model.provider.isActive && this.crypto.available) {
      const key = await this.prisma.userProviderKey.findUnique({
        where: { userId_providerId: { userId, providerId: setting.model.providerId } },
      })
      if (key) {
        return {
          source: 'user',
          providerCode: setting.model.provider.code,
          modelCode: setting.model.code,
          baseUrl: setting.model.provider.baseUrl,
          apiKey: this.crypto.decrypt(Buffer.from(key.encKey)),
          openAiCompatible: true, // все провайдеры справочника — OpenAI-совместимые эндпоинты
          promptOverride: setting.customPrompt ?? null,
          promptConfig: null,
        }
      }
    }

    // 2. Пробный режим на ключах разработчика
    const usage = await this.prisma.aiTrialUsage.findUnique({
      where: { userId_taskCode: { userId, taskCode } },
    })
    const used = usage?.used ?? 0
    if (used >= task.trialLimit) {
      throw new TrialExhaustedException(taskCode, task.trialLimit)
    }

    const sys = await this.resolveSystem(task)
    return { ...sys, source: 'trial', trialRemaining: task.trialLimit - used - 1 }
  }

  /**
   * Списывает один пробный вызов. Вызывать ТОЛЬКО после успешного обращения
   * к модели и только если resolved.source === 'trial' — неудачные вызовы
   * пробный лимит не сжигают.
   */
  async commitTrialUse(userId: string, taskCode: string): Promise<void> {
    await this.prisma.aiTrialUsage.upsert({
      where: { userId_taskCode: { userId, taskCode } },
      create: { userId, taskCode, used: 1 },
      update: { used: { increment: 1 } },
    })
  }

  /** Системное разрешение: текущий механизм ai_model (ключи разработчика). */
  private async resolveSystem(task: AiTask): Promise<ResolvedAi> {
    const purpose: AiModelPurpose =
      task.requiredCapability === 'vision' ? 'IMAGE_RECOGNITION' : 'TEXT_PROCESSING'
    const model = await this.aiModels.getDefaultForPurpose(purpose)

    const baseUrl =
      model.baseUrl ||
      (purpose === 'IMAGE_RECOGNITION' ? 'https://api.mistral.ai/v1' : 'https://generativelanguage.googleapis.com/v1beta')

    const isNativeGemini =
      (model.provider?.toLowerCase() === 'google' || baseUrl.includes('generativelanguage.googleapis.com')) &&
      !baseUrl.includes('/openai')

    return {
      source: 'system',
      providerCode: model.provider?.toLowerCase() || 'unknown',
      modelCode: model.name,
      baseUrl,
      apiKey: model.apiKey,
      openAiCompatible: !isNativeGemini,
      promptOverride: null,
      promptConfig: (model.promptConfig as Record<string, unknown>) ?? null,
    }
  }
}

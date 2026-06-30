import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AiRouterService, ResolvedAi } from '../ai-settings/ai-router.service'

const TASK_CODE = 'vivino_note'
const LLM_TIMEOUT_MS = 30000

/** Карточка вина + сырая заметка, передаваемые в LLM. */
type NoteWithWine = Prisma.TastingNoteGetPayload<{
  include: {
    cellarItem: { include: { wineVintage: { include: { series: { include: { country: true } } } } } }
  }
}>

/**
 * Серверный сервис генерации Vivino-заметки. Берёт сырую личную заметку и данные
 * о вине, возвращает аккуратный готовый текст для ручной публикации в Vivino.
 * Ничего не публикует, не обращается к Vivino API и не сохраняет результат.
 */
@Injectable()
export class VivinoNoteService {
  private readonly logger = new Logger(VivinoNoteService.name)

  constructor(private readonly aiRouter: AiRouterService) {}

  async generate(userId: string, note: NoteWithWine): Promise<string> {
    // resolveForUser сам бросит TrialExhaustedException (402), если лимит исчерпан и ключа нет.
    const resolved = await this.aiRouter.resolveForUser(userId, TASK_CODE)

    const system = resolved.promptOverride || BAKED_PROMPT
    const userPrompt = this.buildUserPrompt(note)

    const raw = await this.callLLM(resolved, system, userPrompt)
    const text = this.sanitize(raw)
    if (!text) {
      throw new ServiceUnavailableException('Не удалось сгенерировать текст заметки — попробуйте ещё раз')
    }

    if (resolved.source === 'trial') {
      await this.aiRouter.commitTrialUse(userId, TASK_CODE).catch(() => undefined)
    }
    return text
  }

  private buildUserPrompt(note: NoteWithWine): string {
    const series = note.cellarItem?.wineVintage?.series
    const comp = note.cellarItem?.wineVintage?.composition as unknown
    const grapes = Array.isArray(comp)
      ? (comp as unknown[]).map((g) => (typeof g === 'string' ? g : (g as { name?: string })?.name)).filter(Boolean).join(', ')
      : ''
    const lines: string[] = []
    const wineName = [series?.producer, series?.name].filter(Boolean).join(' ')
    lines.push(`Вино: ${wineName || 'не указано'}`)
    const vintage = note.vintage ?? note.cellarItem?.wineVintage?.vintageYear
    if (vintage) lines.push(`Винтаж: ${vintage}`)
    if (series?.wineType) lines.push(`Тип: ${this.wineTypeRu(series.wineType)}`)
    const country = series?.country?.nameRu || series?.country?.name
    if (country) lines.push(`Страна: ${country}`)
    if (series?.region) lines.push(`Регион: ${series.region}`)
    if (series?.appellation) lines.push(`Апелласьон: ${series.appellation}`)
    if (grapes) lines.push(`Сорта винограда: ${grapes}`)
    lines.push(`Личная оценка пользователя: ${Number(note.rating)} из 5`)
    if (note.place) lines.push(`Место дегустации: ${note.place}`)
    if (note.wouldBuyAgain != null) lines.push(`Купил бы снова: ${note.wouldBuyAgain ? 'да' : 'нет'}`)
    lines.push('')
    lines.push('Исходная личная заметка пользователя:')
    lines.push(note.noteText?.trim() || '(пользователь не оставил текст — опирайся на оценку и данные о вине)')
    return lines.join('\n')
  }

  /** OpenAI-совместимый chat или нативный Gemini — как в CellarAiSearchService.chat(). */
  private async callLLM(resolved: ResolvedAi, system: string, user: string): Promise<string | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
    try {
      let url: string
      let options: RequestInit
      if (!resolved.openAiCompatible) {
        const modelName = resolved.modelCode.startsWith('models/') ? resolved.modelCode : `models/${resolved.modelCode}`
        url = `${resolved.baseUrl}/${modelName}:generateContent?key=${resolved.apiKey}`
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: { temperature: 0.6 },
          }),
          signal: controller.signal,
        }
      } else {
        url = `${resolved.baseUrl}/chat/completions`
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resolved.apiKey}` },
          body: JSON.stringify({
            model: resolved.modelCode,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: 0.6,
          }),
          signal: controller.signal,
        }
      }
      const res = await fetch(url, options)
      if (!res.ok) {
        this.logger.error(`Vivino note LLM error ${res.status}`)
        throw new ServiceUnavailableException('Сервис генерации временно недоступен')
      }
      const data = await res.json()
      return resolved.openAiCompatible
        ? data.choices?.[0]?.message?.content ?? null
        : data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e
      this.logger.error(`Vivino note generation failed: ${(e as Error).message}`)
      throw new ServiceUnavailableException('Сервис генерации временно недоступен')
    } finally {
      clearTimeout(timeout)
    }
  }

  /** Убирает обёртки модели: code fences, служебные префиксы, обрамляющие кавычки. */
  private sanitize(raw: string | null): string {
    if (!raw) return ''
    let t = raw.trim()
    t = t.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim()
    t = t.replace(/^(вот|here is|here's)[^:\n]{0,40}:\s*/i, '').trim()
    if (t.length > 1 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('«') && t.endsWith('»')))) {
      t = t.slice(1, -1).trim()
    }
    return t.slice(0, 5000)
  }

  private wineTypeRu(t: string): string {
    const map: Record<string, string> = {
      RED: 'красное',
      WHITE: 'белое',
      ROSE: 'розовое',
      SPARKLING: 'игристое',
      SWEET: 'десертное',
      FORTIFIED: 'крепленое',
      OTHER: 'вино',
    }
    return map[t] ?? t
  }
}

const BAKED_PROMPT = `Ты помогаешь винолюбителю превратить его черновую дегустационную заметку в аккуратный, читаемый отзыв для публикации на Vivino.

Правила:
- Пиши от первого лица, живым человеческим языком, по-русски.
- Опирайся ТОЛЬКО на то, что есть в исходной заметке и в данных о вине. Не выдумывай вкусы, ароматы, оценки и факты, которых нет.
- Сохрани личную оценку и общее настроение автора.
- Объём — 2–5 предложений, связный текст, без списков и заголовков.
- Верни ТОЛЬКО готовый текст заметки. Без вступлений, пояснений, комментариев, markdown-разметки, кавычек и фраз вроде «Вот готовая заметка».`

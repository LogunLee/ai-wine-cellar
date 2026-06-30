import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../shared/database/prisma.service'
import { AiRouterService, ResolvedAi } from '../ai-settings/ai-router.service'
import { EmbeddingService } from './embedding.service'
import {
  buildCellarWhere,
  FIELD_SCHEMA_DESCRIPTION,
  QueryUnderstanding,
} from './search-field-registry'

const TASK_CODE = 'cellar_ai_search'
const KB_TOP_K = 8
const WINE_TOP_K = 6
const MAX_CANDIDATES = 60
const LLM_TIMEOUT_MS = 30000
const DESC_CLIP = 1500

export const DEFAULT_SOMMELIER_PROMPT =
  'Ты — внимательный сомелье. Подбираешь вино ИЗ ПОГРЕБА пользователя под его запрос. ' +
  'Опирайся только на предоставленный контекст (знания из винных книг, описания вин, список бутылок). ' +
  'Не выдумывай фактов о конкретных бутылках, которых нет в данных. ' +
  'Отсутствие сведений считай за «неизвестно», а не за «нет». ' +
  'Если запрос нестандартный (рейтинг критика, «удиви меня», экзотический критерий) — рассуждай от общих знаний о вкусах, ' +
  'но честно: подбирай среди того, что реально есть. Если идеального нет — так и скажи и предложи лучший компромисс.'

export interface AiSearchPick {
  cellarItemId: string
  title: string
  rank: number
  reason: string
}
export interface AiSearchSource {
  bookId: string
  printedPage: number | null
  heading: string | null
}
export interface AiSearchResult {
  query: string
  answer: string
  picks: AiSearchPick[]
  understanding: QueryUnderstanding
  sources: AiSearchSource[]
  notes: string[]
}

interface KbRow {
  id: string
  book_id: string
  printed_page: number | null
  heading: string | null
  text: string
  score: number
}
interface WineRow {
  cellar_item_id: string
  source: string
  text: string
  score: number
}

@Injectable()
export class CellarAiSearchService {
  private readonly logger = new Logger(CellarAiSearchService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async search(userId: string, query: string): Promise<AiSearchResult> {
    const notes: string[] = []
    const resolved = await this.aiRouter.resolveForUser(userId, TASK_CODE)

    // ── Stage 1: understand the query → structured filters + semantic query ──
    const understanding = await this.understand(resolved, query, userId, notes)

    // ── Stage 2a: hard-filter the (small) cellar ──
    const candidates = await this.fetchCandidates(userId, understanding)
    if (candidates.length === 0) {
      notes.push('По жёстким фильтрам в погребе ничего не нашлось — критерии могли быть слишком строгими.')
    }

    // ── Stage 2b: semantic retrieval over books + wine descriptions ──
    // Ключ Voyage — персональный: свой ключ пользователя → пробный режим на серверном
    // ключе (10 поисков) → деградация. Эмбеддинг запроса в режиме fast-fail.
    let kb: KbRow[] = []
    let wineHits: WineRow[] = []
    if (understanding.semanticQuery.trim()) {
      const voy = await this.aiRouter.resolveVoyageSearchKey(userId)
      if (voy.apiKey !== null) {
        try {
          const qvec = await this.embeddings.embedQuery(understanding.semanticQuery, voy.apiKey)
          const vec = EmbeddingService.toVectorLiteral(qvec)
          kb = await this.vectorSearchKb(vec)
          wineHits = await this.vectorSearchWine(userId, vec)
          if (voy.source === 'trial') await this.aiRouter.commitVoyageTrialUse(userId).catch(() => undefined)
        } catch (e) {
          this.logger.warn(`Semantic retrieval skipped: ${(e as Error).message}`)
          notes.push('Семантический поиск временно недоступен (лимит эмбеддингов) — отвечаю по структуре погреба.')
        }
      } else if (voy.reason === 'trial_exhausted') {
        notes.push('Пробные семантические поиски закончились — подключите свой ключ Voyage в настройках, чтобы искать по винным книгам.')
      } else {
        notes.push('Семантический поиск по книгам не настроен — отвечаю по структуре погреба.')
      }
    }

    // ── Stage 3: synthesize ──
    const result = await this.synthesize(resolved, query, understanding, candidates, kb, wineHits, notes)

    if (resolved.source === 'trial') {
      await this.aiRouter.commitTrialUse(userId, TASK_CODE).catch(() => undefined)
    }
    return result
  }

  // ───────────────────────────── stage 1 ─────────────────────────────
  private async understand(
    resolved: ResolvedAi,
    query: string,
    userId: string,
    notes: string[],
  ): Promise<QueryUnderstanding> {
    const system =
      'Ты разбираешь запрос пользователя о подборе вина и возвращаешь СТРОГО валидный JSON по схеме. ' +
      'Жёсткие фильтры ставь только когда они явно следуют из запроса. Нестандартные критерии переводи в semanticQuery. ' +
      'Никаких пояснений вне JSON.'
    const user = `Схема ответа:\n${FIELD_SCHEMA_DESCRIPTION}\n\nЗапрос пользователя: «${query}»\n\nВерни только JSON-объект {structured, soft, semanticQuery, mode, unsupported}.`

    const raw = await this.chat(resolved, system, user, userId).catch((e) => {
      this.logger.warn(`understand() failed: ${(e as Error).message}`)
      return null
    })
    const parsed = raw ? this.tryParseJson<Partial<QueryUnderstanding>>(raw) : null
    if (!parsed) {
      notes.push('Не удалось формально разобрать запрос — ищу по смыслу всей фразы.')
      return { structured: { inStockOnly: true }, soft: {}, semanticQuery: query, mode: 'descriptor' }
    }
    return {
      structured: parsed.structured ?? { inStockOnly: true },
      soft: parsed.soft ?? {},
      semanticQuery: (parsed.semanticQuery && parsed.semanticQuery.trim()) || query,
      mode: parsed.mode ?? 'descriptor',
      unsupported: parsed.unsupported ?? [],
    }
  }

  // ───────────────────────────── stage 2 ─────────────────────────────
  private async fetchCandidates(userId: string, u: QueryUnderstanding) {
    const items = await this.prisma.cellarItem.findMany({
      where: buildCellarWhere(userId, u.structured),
      include: { wineVintage: { include: { series: { include: { country: true } } } } },
      take: MAX_CANDIDATES,
      orderBy: { createdAt: 'desc' },
    })
    return items.map((it, idx) => {
      const s = it.wineVintage?.series
      const comp = it.wineVintage?.composition as unknown
      const grapes = Array.isArray(comp)
        ? (comp as unknown[]).map((g) => (typeof g === 'string' ? g : (g as { name?: string })?.name)).filter(Boolean)
        : []
      return {
        index: idx + 1,
        cellarItemId: it.id,
        producer: s?.producer ?? null,
        name: s?.name ?? null,
        wineType: s?.wineType ?? null,
        country: s?.country?.nameRu || s?.country?.name || null,
        region: s?.region ?? null,
        appellation: s?.appellation ?? null,
        vintageYear: it.wineVintage?.vintageYear ?? null,
        grapes,
        quantity: it.quantity,
        userDescription: clip(it.userDescription),
        sellerDescription: clip(it.sellerDescription),
        producerDescription: clip(it.producerDescription),
      }
    })
  }

  private async vectorSearchKb(vec: string): Promise<KbRow[]> {
    return this.prisma.$queryRawUnsafe<KbRow[]>(
      `SELECT id, book_id, printed_page, heading, text,
              1 - (embedding <=> '${vec}'::vector) AS score
       FROM kb_chunk
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> '${vec}'::vector
       LIMIT ${KB_TOP_K}`,
    )
  }

  private async vectorSearchWine(userId: string, vec: string): Promise<WineRow[]> {
    // Join cellar_item so descriptions of deleted bottles never surface, even if a
    // best-effort vector cleanup was missed (defense in depth).
    return this.prisma.$queryRawUnsafe<WineRow[]>(
      `SELECT w.cellar_item_id, w.source, w.text,
              1 - (w.embedding <=> '${vec}'::vector) AS score
       FROM wine_desc_chunk w
       JOIN cellar_item ci ON ci.id = w.cellar_item_id AND ci.deleted_at IS NULL
       WHERE w.owner_id = $1::uuid AND w.embedding IS NOT NULL
       ORDER BY w.embedding <=> '${vec}'::vector
       LIMIT ${WINE_TOP_K}`,
      userId,
    )
  }

  // ───────────────────────────── stage 3 ─────────────────────────────
  private async synthesize(
    resolved: ResolvedAi,
    query: string,
    u: QueryUnderstanding,
    candidates: Awaited<ReturnType<CellarAiSearchService['fetchCandidates']>>,
    kb: KbRow[],
    wineHits: WineRow[],
    notes: string[],
  ): Promise<AiSearchResult> {
    const system = resolved.promptOverride || DEFAULT_SOMMELIER_PROMPT

    const kbBlock = kb.length
      ? kb.map((c) => `• [${c.book_id} с.${c.printed_page ?? '?'}] ${c.text}`).join('\n')
      : '(нет релевантных выдержек из книг)'
    const wineBlock = wineHits.length
      ? wineHits.map((w) => `• [вино #${this.indexOf(candidates, w.cellar_item_id)}] ${w.text}`).join('\n')
      : '(нет совпадений по описаниям вин)'
    const bottlesBlock = candidates.length
      ? candidates
          .map(
            (b) =>
              `#${b.index} {id:${b.cellarItemId}} ${[b.producer, b.name].filter(Boolean).join(' ')}` +
              ` — ${b.wineType ?? '?'}, ${b.region ?? b.country ?? '?'}` +
              `${b.vintageYear ? ', ' + b.vintageYear : ''}${b.grapes.length ? ', ' + b.grapes.join('/') : ''}` +
              ` (в наличии: ${b.quantity})` +
              `${b.userDescription ? '\n   описание: ' + b.userDescription : ''}` +
              `${b.producerDescription ? '\n   tech sheet: ' + b.producerDescription : ''}`,
          )
          .join('\n')
      : '(в погребе нет подходящих бутылок по жёстким фильтрам)'

    const userPrompt =
      `Запрос: «${query}»\n\n` +
      `Знания из винных книг:\n${kbBlock}\n\n` +
      `Совпадения по описаниям вин:\n${wineBlock}\n\n` +
      `Бутылки в погребе (выбирай ТОЛЬКО из них, по индексу #):\n${bottlesBlock}\n\n` +
      `Верни строго JSON: {"answer": "...", "picks": [{"index": номер_бутылки, "rank": 1, "reason": "почему"}]}.\n` +
      `Поле answer — это 1–3 предложения ОБЩЕЙ рекомендации: какой стиль/тип/сорт вина подойдёт под запрос и почему ` +
      `(например, какие характеристики важны для сочетания с блюдом или настроением). ` +
      `В answer НЕ перечисляй конкретные бутылки и НЕ называй их названия/производителей — конкретный подбор идёт только в picks. ` +
      `В picks перечисли подходящие бутылки по индексу #, отсортируй по уместности, в reason кратко объясни каждую. ` +
      `Если подходящих бутылок нет — picks=[] и объясни это в answer.`

    const raw = await this.chat(resolved, system, userPrompt, '').catch((e) => {
      this.logger.warn(`synthesize() failed: ${(e as Error).message}`)
      return null
    })
    const parsed = raw ? this.tryParseJson<{ answer?: string; picks?: { index: number; rank?: number; reason?: string }[] }>(raw) : null

    const picks: AiSearchPick[] = []
    if (parsed?.picks?.length) {
      for (const p of parsed.picks) {
        const b = candidates.find((c) => c.index === p.index)
        if (b) {
          picks.push({
            cellarItemId: b.cellarItemId,
            title: [b.producer, b.name].filter(Boolean).join(' ') || 'Вино',
            rank: p.rank ?? picks.length + 1,
            reason: p.reason ?? '',
          })
        }
      }
    }

    return {
      query,
      answer: parsed?.answer || raw || 'Не удалось сформировать ответ.',
      picks,
      understanding: u,
      sources: kb.map((c) => ({ bookId: c.book_id, printedPage: c.printed_page, heading: c.heading })),
      notes,
    }
  }

  private indexOf(candidates: { index: number; cellarItemId: string }[], id: string): number | string {
    return candidates.find((c) => c.cellarItemId === id)?.index ?? '?'
  }

  // ───────────────────────── shared LLM call ─────────────────────────
  /** OpenAI-compatible chat or native Gemini, mirroring WineResearchService.callLLM. */
  private async chat(resolved: ResolvedAi, system: string, user: string, _userId: string): Promise<string | null> {
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
            generationConfig: { temperature: 0.2 },
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
            temperature: 0.2,
          }),
          signal: controller.signal,
        }
      }
      const res = await fetch(url, options)
      if (!res.ok) {
        this.logger.error(`LLM API error ${res.status}`)
        return null
      }
      const data = await res.json()
      return resolved.openAiCompatible
        ? data.choices?.[0]?.message?.content ?? null
        : data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
    } finally {
      clearTimeout(timeout)
    }
  }

  private tryParseJson<T>(content: string): T | null {
    try {
      const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
      return JSON.parse(slice) as T
    } catch {
      return null
    }
  }
}

function clip(s: string | null): string | null {
  if (!s) return null
  return s.length > DESC_CLIP ? s.slice(0, DESC_CLIP) + '…' : s
}

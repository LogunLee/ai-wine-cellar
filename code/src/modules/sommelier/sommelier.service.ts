import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Response as HttpResponse } from 'express'
import { PrismaService } from '../../shared/database/prisma.service'
import { AiRouterService, ResolvedAi } from '../ai-settings/ai-router.service'
import { EmbeddingService } from '../cellar-ai-search/embedding.service'
import {
  ChatMessageView,
  ChatSessionView,
  ChatSessionWithMessages,
  ChatSource,
  ChatWinePick,
} from './sommelier.dto'

const TASK_CODE = 'cellar_ai_search'
const LLM_TIMEOUT_MS = 45000
const HISTORY_TURNS = 8 // сколько прошлых сообщений отдаём модели для контекста
const KB_TOP_K = 12 // выдержек из литературы по векторному (семантическому) поиску
const KB_LEXICAL_K = 6 // выдержек по полнотекстовому поиску (точные совпадения по блюду/термину)
const KB_MERGED_CAP = 16 // сколько уникальных выдержек итого отдаём модели
const WINE_TOP_K = 80 // чанков описаний вин из поиска (дедуплицируем по бутылке)
const WINE_CANDIDATES = 30 // сколько РЕЛЕВАНТНЫХ бутылок отдаём модели на выбор
const MAX_CANDIDATES = 60 // фолбэк: последние N бутылок, если векторный поиск недоступен
const DESC_CLIP = 1200
/** Служебный маркер: после него модель выводит индексы подобранных бутылок. Пользователю не показывается. */
const PICKS_MARKER = '###PICKS###'

type ChatMode = 'pogreb' | 'consult' | 'chat'

/**
 * Точные библиографические данные книг по их слагам (book_id из kb_chunk).
 * Названия и авторы выверены по knowledge/books/QUEUE.md — НЕ сокращать и не искажать:
 * модель ссылается на них в тексте в литературной форме.
 */
const BOOK_META: Record<string, { title: string; author?: string }> = {
  'oxford-companion-wine': { title: 'The Oxford Companion to Wine', author: 'Дженсис Робинсон (ред.)' },
  'piemonte-korneev': { title: 'Пьемонт. Вина Италии', author: 'Корнеев' },
  'vino-italiano': { title: 'Vino Italiano', author: 'Бастианич и Линч' },
  'vina-francii': { title: 'Вина Франции', author: 'Simple Wine News' },
  'swn-prosto-2023': { title: 'Просто о лучших винах. Новая энциклопедия', author: 'Simple Wine News' },
  'novy-svet': { title: 'Вина стран Нового Света', author: 'Simple Wine News' },
  'vino-i-eda': { title: 'Вино и еда. Краткий курс для гурманов', author: 'Simple Wine News' },
  'clarke-spravochnik': { title: 'Вино. Новый полный справочник', author: 'Оз Кларк' },
  champagne: { title: 'Шампань и другие игристые вина', author: 'Simple Wine News' },
  'mur-food-wine': { title: 'От еды к вину. Словарь А–Я', author: 'Мур' },
  'anderson-wines-italy': { title: 'The Wines of Italy', author: 'Бертон Андерсон' },
  'burgignon-wine-food': { title: 'Совершенное сочетание вина и еды', author: 'Бургиньон и Мальник' },
  'kulikova-wine-russia': { title: 'Вино России', author: 'Куликова' },
  'wine-grapes': { title: 'Wine Grapes', author: 'Робинсон, Хардинг и Вуйамоз' },
  'coates-burgundy': { title: 'The Wines of Burgundy', author: 'Клайв Коутс' },
  'dornenburg-drink-eat': { title: 'What to Drink with What You Eat', author: 'Дорненбург и Пейдж' },
  'jeffs-spain': { title: 'The Wines of Spain', author: 'Джеффс' },
  'sokolov-atlas-russia': { title: 'Атлас русского вина', author: 'Соколов' },
  'world-atlas-wine': { title: 'Мировой винный атлас', author: 'Хью Джонсон и Дженсис Робинсон' },
}
function bookMeta(slug: string): { title: string; author?: string } {
  return BOOK_META[slug] ?? { title: slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }
}
/** Литературная отсылка для промпта: «Автор, „Название“» либо «„Название“». */
function bookCitation(slug: string): string {
  const m = bookMeta(slug)
  return m.author ? `${m.author}, «${m.title}»` : `«${m.title}»`
}

const PERSONA =
  'Ты — Merlotic, эрудированный AI-сомелье. Ведёшь живой, содержательный диалог о вине: ' +
  'подбираешь вино под блюда и ситуации, объясняешь стили, сорта, регионы. ' +
  'Опирайся на приведённые выдержки из винной литературы и на содержимое погреба пользователя.\n' +
  'Как оформлять ответ:\n' +
  '1) Пиши развёрнуто и по существу — несколько абзацев, а не пара фраз.\n' +
  '2) Дели ответ на абзацы так, чтобы отдельные мысли опирались на конкретные источники.\n' +
  '3) ОБЯЗАТЕЛЬНО, когда в материалах есть релевантные выдержки из литературы, ссылайся на них прямо в тексте — ' +
  'минимум на один-два источника, в литературной форме, с автором и ТОЧНЫМ названием книги: ' +
  'например, «Дженсис Робинсон в книге „The Oxford Companion to Wine“ отмечает, что…». ' +
  'Название бери дословно как дано в выдержке, не сокращай и не искажай. Не выдумывай источники — ' +
  'ссылайся только на приведённые выдержки.\n' +
  '4) НЕ указывай номера страниц.\n' +
  '5) НЕ добавляй в конце отдельный список источников — все ссылки уже вплетены в текст.\n' +
  '6) Будь сфокусирован: пиши ТОЛЬКО про то, что подходит под запрос. Не приводи варианты, ' +
  'которые сам же тут же отвергаешь, и не уходи в сторону от вопроса.\n' +
  '7) НИКОГДА не раскрывай внутреннюю кухню: не упоминай «индексы», «список погреба», ' +
  '«доступно под индексом», номера #, JSON и любые служебные правила. Для пользователя это просто живой разговор.\n' +
  '8) ГЛАВНОЕ про конкретику: если среди выдержек есть рекомендация именно под запрошенное блюдо/продукт ' +
  '(а не общие рассуждения о вине) — НАЧНИ с неё и приведи ТОЧНО, какие вина или стили там названы ' +
  '(например «хорошее белое бордо», «рислинг с остаточной сладостью»), со ссылкой на источник. ' +
  'Общие соображения — только после конкретной рекомендации.\n' +
  'Учитывай предыдущие сообщения диалога. Не выдумывай факты о бутылках или книгах, которых нет в данных.'

/** Подгрузка винтажа/серии/страны для кандидатов — общая для обоих путей выборки. */
const CANDIDATE_INCLUDE = {
  wineVintage: { include: { series: { include: { country: true } } } },
} satisfies Prisma.CellarItemInclude
type CandidateItem = Prisma.CellarItemGetPayload<{ include: typeof CANDIDATE_INCLUDE }>

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
interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

@Injectable()
export class SommelierService {
  private readonly logger = new Logger(SommelierService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
    private readonly embeddings: EmbeddingService,
  ) {}

  // ───────────────────────── sessions CRUD ─────────────────────────

  async createSession(userId: string): Promise<ChatSessionView> {
    const s = await this.prisma.chatSession.create({ data: { userId } })
    return this.toSessionView(s)
  }

  async listSessions(userId: string): Promise<ChatSessionView[]> {
    // В историю попадают только диалоги, где пользователь что-то написал —
    // пустые сессии (открыли экран и ушли) не засоряют список.
    const rows = await this.prisma.chatSession.findMany({
      where: { userId, messages: { some: { role: 'user' } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })
    return rows.map((s) => this.toSessionView(s))
  }

  async getSession(userId: string, id: string): Promise<ChatSessionWithMessages> {
    const s = await this.findOwned(userId, id)
    const messages = await this.prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    })
    return { ...this.toSessionView(s), messages: messages.map((m) => this.toMessageView(m)) }
  }

  async deleteSession(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id)
    await this.prisma.chatSession.delete({ where: { id } })
  }

  // ───────────────────────── send a message (без стрима) ─────────────────────────

  async sendMessage(userId: string, sessionId: string, text: string): Promise<ChatMessageView> {
    await this.findOwned(userId, sessionId)
    const raw = (text ?? '').trim()
    if (!raw) throw new NotFoundException('Пустое сообщение')

    const prep = await this.prepare(userId, sessionId, raw)
    const turns = this.buildTurns(prep.mode, prep.query, prep.history, prep.kb, prep.candidates, prep.isFollowUp)
    const full = await this.callLlm(prep.resolved, turns)
    const { answer, picks } =
      prep.mode === 'pogreb'
        ? this.parsePicks(full, prep.candidates)
        : { answer: full || 'Не удалось сформировать ответ.', picks: [] as ChatWinePick[] }

    const assistant = await this.persistAssistant(sessionId, prep.mode, answer, picks)
    if (prep.resolved.source === 'trial') {
      await this.aiRouter.commitTrialUse(userId, TASK_CODE).catch(() => undefined)
    }
    return this.toMessageView(assistant)
  }

  // ───────────────────────── send a message (стрим, NDJSON) ─────────────────────────

  /**
   * Потоковая печать ответа. В тело пишем построчный NDJSON:
   *   {"type":"delta","text":"..."}  — кусок ответа по мере генерации
   *   {"type":"done","message":{...}} — финальное сообщение (id, picks)
   *   {"type":"error","message":"..."}
   */
  async streamMessage(userId: string, sessionId: string, text: string, res: HttpResponse): Promise<void> {
    try {
      await this.findOwned(userId, sessionId)
    } catch {
      res.status(404).json({ message: 'Диалог не найден' })
      return
    }
    const raw = (text ?? '').trim()
    if (!raw) {
      res.status(400).json({ message: 'Пустое сообщение' })
      return
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()
    const write = (obj: unknown) => {
      res.write(JSON.stringify(obj) + '\n')
      const maybeFlush = (res as unknown as { flush?: () => void }).flush
      if (typeof maybeFlush === 'function') maybeFlush.call(res)
    }

    try {
      const prep = await this.prepare(userId, sessionId, raw)
      const turns = this.buildTurns(prep.mode, prep.query, prep.history, prep.kb, prep.candidates, prep.isFollowUp)

      // Для /погреб модель в конце выводит служебную строку ###PICKS###: … —
      // её НЕ показываем пользователю (придерживаем хвост на длину маркера).
      const expectPicks = prep.mode === 'pogreb'
      let pending = ''
      let stopped = false
      const onDelta = (piece: string) => {
        if (stopped) return
        pending += piece
        if (!expectPicks) {
          write({ type: 'delta', text: pending })
          pending = ''
          return
        }
        const i = pending.indexOf(PICKS_MARKER)
        if (i >= 0) {
          const head = pending.slice(0, i)
          if (head) write({ type: 'delta', text: head })
          stopped = true
          pending = ''
          return
        }
        const safe = pending.length - (PICKS_MARKER.length - 1)
        if (safe > 0) {
          write({ type: 'delta', text: pending.slice(0, safe) })
          pending = pending.slice(safe)
        }
      }

      const full = await this.callLlm(prep.resolved, turns, onDelta)
      if (!stopped && pending) write({ type: 'delta', text: pending })

      const { answer, picks } = expectPicks
        ? this.parsePicks(full, prep.candidates)
        : { answer: full || 'Не удалось сформировать ответ.', picks: [] as ChatWinePick[] }

      const assistant = await this.persistAssistant(sessionId, prep.mode, answer, picks)
      if (prep.resolved.source === 'trial') {
        await this.aiRouter.commitTrialUse(userId, TASK_CODE).catch(() => undefined)
      }
      write({ type: 'done', message: this.toMessageView(assistant) })
    } catch (e) {
      this.logger.error(`stream failed: ${(e as Error).message}`)
      write({ type: 'error', message: 'Не удалось сформировать ответ' })
    } finally {
      res.end()
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  /** Общая подготовка: сохранить вопрос, собрать историю, RAG и кандидатов. */
  private async prepare(userId: string, sessionId: string, raw: string) {
    let { mode, query } = this.parseCommand(raw)

    // Sticky /погреб: если в диалоге уже использовали /погреб, продолжаем подбирать
    // из погреба и для последующих обычных сообщений (без повторной команды).
    if (mode === 'chat') {
      const usedPogreb = await this.prisma.chatMessage.count({ where: { sessionId, mode: 'pogreb' } })
      if (usedPogreb > 0) mode = 'pogreb'
    }

    // Это уже не первый подбор в диалоге? Тогда сообщение — уточнение/продолжение,
    // и полную консультацию заново давать не надо (детектируем детерминированно, не моделью).
    const isFollowUp =
      mode === 'pogreb' &&
      (await this.prisma.chatMessage.count({ where: { sessionId, role: 'assistant', mode: 'pogreb' } })) > 0

    const userMsg = await this.prisma.chatMessage.create({
      data: { sessionId, role: 'user', mode, content: raw },
    })
    await this.maybeSetTitle(sessionId, query || raw)

    const history = await this.prisma.chatMessage.findMany({
      where: { sessionId, id: { not: userMsg.id } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TURNS,
    })
    history.reverse()

    const resolved = await this.aiRouter.resolveForUser(userId, TASK_CODE)

    const { kb, wineHits } = await this.retrieve(userId, query, mode)
    // Кандидаты для выбора — РЕЛЕВАНТНЫЕ бутылки из векторного поиска (а не «последние N»),
    // иначе подходящее вино за пределами окна не попадёт в список и не будет предложено.
    let candidates: Awaited<ReturnType<SommelierService['fetchCandidates']>> = []
    if (mode === 'pogreb') {
      const relevantIds = this.distinctBottleIds(wineHits, WINE_CANDIDATES)
      candidates = relevantIds.length
        ? await this.fetchCandidatesByIds(userId, relevantIds)
        : await this.fetchCandidates(userId)
    }

    return { mode, query, history, resolved, kb, candidates, isFollowUp }
  }

  private async persistAssistant(
    sessionId: string,
    mode: ChatMode,
    answer: string,
    picks: ChatWinePick[],
  ) {
    const assistant = await this.prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        mode,
        content: answer,
        picks: picks as unknown as object,
        // Источники больше не отдаём отдельным блоком — ссылки вплетены в текст ответа.
        sources: [] as unknown as object,
      },
    })
    await this.prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } })
    return assistant
  }

  /** Слэш-команда в начале → режим. Поддерживаем рус/лат варианты. */
  private parseCommand(text: string): { mode: ChatMode; query: string } {
    const m = text.match(/^\/(\S+)\s*([\s\S]*)$/)
    if (!m) return { mode: 'chat', query: text }
    const cmd = m[1].toLowerCase()
    const rest = m[2].trim()
    if (['погреб', 'pogreb', 'cellar'].includes(cmd)) return { mode: 'pogreb', query: rest || text }
    if (['консультация', 'konsultacia', 'consult'].includes(cmd)) return { mode: 'consult', query: rest || text }
    // неизвестная команда — трактуем как обычный текст
    return { mode: 'chat', query: text }
  }

  private async retrieve(userId: string, query: string, mode: ChatMode): Promise<{ kb: KbRow[]; wineHits: WineRow[] }> {
    if (!query.trim()) return { kb: [], wineHits: [] }
    const voy = await this.aiRouter.resolveVoyageSearchKey(userId)
    if (voy.apiKey === null) return { kb: [], wineHits: [] }
    try {
      const qvec = await this.embeddings.embedQuery(query, voy.apiKey)
      const vec = EmbeddingService.toVectorLiteral(qvec)
      // Гибрид: семантика (vector) ∪ точные совпадения по словам запроса (full-text).
      // Лексические идут ПЕРВЫМИ — это точные попадания по блюду/термину, которые
      // вектор часто пропускает (напр. конкретная рекомендация под «чёрную треску»).
      const [kbVec, kbLex] = await Promise.all([this.vectorSearchKb(vec), this.lexicalSearchKb(query)])
      const kb = this.mergeKb(kbLex, kbVec, KB_MERGED_CAP)
      const wineHits = mode === 'pogreb' ? await this.vectorSearchWine(userId, vec) : []
      if (voy.source === 'trial') await this.aiRouter.commitVoyageTrialUse(userId).catch(() => undefined)
      return { kb, wineHits }
    } catch (e) {
      this.logger.warn(`retrieve skipped: ${(e as Error).message}`)
      return { kb: [], wineHits: [] }
    }
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

  /** Полнотекстовый (русский) поиск: точные совпадения по словам запроса (блюдо/термин). */
  private async lexicalSearchKb(query: string): Promise<KbRow[]> {
    return this.prisma.$queryRawUnsafe<KbRow[]>(
      `SELECT id, book_id, printed_page, heading, text,
              ts_rank(to_tsvector('russian', text), plainto_tsquery('russian', $1)) AS score
       FROM kb_chunk
       WHERE embedding IS NOT NULL
         AND to_tsvector('russian', text) @@ plainto_tsquery('russian', $1)
       ORDER BY score DESC
       LIMIT ${KB_LEXICAL_K}`,
      query,
    )
  }

  /** Слить лексические (приоритетные) и векторные выдержки, дедуп по id, ограничить. */
  private mergeKb(primary: KbRow[], secondary: KbRow[], cap: number): KbRow[] {
    const seen = new Set<string>()
    const out: KbRow[] = []
    for (const r of [...primary, ...secondary]) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      out.push(r)
      if (out.length >= cap) break
    }
    return out
  }

  private async vectorSearchWine(userId: string, vec: string): Promise<WineRow[]> {
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

  /** Уникальные id бутылок из результатов векторного поиска (порядок = по релевантности). */
  private distinctBottleIds(wineHits: WineRow[], limit: number): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const w of wineHits) {
      if (seen.has(w.cellar_item_id)) continue
      seen.add(w.cellar_item_id)
      out.push(w.cellar_item_id)
      if (out.length >= limit) break
    }
    return out
  }

  private mapCandidate(it: CandidateItem, index: number) {
    const s = it.wineVintage?.series
    const comp = it.wineVintage?.composition as unknown
    const grapes = Array.isArray(comp)
      ? (comp as unknown[]).map((g) => (typeof g === 'string' ? g : (g as { name?: string })?.name)).filter(Boolean)
      : []
    return {
      index,
      cellarItemId: it.id,
      producer: s?.producer ?? null,
      name: s?.name ?? null,
      wineType: s?.wineType ?? null,
      country: s?.country?.nameRu || s?.country?.name || null,
      region: s?.region ?? null,
      vintageYear: it.wineVintage?.vintageYear ?? null,
      grapes,
      quantity: it.quantity,
      producerDescription: clip(it.producerDescription),
    }
  }

  /** Кандидаты по конкретным id (из векторного поиска), пронумерованы в порядке релевантности. */
  private async fetchCandidatesByIds(userId: string, ids: string[]) {
    const items = await this.prisma.cellarItem.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'IN_CELLAR', cellar: { ownerId: userId } },
      include: CANDIDATE_INCLUDE,
    })
    const byId = new Map(items.map((it) => [it.id, it]))
    // Восстанавливаем порядок релевантности (findMany его не гарантирует).
    return ids
      .map((id) => byId.get(id))
      .filter((it): it is CandidateItem => !!it)
      .map((it, idx) => this.mapCandidate(it, idx + 1))
  }

  /** Фолбэк: последние N бутылок (когда векторный поиск недоступен). */
  private async fetchCandidates(userId: string) {
    const items = await this.prisma.cellarItem.findMany({
      where: { deletedAt: null, status: 'IN_CELLAR', cellar: { ownerId: userId } },
      include: CANDIDATE_INCLUDE,
      take: MAX_CANDIDATES,
      orderBy: { createdAt: 'desc' },
    })
    return items.map((it, idx) => this.mapCandidate(it, idx + 1))
  }

  private buildTurns(
    mode: ChatMode,
    query: string,
    history: { role: string; content: string }[],
    kb: KbRow[],
    candidates: Awaited<ReturnType<SommelierService['fetchCandidates']>>,
    isFollowUp = false,
  ): ChatTurn[] {
    const kbBlock = kb.length
      ? kb.map((c) => `• [${bookCitation(c.book_id)}]${c.heading ? ` (${c.heading})` : ''} ${c.text}`).join('\n')
      : '(нет релевантных выдержек из литературы)'

    const turns: ChatTurn[] = [{ role: 'system', content: PERSONA }]
    for (const h of history) {
      turns.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })
    }

    if (mode === 'pogreb') {
      const bottles = candidates.length
        ? candidates
            .map(
              (b) =>
                `#${b.index} ${[b.producer, b.name].filter(Boolean).join(' ')} — ` +
                `${b.wineType ?? '?'}, ${b.region ?? b.country ?? '?'}${b.vintageYear ? ', ' + b.vintageYear : ''}` +
                `${b.grapes.length ? ', ' + b.grapes.join('/') : ''} (в наличии: ${b.quantity})` +
                `${b.producerDescription ? '\n   описание: ' + b.producerDescription : ''}`,
            )
            .join('\n')
        : '(в погребе нет бутылок)'
      // Первый подбор — развёрнутая консультация. Продолжение/уточнение — коротко,
      // без повторения уже прочитанного (флаг приходит детерминированно из prepare).
      const textPart = isFollowUp
        ? `1) Текстовая часть: это ПРОДОЛЖЕНИЕ диалога — пользователь уточняет/меняет предыдущую подборку. ` +
          `НЕ повторяй прежнюю консультацию и общие рассуждения, которые уже были выше. Ответь КОРОТКО — ` +
          `1–2 фразы по существу изменения (что и почему поменял). Можно одной фразой сослаться на источник, ` +
          `если уместно. Не перечисляй конкретные бутылки по названию — они показаны карточками ниже.`
        : `1) Текстовая часть: развёрнутая консультация (несколько абзацев) — какой СТИЛЬ вина (сорта, регионы, ` +
          `характеристики) подходит под запрос и почему. ОБЯЗАТЕЛЬНО сошлись минимум на один-два источника из ` +
          `приведённой литературы в литературной форме (автор + точное название книги, без номеров страниц, без ` +
          `списка источников в конце; не выдумывай источники). НЕ перечисляй и НЕ называй конкретные бутылки из ` +
          `списка (ни по названию, ни по индексу) — они показываются пользователю карточками ПОД сообщением, это ` +
          `было бы дублированием. В конце можно одной фразой отослать к карточкам ниже.`
      turns.push({
        role: 'user',
        content:
          `Знания из литературы:\n${kbBlock}\n\n` +
          `Бутылки в погребе пользователя (выбирай подходящие ТОЛЬКО из этого списка, по индексу #):\n${bottles}\n\n` +
          `Вопрос пользователя: «${query}»\n\n` +
          `Сформируй ответ в ДВУХ частях:\n` +
          `${textPart}\n` +
          `2) Затем с НОВОЙ строки ровно одна служебная строка вида «${PICKS_MARKER}: 3, 7, 12» — индексы ` +
          `подходящих бутылок из списка, от самой уместной (обычно 3–7, не весь погреб). После неё ничего не пиши. ` +
          `Эту строку пользователь не увидит. Если ничего не подходит — «${PICKS_MARKER}:» без индексов.`,
      })
      return turns
    }

    // consult / chat — только текст; для consult явно просим опираться на литературу и ссылаться на источники.
    const instr =
      mode === 'consult'
        ? `Дай развёрнутую консультацию по винной литературе выше — несколько абзацев. ` +
          `В каждом абзаце ссылайся в литературной форме на конкретный источник (автор + точное название книги), ` +
          `БЕЗ номеров страниц и БЕЗ отдельного списка источников в конце. Конкретика важнее общих фраз.`
        : `Ответь живо и по существу. Если уместно — ссылайся на источники в литературной форме ` +
          `(автор + точное название книги) прямо в тексте, без номеров страниц.`
    turns.push({
      role: 'user',
      content: `Выдержки из литературы:\n${kbBlock}\n\nВопрос: «${query}»\n\n${instr}`,
    })
    return turns
  }

  /** Из полного текста /погреб-ответа выделяем консультацию и индексы → карточки. */
  private parsePicks(
    full: string,
    candidates: Awaited<ReturnType<SommelierService['fetchCandidates']>>,
  ): { answer: string; picks: ChatWinePick[] } {
    const idx = full.indexOf(PICKS_MARKER)
    const answer = (idx >= 0 ? full.slice(0, idx) : full).trim() || 'Не удалось сформировать ответ.'
    const picks: ChatWinePick[] = []
    if (idx >= 0) {
      const tail = full.slice(idx + PICKS_MARKER.length)
      const seen = new Set<number>()
      for (const n of (tail.match(/\d+/g) ?? []).map(Number)) {
        if (seen.has(n)) continue
        seen.add(n)
        const b = candidates.find((c) => c.index === n)
        if (b) picks.push({ cellarItemId: b.cellarItemId, title: [b.producer, b.name].filter(Boolean).join(' ') || 'Вино', reason: '' })
      }
    }
    return { answer, picks }
  }

  private async maybeSetTitle(sessionId: string, firstText: string) {
    const s = await this.prisma.chatSession.findUnique({ where: { id: sessionId }, select: { title: true } })
    if (s && !s.title) {
      const title = firstText.replace(/\s+/g, ' ').trim().slice(0, 60)
      await this.prisma.chatSession.update({ where: { id: sessionId }, data: { title } })
    }
  }

  private async findOwned(userId: string, id: string) {
    const s = await this.prisma.chatSession.findFirst({ where: { id, userId } })
    if (!s) throw new NotFoundException('Диалог не найден')
    return s
  }

  // ───────────────────────── LLM call (streaming) ─────────────────────────

  /**
   * Запрос к LLM в потоковом режиме (SSE). Накапливает полный ответ и возвращает его;
   * если передан onDelta — вызывает его на каждый кусок (для печати по мере генерации).
   */
  private async callLlm(resolved: ResolvedAi, turns: ChatTurn[], onDelta?: (text: string) => void): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
    try {
      let url: string
      let options: RequestInit
      if (!resolved.openAiCompatible) {
        // Gemini: склеиваем диалог в один промпт; SSE через alt=sse.
        const modelName = resolved.modelCode.startsWith('models/') ? resolved.modelCode : `models/${resolved.modelCode}`
        url = `${resolved.baseUrl}/${modelName}:streamGenerateContent?alt=sse&key=${resolved.apiKey}`
        const joined = turns.map((t) => `${t.role === 'system' ? '[Система]' : t.role === 'assistant' ? '[Сомелье]' : '[Пользователь]'} ${t.content}`).join('\n\n')
        // Gemini 2.5 по умолчанию «думает» перед выводом (15–25 c немой паузы) —
        // для живого стрима отключаем thinking, чтобы токены шли сразу.
        const generationConfig: Record<string, unknown> = { temperature: 0.4 }
        if (/2\.5/.test(resolved.modelCode)) generationConfig.thinkingConfig = { thinkingBudget: 0 }
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: joined }] }], generationConfig }),
          signal: controller.signal,
        }
      } else {
        url = `${resolved.baseUrl}/chat/completions`
        const body: Record<string, unknown> = { model: resolved.modelCode, messages: turns, temperature: 0.4, stream: true }
        // Gemini через OpenAI-совместимый эндпоинт по умолчанию «думает» (~5 c немой паузы до
        // первого токена) — для живого стрима отключаем thinking google-расширением (модели 2.5 и 3.x).
        if (/generativelanguage\.googleapis\.com/.test(resolved.baseUrl) && /gemini-(2\.5|3)/.test(resolved.modelCode)) {
          body.extra_body = { google: { thinking_config: { thinking_budget: 0 } } }
        }
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resolved.apiKey}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      }
      const res = await fetch(url, options)
      if (!res.ok || !res.body) {
        this.logger.error(`LLM API error ${res.status}`)
        return ''
      }

      const decoder = new TextDecoder()
      let buf = ''
      let full = ''
      // res.body — web ReadableStream (undici), асинхронно итерируемый.
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buf += decoder.decode(chunk, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          try {
            const j = JSON.parse(data)
            const piece: string = resolved.openAiCompatible
              ? j.choices?.[0]?.delta?.content ?? ''
              : j.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
            if (piece) {
              full += piece
              onDelta?.(piece)
            }
          } catch {
            // частичная/служебная строка — пропускаем
          }
        }
      }
      return full
    } catch (e) {
      this.logger.error(`LLM stream error: ${(e as Error).message}`)
      return ''
    } finally {
      clearTimeout(timeout)
    }
  }

  // ───────────────────────── mappers ─────────────────────────

  private toSessionView(s: { id: string; title: string | null; createdAt: Date; updatedAt: Date }): ChatSessionView {
    return { id: s.id, title: s.title ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }
  }

  private toMessageView(m: {
    id: string
    role: string
    mode: string | null
    content: string
    picks: unknown
    sources: unknown
    createdAt: Date
  }): ChatMessageView {
    return {
      id: m.id,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      mode: (m.mode as ChatMessageView['mode']) ?? null,
      content: m.content,
      picks: (Array.isArray(m.picks) ? m.picks : []) as ChatWinePick[],
      sources: (Array.isArray(m.sources) ? m.sources : []) as ChatSource[],
      createdAt: m.createdAt.toISOString(),
    }
  }
}

function clip(s: string | null): string | null {
  if (!s) return null
  return s.length > DESC_CLIP ? s.slice(0, DESC_CLIP) + '…' : s
}

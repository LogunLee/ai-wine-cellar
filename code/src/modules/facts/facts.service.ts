import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'

interface Chunk {
  id: string
  bookId: string
  text: string
}

export interface DailyFact {
  text: string
  source: string
}

const SYSTEM = `Ты — винный эксперт. На основе фрагмента из книги о вине сформулируй ОДИН короткий интересный факт (1–2 предложения) на русском языке.
Верни ТОЛЬКО сам факт — без вступлений, без кавычек, без markdown. Если во фрагменте нет содержательного факта о вине, выбери самое любопытное из текста.`

/** «Интересный факт дня»: детерминированно по дате выбираем фрагменты из корпуса книг
 *  и делаем короткую AI-выжимку (с фолбэком на чистый отрывок). Результат кэшируется на день. */
@Injectable()
export class FactsService {
  private readonly logger = new Logger(FactsService.name)
  private chunks: Chunk[] | null = null
  private cache: { date: string; facts: DailyFact[] } | null = null
  private inflight: Promise<DailyFact[]> | null = null

  async getDaily(count = 3): Promise<DailyFact[]> {
    const date = new Date().toISOString().slice(0, 10)
    if (this.cache && this.cache.date === date) return this.cache.facts
    if (this.inflight) return this.inflight
    this.inflight = this.build(date, count).finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async build(date: string, count: number): Promise<DailyFact[]> {
    const chunks = this.loadChunks()
    if (chunks.length === 0) return []
    const picked = pickDeterministic(chunks, count, date)
    const facts: DailyFact[] = []
    for (const c of picked) {
      facts.push({ text: await this.summarize(c.text), source: prettyBook(c.bookId) })
    }
    this.cache = { date, facts }
    return facts
  }

  private loadChunks(): Chunk[] {
    if (this.chunks) return this.chunks
    const p = path.join(process.cwd(), '..', 'knowledge', 'books', '_index', 'kb_chunks_fine.jsonl')
    const out: Chunk[] = []
    try {
      const raw = fs.readFileSync(p, 'utf8')
      for (const line of raw.split('\n')) {
        const s = line.trim()
        if (!s) continue
        try {
          const o = JSON.parse(s)
          if (o.page_kind === 'title') continue
          const cleaned = stripBreadcrumb(typeof o.text === 'string' ? o.text : '')
          if (cleaned.length >= 300) out.push({ id: o.id, bookId: o.book_id, text: cleaned })
        } catch {
          /* пропускаем битую строку */
        }
      }
    } catch (e) {
      this.logger.warn(`Корпус фактов не загружен: ${(e as Error).message}`)
    }
    this.chunks = out
    return out
  }

  private async summarize(text: string): Promise<string> {
    const key = process.env.MISTRAL_API_KEY
    const excerpt = text.replace(/\s+/g, ' ').trim().slice(0, 240)
    if (!key) return excerpt
    try {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          temperature: 0.5,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: text.slice(0, 2000) },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) return excerpt
      const data = await res.json()
      const out = (data.choices?.[0]?.message?.content ?? '').trim()
      return out || excerpt
    } catch {
      return excerpt
    }
  }
}

/** Убираем «хлебные крошки» в начале фрагмента (book › раздел › заголовок). */
function stripBreadcrumb(t: string): string {
  const nl = t.indexOf('\n')
  if (nl > 0 && t.slice(0, nl).includes('›')) return t.slice(nl + 1).trim()
  return t.trim()
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickDeterministic<T>(arr: T[], count: number, seedStr: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const rand = mulberry32(h >>> 0)
  const idx = new Set<number>()
  const n = Math.min(count, arr.length)
  let guard = 0
  while (idx.size < n && guard++ < count * 100) idx.add(Math.floor(rand() * arr.length))
  return [...idx].map((i) => arr[i])
}

function prettyBook(id: string): string {
  const map: Record<string, string> = {
    champagne: 'Шампань и другие игристые вина',
  }
  return map[id] ?? id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

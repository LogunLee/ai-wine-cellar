import { Injectable, Logger } from '@nestjs/common'
import { toSearchWords, toMatchWords, slugToTitle } from '../../shared/util/text.util'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html',
  'Accept-Language': 'en-US,en;q=0.9',
}

// Minimum fraction of query words that must appear in the slug.
// For 2-word queries this means both words must match (1/2=0.5 is rejected).
const MIN_SCORE = 0.6

export interface VivinoSearchResult {
  name: string
  url: string
  years: number[]
}

@Injectable()
export class VivinoService {
  private readonly logger = new Logger(VivinoService.name)

  // ── Auto-match (used when adding wine to cellar) ─────────────────────────

  async findWineUrl(producer: string, name: string, year?: number | null): Promise<string | null> {
    // Запрос только по производителю запрещён: он матчит ЛЮБОЕ вино этого
    // производителя со score 1.0 (так La Bruja de Rozas превращалась в El Hombre Bala)
    const queries = [
      [producer, name].filter(Boolean).join(' '),
      name,
    ].filter((q) => q.trim().length > 1)

    // Слова из названия вина обязаны присутствовать в слаге кандидата
    const anchorWords = this.anchor(name, producer)

    for (const query of queries) {
      const url = await this.searchBestMatch(query, year, anchorWords)
      if (url) return url
    }

    // SSR-поиск Vivino отдаёт не все вина — добиваем через поисковый индекс
    return this.serpFallback(producer, name, year, anchorWords)
  }

  /** Поиск карточки через s.jina.ai (site:vivino.com) — когда прямой поиск Vivino пуст. */
  private async serpFallback(
    producer: string,
    name: string,
    year: number | null | undefined,
    anchorWords: string[],
  ): Promise<string | null> {
    const jinaKey = process.env.JINA_API_KEY
    if (!jinaKey) return null

    try {
      const query = [producer, name].filter(Boolean).join(' ').trim()
      const res = await fetch(
        `https://s.jina.ai/?q=${encodeURIComponent(`site:vivino.com ${query}`)}`,
        {
          headers: {
            Authorization: `Bearer ${jinaKey}`,
            Accept: 'application/json',
            'X-Respond-With': 'no-content',
          },
          signal: AbortSignal.timeout(25_000),
        },
      )
      if (!res.ok) return null

      const data = await res.json()
      const queryWords = toMatchWords(query)

      const candidates = ((data.data ?? []) as any[])
        .map((d) => {
          const m = String(d?.url ?? '').match(/vivino\.com\/(?:[a-z]{2}(?:\/[a-z]{2})?\/)?([a-z0-9-]+)\/w\/(\d+)/i)
          if (!m) return null
          const slugWords = toSearchWords(m[1])
          const matched = queryWords.filter((w) => slugWords.includes(w)).length
          const anchorHit = anchorWords.length === 0 || anchorWords.some((w) => slugWords.includes(w))
          return { slug: m[1], id: m[2], score: matched / queryWords.length, anchorHit }
        })
        .filter((c): c is NonNullable<typeof c> => !!c && c.anchorHit && c.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)

      if (!candidates.length) return null

      const best = candidates[0]
      const url = `https://www.vivino.com/en/${best.slug}/w/${best.id}${year ? `?year=${year}` : ''}`
      this.logger.log(`Vivino (SERP): "${query}" year=${year ?? '–'} → ${url} (score=${best.score.toFixed(2)})`)
      return url
    } catch (err) {
      this.logger.warn(`Vivino SERP fallback failed: ${err}`)
      return null
    }
  }

  /** Слова названия вина (без слов производителя и стоп-слов) — якорь против ложных матчей. */
  private anchor(name: string, producer: string): string[] {
    const producerWords = new Set(toMatchWords(producer))
    const nameWords = toMatchWords(name).filter((w) => !producerWords.has(w))
    return nameWords.length > 0 ? nameWords : toMatchWords(name)
  }

  // ── Manual search (user-driven) ──────────────────────────────────────────

  async searchResults(query: string): Promise<VivinoSearchResult[]> {
    const html = await this.fetchPage(query)
    if (!html) return []

    // Group entries by path (= one wine), collect years
    const wines = new Map<string, { name: string; years: Set<number> }>()

    for (const m of html.matchAll(/href="(\/en\/([^"?]+\/w\/\d+))(?:\?[^"]*)?"[^>]*>/g)) {
      const path = m[1]
      const slug = m[2]
      const yearMatch = m[0].match(/[?&]year=(\d{4})/)
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null

      if (!wines.has(path)) {
        const humanName = slugToTitle(slug.replace(/\/w\/\d+$/, ''))
        wines.set(path, { name: humanName, years: new Set() })
      }
      if (year) wines.get(path)!.years.add(year)
    }

    return Array.from(wines.entries()).map(([path, { name, years }]) => ({
      name,
      url: `https://www.vivino.com${path}`,
      years: [...years].sort((a, b) => b - a),
    }))
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async searchBestMatch(query: string, year?: number | null, anchorWords: string[] = []): Promise<string | null> {
    try {
      const html = await this.fetchPage(query)
      if (!html) return null

      const entries: { slug: string; path: string; year: number | null }[] = []
      for (const m of html.matchAll(/href="(\/en\/([^"?]+\/w\/\d+))(?:\?[^"]*)?"[^>]*>/g)) {
        const path = m[1]
        const slug = m[2]
        const yearMatch = m[0].match(/[?&]year=(\d{4})/)
        const entryYear = yearMatch ? parseInt(yearMatch[1], 10) : null
        if (!entries.some((e) => e.path === path && e.year === entryYear)) {
          entries.push({ slug, path, year: entryYear })
        }
      }
      if (!entries.length) return null

      const queryWords = toMatchWords(query)
      const scored = entries.map((e) => {
        const slugWords = toSearchWords(e.slug)
        const matched = queryWords.filter((w) => slugWords.includes(w)).length
        const anchorHit = anchorWords.length === 0 || anchorWords.some((w) => slugWords.includes(w))
        return { ...e, score: matched / queryWords.length, anchorHit }
      })

      const viable = scored.filter((e) => e.score >= MIN_SCORE && e.anchorHit)
      if (!viable.length) {
        this.logger.debug(`Vivino: best ${Math.max(...scored.map((e) => e.score)).toFixed(2)} < ${MIN_SCORE} for "${query}" — skipped`)
        return null
      }

      viable.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (year) {
          if (a.year === year && b.year !== year) return -1
          if (b.year === year && a.year !== year) return 1
        }
        return 0
      })

      const best = viable[0]
      const vintageEntry = year ? viable.find((e) => e.score === best.score && e.year === year) : null
      const finalPath = vintageEntry ? `${vintageEntry.path}?year=${year}` : best.path
      const finalUrl = `https://www.vivino.com${finalPath}`
      this.logger.log(`Vivino: "${query}" year=${year ?? '–'} → ${finalUrl} (score=${best.score.toFixed(2)})`)
      return finalUrl
    } catch (err) {
      this.logger.warn(`Vivino search failed for "${query}": ${err}`)
      return null
    }
  }

  private async fetchPage(query: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://www.vivino.com/search/wines?q=${encodeURIComponent(query)}&language=en`,
        { headers: HEADERS, signal: AbortSignal.timeout(10_000) },
      )
      return response.ok ? response.text() : null
    } catch {
      return null
    }
  }
}

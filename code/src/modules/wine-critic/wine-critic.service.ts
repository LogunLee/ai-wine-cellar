import { Injectable, Logger } from '@nestjs/common'
import { toMatchWords } from '../../shared/util/text.util'

export interface CriticScores {
  [critic: string]: number
}

export interface WineSearcherResult {
  url: string
  scores: CriticScores
}

interface SerpItem {
  url: string
  title: string
  description: string
}

const MIN_SCORE = 0.4

/**
 * Wine-Searcher закрыт Cloudflare (прямой fetch и Jina Reader → challenge),
 * поэтому работаем через поисковый индекс (s.jina.ai, site:wine-searcher.com):
 * оттуда берём каноническую ссылку на карточку и агрегированную оценку
 * из сниппета («Score: 90-95 pts»). Ссылка для пользователя открывается
 * нормально — Cloudflare пропускает живые браузеры.
 */
@Injectable()
export class WineCriticService {
  private readonly logger = new Logger(WineCriticService.name)

  async findWine(
    producer: string,
    name: string,
    year?: number | null,
  ): Promise<WineSearcherResult | null> {
    const fullQuery = [producer, name].filter(Boolean).join(' ').trim()
    if (!fullQuery) return null

    const items = await this.serpSearch(`${fullQuery} ${year ?? ''}`.trim())
    if (!items.length) return null

    const queryWords = toMatchWords(fullQuery)
    const scored = items
      .map((item) => {
        const titleWords = toMatchWords(item.title)
        const matched = queryWords.filter((w) => titleWords.includes(w)).length
        return { ...item, score: matched / queryWords.length }
      })
      .filter((i) => i.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)

    if (!scored.length) {
      this.logger.debug(`Wine-Searcher SERP: no match ≥${MIN_SCORE} for "${fullQuery}"`)
      return null
    }

    const top = scored[0]
    // Среди равных по score предпочитаем карточку нужного винтажа
    const sameWine = scored.filter((i) => i.score === top.score)
    const vintageHit = year
      ? sameWine.find((i) => i.url.includes(`/${year}`) || i.title.startsWith(String(year)))
      : null
    const best = vintageHit ?? top

    // Оценка из сниппетов: «Score: 92 pts» или «Score: 90-95 pts»
    const scores: CriticScores = {}
    for (const candidate of [best, ...sameWine]) {
      const m = candidate.description.match(/Score:?\s*(\d{2})(?:\s*-\s*(\d{2}))?\s*pts/i)
      if (m) {
        const low = parseInt(m[1], 10)
        const high = m[2] ? parseInt(m[2], 10) : low
        const value = Math.round((low + high) / 2)
        if (value >= 50 && value <= 100) {
          scores['Wine-Searcher'] = value
          break
        }
      }
    }

    this.logger.log(`Wine-Searcher: "${fullQuery}" year=${year ?? '–'} → ${best.url} (score=${best.score.toFixed(2)})`)
    return { url: best.url, scores }
  }

  /** Ручной поиск для привязки ссылки (Android sheet «Привязать к Wine-Searcher»). */
  async searchResults(query: string): Promise<{ name: string; url: string }[]> {
    const items = await this.serpSearch(query)
    const seen = new Set<string>()
    const results: { name: string; url: string }[] = []

    for (const item of items) {
      // Дедуп по базовому пути без винтажа
      const baseKey = item.url.replace(/\/(19|20)\d{2}$/, '')
      if (seen.has(baseKey) && !/\/(19|20)\d{2}$/.test(item.url)) continue
      if (seen.has(item.url)) continue
      seen.add(item.url)
      seen.add(baseKey)

      const name = item.title.replace(/\s*[-|–]\s*Wine-?Searcher.*$/i, '').trim()
      results.push({ name: name || item.title, url: item.url })
    }

    return results.slice(0, 25)
  }

  /**
   * Best-effort: оценки со страницы по прямой ссылке (после ручной привязки).
   * Из-за Cloudflare обычно недоступно — тогда просто возвращаем null.
   */
  async extractScoresFromUrl(url: string): Promise<CriticScores | null> {
    try {
      const serpQuery = decodeURIComponent(url)
        .replace(/^https?:\/\/(www\.)?wine-searcher\.com\/find\//, '')
        .replace(/[+\/]/g, ' ')
        .trim()
      if (!serpQuery) return null

      const items = await this.serpSearch(serpQuery)
      for (const item of items) {
        const m = item.description.match(/Score:?\s*(\d{2})(?:\s*-\s*(\d{2}))?\s*pts/i)
        if (m) {
          const low = parseInt(m[1], 10)
          const high = m[2] ? parseInt(m[2], 10) : low
          const value = Math.round((low + high) / 2)
          if (value >= 50 && value <= 100) return { 'Wine-Searcher': value }
        }
      }
      return null
    } catch {
      return null
    }
  }

  /** Поиск по индексу: только wine-searcher.com/find/, без скачивания страниц. */
  private async serpSearch(query: string): Promise<SerpItem[]> {
    const jinaKey = process.env.JINA_API_KEY
    if (!jinaKey) {
      this.logger.warn('JINA_API_KEY is not configured — Wine-Searcher lookup unavailable')
      return []
    }

    try {
      const url = `https://s.jina.ai/?q=${encodeURIComponent(`site:wine-searcher.com ${query}`)}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${jinaKey}`,
          Accept: 'application/json',
          'X-Respond-With': 'no-content',
        },
        signal: AbortSignal.timeout(25_000),
      })
      if (!res.ok) {
        this.logger.warn(`SERP returned ${res.status} for "${query}"`)
        return []
      }

      const data = await res.json()
      return ((data.data ?? []) as any[])
        .filter((d) => typeof d?.url === 'string' && d.url.includes('wine-searcher.com/find/'))
        .map((d) => ({
          // срезаем трекинговые параметры (srsltid и т.п.)
          url: d.url.split('?')[0],
          title: String(d.title ?? ''),
          description: String(d.description ?? ''),
        }))
    } catch (err) {
      this.logger.warn(`SERP search failed for "${query}": ${err}`)
      return []
    }
  }
}

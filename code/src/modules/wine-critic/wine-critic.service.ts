import { Injectable, Logger } from '@nestjs/common'

export interface CriticScores {
  [critic: string]: number
}

export interface WineSearcherResult {
  url: string
  scores: CriticScores
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

const MIN_SCORE = 0.4

@Injectable()
export class WineCriticService {
  private readonly logger = new Logger(WineCriticService.name)

  async findWine(
    producer: string,
    name: string,
    year?: number | null,
  ): Promise<WineSearcherResult | null> {
    const queries = [[producer, name].filter(Boolean).join(' '), name]
    for (const q of queries) {
      const result = await this.searchAndExtract(q, year)
      if (result) return result
    }
    return null
  }

  async searchResults(query: string): Promise<{ name: string; url: string }[]> {
    try {
      const html = await this.fetchPage(`https://www.wine-searcher.com/find/${encodeURIComponent(query)}`)
      if (!html) return []

      const seen = new Set<string>()
      const results: { name: string; url: string }[] = []

      for (const m of html.matchAll(/href="(\/wine-details\/\d+\/([^"?\/]+)[^"]*)"/g)) {
        const path = m[1].split('?')[0]
        if (seen.has(path)) continue
        seen.add(path)
        const slug = m[2]
        const url  = `https://www.wine-searcher.com${path}`
        const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        results.push({ name, url })
      }

      return results.slice(0, 25)
    } catch {
      return []
    }
  }

  async extractScoresFromUrl(url: string): Promise<CriticScores | null> {
    try {
      const html = await this.fetchPage(url)
      if (!html) return null
      const scores = this.extractScores(html)
      return Object.keys(scores).length > 0 ? scores : null
    } catch {
      return null
    }
  }

  private async searchAndExtract(
    query: string,
    year?: number | null,
  ): Promise<WineSearcherResult | null> {
    try {
      const yearSuffix = year ? `/${year}` : ''
      const searchUrl = `https://www.wine-searcher.com/find/${encodeURIComponent(query)}${yearSuffix}`

      const html = await this.fetchPage(searchUrl)
      if (!html) return null

      // Collect wine-detail links
      const detailLinks: { path: string; slug: string }[] = []
      for (const m of html.matchAll(/href="(\/wine-details\/\d+\/([^"?\/]+)[^"]*)"/g)) {
        const path = m[1].split('?')[0]
        const slug = m[2]
        if (!detailLinks.some((l) => l.path === path)) {
          detailLinks.push({ path, slug })
        }
      }
      if (!detailLinks.length) return null

      // Score by word overlap
      const queryWords = this.toWords(query)
      const scored = detailLinks
        .map((l) => {
          const slugWords = this.toWords(l.slug)
          const matched = queryWords.filter((w) => slugWords.includes(w)).length
          return { ...l, score: matched / queryWords.length }
        })
        .filter((l) => l.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)

      if (!scored.length) return null
      const best = scored[0]

      const detailUrl = `https://www.wine-searcher.com${best.path}`

      // If search already landed on detail page avoid second fetch
      const isDetailPage = html.includes('wine-details') && html.includes('ld+json')
      const detailHtml = isDetailPage ? html : await this.fetchPage(detailUrl)
      if (!detailHtml) return { url: detailUrl, scores: {} }

      const scores = this.extractScores(detailHtml)
      return { url: detailUrl, scores }
    } catch (err) {
      this.logger.warn(`Wine-Searcher failed for "${query}": ${err}`)
      return null
    }
  }

  private extractScores(html: string): CriticScores {
    const scores: CriticScores = {}

    for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try {
        const data = JSON.parse(m[1])
        this.walkJsonLd(Array.isArray(data) ? data : [data], scores)
      } catch (_) {}
    }

    return scores
  }

  private walkJsonLd(nodes: any[], scores: CriticScores): void {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue

      // review[] on a Product
      if (Array.isArray(node.review)) {
        for (const review of node.review) {
          const authorRaw = review?.author?.name ?? review?.author
          const ratingRaw = review?.reviewRating?.ratingValue
          if (!authorRaw || !ratingRaw) continue
          const score = parseInt(String(ratingRaw), 10)
          if (!isNaN(score) && score >= 50 && score <= 100) {
            scores[String(authorRaw)] = score
          }
        }
      }

      // @graph recursion
      if (Array.isArray(node['@graph'])) {
        this.walkJsonLd(node['@graph'], scores)
      }
    }
  }

  private async fetchPage(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      })
      return res.ok ? res.text() : null
    } catch {
      return null
    }
  }

  private toWords(text: string): string[] {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 1)
  }
}

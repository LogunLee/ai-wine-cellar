import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AiRouterService } from '../ai-settings/ai-router.service'

export interface WineResearchInput {
  wineName: string
  vintage?: string
  producerHint?: string
  countryHint?: string
}

export interface WineResearchResult {
  wine: {
    fullName: string | null
    producer: string | null
    country: string | null
    region: string | null
    appellation: string | null
    vintage: string | null
    wineType: string | null
    grapes: string[] | null
    alcohol: string | null
    sugar: string | null
    acidity: string | null
    aging: string | null
    style: string | null
    tastingProfile: string | null
    storagePotential: string | null
    servingTemperature: string | null
    foodPairing: string[] | null
  }
  confidence: 'high' | 'medium' | 'low'
  missingFields: string[]
  sources: SourceInfo[]
  notes: string[]
}

export interface SourceInfo {
  title?: string
  url: string
  sourceType:
    | 'producer'
    | 'producer_pdf'
    | 'importer'
    | 'official_region'
    | 'wine_database'
    | 'shop'
    | 'blog'
    | 'unknown'
  trustLevel: 'high' | 'medium' | 'low'
  used: boolean
}

interface JinaSearchResult {
  title: string
  url: string
  description?: string
}

const MAX_SEARCH_QUERIES = 5
const MAX_URLS_TO_READ = 5
const HTTP_TIMEOUT_MS = 15000
const LLM_TIMEOUT_MS = 30000
const TOTAL_TIMEOUT_MS = 120000
const MAX_CONTEXT_CHARS = 80000

const SOCIAL_DOMAINS = new Set([
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'pinterest.com',
  'youtube.com',
  'linkedin.com',
])

const AD_DOMAINS = new Set([
  'doubleclick.net',
  'googlesyndication.com',
  'adservice.google.com',
])

@Injectable()
export class WineResearchService {
  private readonly logger = new Logger(WineResearchService.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async researchWine(userId: string, input: WineResearchInput): Promise<WineResearchResult> {
    const startTime = Date.now()
    const notes: string[] = []

    try {
      const queries = this.generateSearchQueries(input)
      this.logger.log(`Generated ${queries.length} search queries`)

      const allUrls = await this.searchJina(queries, startTime, notes)
      if (allUrls.length === 0) {
        notes.push('Jina Search не вернула результатов')
        return this.emptyResult(notes)
      }

      const uniqueUrls = this.deduplicateUrls(allUrls)
      const classified = this.classifySources(uniqueUrls, input)
      const ranked = this.rankSources(classified)
      const topUrls = ranked.slice(0, MAX_URLS_TO_READ)

      this.logger.log(`Selected ${topUrls.length} URLs for reading`)

      const sourceTexts = await this.readSources(topUrls, startTime)
      if (sourceTexts.length === 0) {
        notes.push('Не удалось прочитать ни одного источника')
        return this.emptyResult(notes)
      }

      const context = this.buildContext(sourceTexts)
      const prompt = this.buildPrompt(input, context)

      const llmResult = await this.callLLM(userId, prompt)
      if (!llmResult) {
        notes.push('LLM не вернула валидный ответ')
        return this.emptyResult(notes)
      }

      const parsed = this.parseLLMResponse(llmResult)
      if (!parsed) {
        notes.push('Не удалось распарсить ответ LLM')
        return this.emptyResult(notes)
      }

      const missingFields = this.findMissingFields(parsed.wine)
      const confidence = this.calculateConfidence(parsed.wine, missingFields, sourceTexts.length)

      const sources = this.buildSourcesOutput(topUrls, sourceTexts)

      return {
        ...parsed,
        confidence,
        missingFields,
        sources,
        notes,
      }
    } catch (error) {
      this.logger.error(`Research failed: ${error.message}`)
      notes.push(`Ошибка: ${error.message}`)
      return this.emptyResult(notes)
    }
  }

  generateSearchQueries(input: WineResearchInput): string[] {
    const queries: string[] = []
    const name = input.wineName.trim()
    const vintage = input.vintage?.trim()
    const producerHint = input.producerHint?.trim()

    if (!name) return queries

    if (vintage) {
      queries.push(`${name} ${vintage} official tech sheet`)
      queries.push(`${name} ${vintage} fiche technique`)
      queries.push(`${name} ${vintage} pdf`)
      queries.push(`${name} ${vintage} producer`)
      queries.push(`${name} ${vintage} wine-searcher`)
    } else {
      queries.push(`${name} official tech sheet`)
      queries.push(`${name} fiche technique`)
      queries.push(`${name} pdf`)
      queries.push(`${name} producer`)
      queries.push(`${name} wine-searcher`)
    }

    if (producerHint) {
      const domain = this.extractDomain(producerHint)
      if (domain) {
        const siteQuery = vintage
          ? `site:${domain} ${name} ${vintage}`
          : `site:${domain} ${name}`
        queries.unshift(siteQuery)
      }
    }

    return queries.slice(0, MAX_SEARCH_QUERIES)
  }

  private extractDomain(urlOrName: string): string | null {
    try {
      if (urlOrName.startsWith('http')) {
        return new URL(urlOrName).hostname.replace(/^www\./, '')
      }
      return null
    } catch {
      return null
    }
  }

  private async searchJina(
    queries: string[],
    startTime: number,
    notes?: string[],
  ): Promise<JinaSearchResult[]> {
    const allResults: JinaSearchResult[] = []
    const apiKey = this.configService.get<string>('JINA_API_KEY')

    if (!apiKey) {
      notes?.push('JINA_API_KEY не настроен на сервере — поиск источников недоступен')
      this.logger.error('JINA_API_KEY is not configured')
      return []
    }

    const failStatuses = new Set<number>()

    for (const query of queries) {
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        this.logger.warn('Total timeout reached during search')
        break
      }

      try {
        const url = `https://s.jina.ai/?q=${encodeURIComponent(query)}`
        const headers: Record<string, string> = {
          Accept: 'application/json',
        }
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          failStatuses.add(response.status)
          this.logger.warn(`Jina Search returned ${response.status} for query: ${query}`)
          continue
        }

        const data = await response.json()
        if (data.data && Array.isArray(data.data)) {
          allResults.push(...data.data)
        }
      } catch (error) {
        this.logger.warn(`Jina Search failed for query "${query}": ${error.message}`)
      }
    }

    if (allResults.length === 0 && failStatuses.size > 0) {
      const statuses = [...failStatuses].join(', ')
      notes?.push(
        failStatuses.has(401) || failStatuses.has(402)
          ? `Jina Search отклонила ключ (HTTP ${statuses}) — проверьте JINA_API_KEY и его баланс`
          : `Jina Search отвечала ошибками (HTTP ${statuses})`,
      )
    }

    return allResults
  }

  private deduplicateUrls(results: JinaSearchResult[]): JinaSearchResult[] {
    const seen = new Set<string>()
    return results.filter((r) => {
      const normalized = r.url.toLowerCase().replace(/\/$/, '')
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
  }

  private classifySources(
    urls: JinaSearchResult[],
    input: WineResearchInput,
  ): Array<JinaSearchResult & { sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }> {
    const producerHint = input.producerHint?.toLowerCase() || ''

    return urls.map((r) => {
      const urlLower = r.url.toLowerCase()
      const titleLower = (r.title || '').toLowerCase()

      if (this.isSocialOrAdUrl(urlLower)) {
        return { ...r, sourceType: 'unknown' as const, trustLevel: 'low' as const }
      }

      if (urlLower.endsWith('.pdf') || titleLower.includes('tech sheet') || titleLower.includes('fiche technique')) {
        if (producerHint && this.urlMatchesProducer(urlLower, producerHint)) {
          return { ...r, sourceType: 'producer_pdf' as const, trustLevel: 'high' as const }
        }
        return { ...r, sourceType: 'producer_pdf' as const, trustLevel: 'medium' as const }
      }

      if (producerHint && this.urlMatchesProducer(urlLower, producerHint)) {
        return { ...r, sourceType: 'producer' as const, trustLevel: 'high' as const }
      }

      if (urlLower.includes('wine-searcher.com') || urlLower.includes('vivino.com') || urlLower.includes('cellartracker.com')) {
        return { ...r, sourceType: 'wine_database' as const, trustLevel: 'medium' as const }
      }

      if (this.isOfficialRegionUrl(urlLower)) {
        return { ...r, sourceType: 'official_region' as const, trustLevel: 'high' as const }
      }

      if (this.isImporterUrl(urlLower, titleLower)) {
        return { ...r, sourceType: 'importer' as const, trustLevel: 'medium' as const }
      }

      if (this.isShopUrl(urlLower)) {
        return { ...r, sourceType: 'shop' as const, trustLevel: 'low' as const }
      }

      if (this.isBlogUrl(urlLower)) {
        return { ...r, sourceType: 'blog' as const, trustLevel: 'low' as const }
      }

      return { ...r, sourceType: 'unknown' as const, trustLevel: 'low' as const }
    })
  }

  private isSocialOrAdUrl(url: string): boolean {
    return [...SOCIAL_DOMAINS, ...AD_DOMAINS].some((d) => url.includes(d))
  }

  private urlMatchesProducer(url: string, producerHint: string): boolean {
    try {
      const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
      return producerHint.includes(domain) || domain.includes(producerHint)
    } catch {
      return false
    }
  }

  private isOfficialRegionUrl(url: string): boolean {
    const officialPatterns = [
      '.gouv.fr',
      '.gov.it',
      '.gov.es',
      'consortium',
      'consorzio',
      'appellation',
      'aoc',
      'docg',
      'doc.',
    ]
    return officialPatterns.some((p) => url.includes(p))
  }

  private isImporterUrl(url: string, title: string): boolean {
    const importerPatterns = ['importer', 'distributor', 'distributeur', 'importateur']
    return importerPatterns.some((p) => url.includes(p) || title.includes(p))
  }

  private isShopUrl(url: string): boolean {
    const shopPatterns = ['shop', 'store', 'boutique', 'buy', 'acheter', 'cart', 'checkout', 'amazon', 'ebay']
    return shopPatterns.some((p) => url.includes(p))
  }

  private isBlogUrl(url: string): boolean {
    const blogPatterns = ['blog', 'medium.com', 'wordpress', 'blogger', 'article', 'review']
    return blogPatterns.some((p) => url.includes(p))
  }

  private rankSources(
    sources: Array<JinaSearchResult & { sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }>,
  ): Array<JinaSearchResult & { sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }> {
    const priorityOrder: SourceInfo['sourceType'][] = [
      'producer',
      'producer_pdf',
      'importer',
      'official_region',
      'wine_database',
      'shop',
      'blog',
      'unknown',
    ]

    return [...sources].sort((a, b) => {
      const aPriority = priorityOrder.indexOf(a.sourceType)
      const bPriority = priorityOrder.indexOf(b.sourceType)
      if (aPriority !== bPriority) return aPriority - bPriority
      const trustOrder = { high: 0, medium: 1, low: 2 }
      return trustOrder[a.trustLevel] - trustOrder[b.trustLevel]
    })
  }

  private async readSources(
    sources: Array<JinaSearchResult & { sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }>,
    startTime: number,
  ): Promise<Array<{ url: string; title: string; text: string; sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }>> {
    const results: Array<{ url: string; title: string; text: string; sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }> = []
    const apiKey = this.configService.get<string>('JINA_API_KEY')
    const readUrls = new Set<string>()

    for (const source of sources) {
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        this.logger.warn('Total timeout reached during source reading')
        break
      }

      if (readUrls.has(source.url)) continue
      readUrls.add(source.url)

      try {
        const url = `https://r.jina.ai/${source.url}`
        const headers: Record<string, string> = {
          Accept: 'text/plain',
        }
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          this.logger.warn(`Jina Reader returned ${response.status} for ${source.url}`)
          continue
        }

        const text = await response.text()
        if (text.trim().length < 50) {
          this.logger.warn(`Jina Reader returned empty content for ${source.url}`)
          continue
        }

        results.push({
          url: source.url,
          title: source.title || '',
          text,
          sourceType: source.sourceType,
          trustLevel: source.trustLevel,
        })
      } catch (error) {
        this.logger.warn(`Jina Reader failed for ${source.url}: ${error.message}`)
      }
    }

    return results
  }

  private buildContext(
    sourceTexts: Array<{ url: string; title: string; text: string; sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }>,
  ): string {
    let totalChars = 0
    const parts: string[] = []

    for (const source of sourceTexts) {
      const header = `\n\n=== ИСТОЧНИК: ${source.title || source.url} (${source.sourceType}, ${source.trustLevel}) ===\nURL: ${source.url}\n\n`
      const availableChars = MAX_CONTEXT_CHARS - totalChars - header.length

      if (availableChars <= 0) break

      const truncatedText = source.text.length > availableChars
        ? source.text.substring(0, availableChars) + '\n...[обрезано]'
        : source.text

      parts.push(header + truncatedText)
      totalChars += header.length + truncatedText.length
    }

    return parts.join('')
  }

  private buildPrompt(input: WineResearchInput, context: string): string {
    const vintageInfo = input.vintage ? `\nВинтаж: ${input.vintage}` : ''
    const producerInfo = input.producerHint ? `\nПроизводитель (подсказка): ${input.producerHint}` : ''
    const countryInfo = input.countryHint ? `\nСтрана (подсказка): ${input.countryHint}` : ''

    return `Ты анализируешь информацию о вине только по предоставленным источникам.
Не используй знания из памяти.
Не придумывай отсутствующие данные.
Если факт не найден в источниках, верни null.
При конфликте источников используй приоритет:
производитель > tech sheet PDF > импортёр > официальный региональный орган > wine database > магазин > блог.
Верни только валидный JSON по заданной схеме.
Для каждого важного факта учитывай источник.
Если по винтажу данных нет, не переноси автоматически данные с другого винтажа.

Вино для поиска:
Название: ${input.wineName}${vintageInfo}${producerInfo}${countryInfo}

Источники:${context}

Верни JSON строго в этом формате:
{
  "wine": {
    "fullName": "полное название вина или null",
    "producer": "название производителя или null",
    "country": "страна или null",
    "region": "регион или null",
    "appellation": "апелласьон или null",
    "vintage": "винтаж или null",
    "wineType": "RED|WHITE|ROSE|SPARKLING|SWEET|FORTIFIED|OTHER или null",
    "grapes": ["сорт1", "сорт2"] или null,
    "alcohol": "крепость, например 13.5% или null",
    "sugar": "содержание сахара или null",
    "acidity": "кислотность или null",
    "aging": "выдержка или null",
    "style": "стиль вина или null",
    "tastingProfile": "дегустационный профиль или null",
    "storagePotential": "потенциал хранения или null",
    "servingTemperature": "температура подачи или null",
    "foodPairing": ["еда1", "еда2"] или null
  }
}`
  }

  private async callLLM(userId: string, prompt: string): Promise<string | null> {
    const resolved = await this.aiRouter.resolveForUser(userId, 'wine_research')

    try {
      const systemPrompt = resolved.promptOverride || 'Ты эксперт по винам. Отвечай только валидным JSON.'

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

      let url: string
      let options: RequestInit

      if (!resolved.openAiCompatible) {
        const modelName = resolved.modelCode.startsWith('models/') ? resolved.modelCode : `models/${resolved.modelCode}`
        url = `${resolved.baseUrl}/${modelName}:generateContent?key=${resolved.apiKey}`
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
              },
            ],
            generationConfig: { temperature: 0.1 },
          }),
          signal: controller.signal,
        }
      } else {
        url = `${resolved.baseUrl}/chat/completions`
        options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resolved.apiKey}`,
          },
          body: JSON.stringify({
            model: resolved.modelCode,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.1,
          }),
          signal: controller.signal,
        }
      }

      const response = await fetch(url, options)
      clearTimeout(timeoutId)

      if (!response.ok) {
        this.logger.error(`LLM API error: ${response.status}`)
        return null
      }

      const data = await response.json()

      const content = resolved.openAiCompatible
        ? data.choices?.[0]?.message?.content || null
        : data.candidates?.[0]?.content?.parts?.[0]?.text || null

      if (content && resolved.source === 'trial') {
        await this.aiRouter.commitTrialUse(userId, 'wine_research')
      }
      return content
    } catch (error) {
      this.logger.error(`LLM call failed: ${error.message}`)
      return null
    }
  }

  private parseLLMResponse(content: string): WineResearchResult | null {
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(cleaned)

      if (!parsed.wine || typeof parsed.wine !== 'object') {
        return null
      }

      const wine = parsed.wine
      return {
        wine: {
          fullName: wine.fullName ?? null,
          producer: wine.producer ?? null,
          country: wine.country ?? null,
          region: wine.region ?? null,
          appellation: wine.appellation ?? null,
          vintage: wine.vintage ?? null,
          wineType: wine.wineType ?? null,
          grapes: Array.isArray(wine.grapes) ? wine.grapes : null,
          alcohol: wine.alcohol ?? null,
          sugar: wine.sugar ?? null,
          acidity: wine.acidity ?? null,
          aging: wine.aging ?? null,
          style: wine.style ?? null,
          tastingProfile: wine.tastingProfile ?? null,
          storagePotential: wine.storagePotential ?? null,
          servingTemperature: wine.servingTemperature ?? null,
          foodPairing: Array.isArray(wine.foodPairing) ? wine.foodPairing : null,
        },
        confidence: 'medium',
        missingFields: [],
        sources: [],
        notes: [],
      }
    } catch {
      return null
    }
  }

  private findMissingFields(wine: WineResearchResult['wine']): string[] {
    const fields = [
      'fullName',
      'producer',
      'country',
      'region',
      'appellation',
      'vintage',
      'wineType',
      'grapes',
      'alcohol',
      'sugar',
      'acidity',
      'aging',
      'style',
      'tastingProfile',
      'storagePotential',
      'servingTemperature',
      'foodPairing',
    ]

    return fields.filter((f) => wine[f] === null)
  }

  private calculateConfidence(
    wine: WineResearchResult['wine'],
    missingFields: string[],
    sourcesCount: number,
  ): 'high' | 'medium' | 'low' {
    const criticalFields = ['fullName', 'producer', 'country', 'region', 'wineType']
    const criticalMissing = missingFields.filter((f) => criticalFields.includes(f))

    if (criticalMissing.length === 0 && sourcesCount >= 3) return 'high'
    if (criticalMissing.length <= 2 && sourcesCount >= 1) return 'medium'
    return 'low'
  }

  private buildSourcesOutput(
    topUrls: Array<JinaSearchResult & { sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }>,
    sourceTexts: Array<{ url: string; title: string; text: string; sourceType: SourceInfo['sourceType']; trustLevel: SourceInfo['trustLevel'] }>,
  ): SourceInfo[] {
    const readUrlSet = new Set(sourceTexts.map((s) => s.url))

    return topUrls.map((s) => ({
      title: s.title || undefined,
      url: s.url,
      sourceType: s.sourceType,
      trustLevel: s.trustLevel,
      used: readUrlSet.has(s.url),
    }))
  }

  private emptyResult(notes: string[]): WineResearchResult {
    return {
      wine: {
        fullName: null,
        producer: null,
        country: null,
        region: null,
        appellation: null,
        vintage: null,
        wineType: null,
        grapes: null,
        alcohol: null,
        sugar: null,
        acidity: null,
        aging: null,
        style: null,
        tastingProfile: null,
        storagePotential: null,
        servingTemperature: null,
        foodPairing: null,
      },
      confidence: 'low',
      missingFields: [
        'fullName',
        'producer',
        'country',
        'region',
        'appellation',
        'vintage',
        'wineType',
        'grapes',
        'alcohol',
        'sugar',
        'acidity',
        'aging',
        'style',
        'tastingProfile',
        'storagePotential',
        'servingTemperature',
        'foodPairing',
      ],
      sources: [],
      notes,
    }
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../shared/database/prisma.service'
import { AiModelsService } from '../../ai-models/ai-models.service'

export interface NormalizedWineInfo {
  producer: string | null
  wineName: string | null
  fullName: string | null
  vintage: string | null
  country: string | null
  region: string | null
  originZone: string | null
  wineType: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified' | 'unknown'
  volumeMl: number | null
  confidence: 'high' | 'medium' | 'low'
}

@Injectable()
export class NormalizerService {
  private readonly logger = new Logger(NormalizerService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiModelsService: AiModelsService,
  ) {}

  async normalizeAll(storeId?: string): Promise<{ created: number; updated: number }> {
    const where: any = {
      discountOffer: null,
    }
    if (storeId) {
      where.storeId = storeId
    }

    const rawOffers = await this.prisma.rawOffer.findMany({
      where,
      take: 100,
    })

    let created = 0
    let updated = 0

    for (const raw of rawOffers) {
      try {
        const normalized = await this.normalizeRawOffer(raw)
        if (normalized) {
          created++
        }
      } catch (error) {
        this.logger.error(`Failed to normalize raw offer ${raw.id}: ${error}`)
      }
    }

    return { created, updated }
  }

  async normalizeByIds(rawIds: string[]): Promise<{ normalized: number }> {
    let normalized = 0

    for (const rawId of rawIds) {
      try {
        const raw = await this.prisma.rawOffer.findUnique({ where: { id: rawId } })
        if (!raw) continue

        // Check if already normalized
        const existing = await this.prisma.discountOffer.findFirst({ where: { rawOfferId: rawId } })
        if (existing) continue

        const result = await this.normalizeRawOffer(raw)
        if (result) normalized++
      } catch (error) {
        this.logger.error(`Failed to normalize raw offer ${rawId}: ${error}`)
      }
    }

    return { normalized }
  }

  async normalizeRawOffer(raw: {
    id: string
    storeId: string
    rawTitle: string
    rawUrl: string
    rawImageUrl: string | null
    rawCurrentPrice: any
    rawOldPrice: any
    rawDiscountPercent: number | null
    rawAvailability: string | null
    rawPayloadJson?: any
  }): Promise<boolean> {
    const store = await this.prisma.store.findUnique({ where: { id: raw.storeId } })
    if (!store) return false

    const payload = raw.rawPayloadJson || {}

    // Use structured payload data when available (e.g. SimpleWine API, WineLab)
    const hasStructuredData = payload.country || payload.year || payload.volume || payload.wineType || payload.color || payload.volumePrices

    let wineInfo: NormalizedWineInfo | null = null

    if (hasStructuredData) {
      wineInfo = this.fromStructuredPayload(payload)
    }

    // Skip LLM normalization (quota exceeded on free tier)
    // if (!wineInfo) {
    //   wineInfo = await this.extractWineInfo(raw.rawTitle)
    // }

    // Fallback to deterministic parsing
    if (!wineInfo) {
      wineInfo = this.parseTitleDeterministically(raw.rawTitle)
    }

    // Override wineType if payload explicitly says SPARKLING (scraped from sparkling catalog URL)
    if (payload.wineType === 'SPARKLING' && wineInfo) {
      wineInfo.wineType = 'sparkling'
    }

    // Extract prices from fullText using new algorithm
    let currentPrice: number | null = null
    let oldPrice: number | null = null

    // WineLab: extract prices from volumePrices array
    // volumePrices[0] = BASE (old price), volumePrices[1] = GOLD/PURPLE (current price)
    const volumePrices = payload.volumePrices
    if (volumePrices && Array.isArray(volumePrices) && volumePrices.length >= 2) {
      oldPrice = volumePrices[0]?.value ?? null
      currentPrice = volumePrices[1]?.value ?? null
    }

    const fullText = payload.fullText
    if (fullText && currentPrice === null) {
      const prices = this.extractPricesFromFullText(fullText)
      currentPrice = prices.currentPrice
      oldPrice = prices.oldPrice
    }

    // Fallback to rawCurrentPrice/rawOldPrice if fullText parsing failed
    if (currentPrice === null && raw.rawCurrentPrice) {
      currentPrice = parseFloat(String(raw.rawCurrentPrice))
    }
    if (oldPrice === null && raw.rawOldPrice) {
      oldPrice = parseFloat(String(raw.rawOldPrice))
    }

    // Ensure oldPrice >= currentPrice
    let finalCurrentPrice = currentPrice
    let finalOldPrice = oldPrice
    if (currentPrice && oldPrice && oldPrice < currentPrice) {
      finalCurrentPrice = oldPrice
      finalOldPrice = currentPrice
    }

    // Round prices to whole rubles (no kopecks)
    if (finalCurrentPrice) finalCurrentPrice = Math.round(finalCurrentPrice)
    if (finalOldPrice) finalOldPrice = Math.round(finalOldPrice)

    // Validate prices - skip if no valid price
    if (!finalCurrentPrice || finalCurrentPrice <= 0) {
      this.logger.warn(`Skipping offer ${raw.id}: no valid price (current=${finalCurrentPrice}, old=${finalOldPrice})`)
      return false
    }

    let discountPercent: number | null = null
    let discountAmount: number | null = null

    if (finalOldPrice && finalCurrentPrice && finalOldPrice > 0) {
      discountAmount = finalOldPrice - finalCurrentPrice
      discountPercent = Math.round(((finalOldPrice - finalCurrentPrice) / finalOldPrice) * 100)
    }

    const wineTypeMap: Record<string, string> = {
      red: 'RED',
      white: 'WHITE',
      rose: 'ROSE',
      sparkling: 'SPARKLING',
      dessert: 'SWEET',
      fortified: 'FORTIFIED',
      unknown: 'OTHER',
    }

    const normalizedWineType = wineInfo ? (wineTypeMap[wineInfo.wineType] ?? 'OTHER') : null

    await this.prisma.discountOffer.upsert({
      where: { rawOfferId: raw.id },
      create: {
        storeId: raw.storeId,
        rawOfferId: raw.id,
        sellerName: store.name,
        wineNameRaw: raw.rawTitle,
        producer: wineInfo?.producer ?? null,
        wineName: wineInfo?.wineName ?? null,
        fullName: wineInfo?.fullName ?? null,
        vintage: wineInfo?.vintage ?? null,
        country: wineInfo?.country ?? null,
        region: wineInfo?.region ?? null,
        originZone: wineInfo?.originZone ?? null,
        wineType: normalizedWineType,
        volumeMl: wineInfo?.volumeMl ?? null,
        currentPrice: finalCurrentPrice,
        oldPrice: finalOldPrice ?? undefined,
        discountPercent,
        discountAmount: discountAmount ?? undefined,
        currency: store.currency,
        url: raw.rawUrl,
        imageUrl: raw.rawImageUrl,
        availability: raw.rawAvailability,
        confidence: wineInfo?.confidence === 'high' ? 'high' : wineInfo?.confidence === 'low' ? 'low' : 'medium',
        status: this.determineStatus(raw.rawAvailability),
        lastCheckedAt: new Date(),
      },
      update: {
        sellerName: store.name,
        wineNameRaw: raw.rawTitle,
        producer: wineInfo?.producer ?? null,
        wineName: wineInfo?.wineName ?? null,
        fullName: wineInfo?.fullName ?? null,
        vintage: wineInfo?.vintage ?? null,
        country: wineInfo?.country ?? null,
        region: wineInfo?.region ?? null,
        originZone: wineInfo?.originZone ?? null,
        wineType: normalizedWineType,
        volumeMl: wineInfo?.volumeMl ?? null,
        currentPrice: finalCurrentPrice,
        oldPrice: finalOldPrice ?? undefined,
        discountPercent,
        discountAmount: discountAmount ?? undefined,
        url: raw.rawUrl,
        imageUrl: raw.rawImageUrl,
        availability: raw.rawAvailability,
        confidence: wineInfo?.confidence === 'high' ? 'high' : wineInfo?.confidence === 'low' ? 'low' : 'medium',
        status: this.determineStatus(raw.rawAvailability),
        lastCheckedAt: new Date(),
      },
    })

    return true
  }

  private fromStructuredPayload(payload: any): NormalizedWineInfo | null {
    const wineTypeMap: Record<string, string> = {
      'красное': 'red',
      'белое': 'white',
      'розовое': 'rose',
      'игристое': 'sparkling',
      'красный': 'red',
      'белый': 'white',
      'розовый': 'rose',
      'RED': 'red',
      'WHITE': 'white',
      'ROSE': 'rose',
      'SPARKLING': 'sparkling',
      'FORTIFIED': 'fortified',
      'SWEET': 'dessert',
      'OTHER': 'unknown',
    }

    const color = payload.color || null
    let wineType: string

    if (payload.wineType) {
      const wt = String(payload.wineType)
      wineType = wineTypeMap[wt] || wineTypeMap[wt.toUpperCase()] || wt.toLowerCase()
    } else if (color) {
      wineType = wineTypeMap[color.toLowerCase()] || 'unknown'
    } else {
      wineType = 'unknown'
    }

    let volumeMl: number | null = null
    if (payload.volumeMl) {
      volumeMl = payload.volumeMl
    } else if (payload.volume) {
      const vol = String(payload.volume).replace(/[^\d.]/g, '')
      const num = parseFloat(vol)
      if (!isNaN(num)) {
        volumeMl = num < 10 ? Math.round(num * 1000) : num
      }
    }

    const vintage = payload.year ? String(payload.year) : null

    return {
      producer: payload.manufacturer || null,
      wineName: payload.title || null,
      fullName: payload.title || null,
      vintage,
      country: payload.country || null,
      region: (payload.region && typeof payload.region === 'string') ? payload.region : null,
      originZone: null,
      wineType: wineType as any,
      volumeMl,
      confidence: 'high',
    }
  }

  private async extractWineInfo(rawTitle: string): Promise<NormalizedWineInfo | null> {
    try {
      const model = await this.aiModelsService.getDefaultForPurpose('TEXT_PROCESSING')

      const systemPrompt = this.getNormalizationPrompt()
      const baseUrl = model.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
      const apiKey = model.apiKey

      const isGemini = baseUrl.includes('generativelanguage.googleapis.com')

      let response: Response
      if (isGemini) {
        const url = `${baseUrl}/models/${model.name}:generateContent?key=${apiKey}`
        const requestBody = {
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\nRaw offer title:\n${rawTitle}` }],
            },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }

        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        // Handle 429 rate limit with retry
        if (response.status === 429) {
          const responseText = await response.text()
          const retryMatch = responseText.match(/retry in\s+([\d.]+)s/i)
          const waitSeconds = retryMatch ? parseFloat(retryMatch[1]) + 1 : 30
          this.logger.warn(`LLM rate limited, waiting ${waitSeconds}s before retry`)
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))

          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          })
        }
      } else {
        const requestBody = {
          model: model.name,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rawTitle },
          ],
          response_format: { type: 'json_object' },
        }

        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        })
      }

      const responseText = await response.text()
      if (!response.ok) {
        this.logger.error(`LLM error: ${responseText}`)
        return null
      }

      const data = JSON.parse(responseText)

      let content: string
      if (isGemini) {
        content = data.candidates?.[0]?.content?.parts?.[0]?.text
      } else {
        content = data.choices?.[0]?.message?.content
      }

      if (!content) return null

      const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
      return JSON.parse(cleaned)
    } catch (error) {
      this.logger.error(`extractWineInfo error: ${error}`)
      return null
    }
  }

  private getNormalizationPrompt(): string {
    return `You are a wine offer normalizer.

Task:
Extract structured wine identity from the provided raw shop offer.

Rules:
1. Return only valid JSON.
2. Use only the provided raw title and raw text.
3. Do not use web search.
4. Do not invent missing data.
5. If a field is uncertain, return null.
6. Preserve vintage only if it is present in the source text.
7. If volume is present, convert it to milliliters.
8. Do not return tasting notes, prices or marketing text.
9. If several wines are possible, set confidence to "low".
10. NEVER invent, guess, or extract prices. Prices are handled separately by the system. Only use prices explicitly provided by the scraper. If the scraper returned no prices, leave both price columns empty. If the scraper returned only one price, put it in the "Price" column and leave "Old Price" empty.

Return schema:
{
  "producer": string | null,
  "wineName": string | null,
  "fullName": string | null,
  "vintage": string | null,
  "country": string | null,
  "region": string | null,
  "originZone": string | null,
  "wineType": "red" | "white" | "rose" | "sparkling" | "dessert" | "fortified" | "unknown",
  "volumeMl": number | null,
  "confidence": "high" | "medium" | "low"
}`
  }

  private determineStatus(rawAvailability: string | null): 'active' | 'out_of_stock' | 'expired' | 'error' | 'hidden' {
    if (!rawAvailability) return 'active'
    const lower = rawAvailability.toLowerCase()
    if (lower.includes('out') || lower.includes('sold') || lower.includes('unavailable')) return 'out_of_stock'
    return 'active'
  }

  private parseTitleDeterministically(title: string): NormalizedWineInfo | null {
    try {
      // Format: "вино БАРДОЛИНО 10-13% 0.75, красное, сухое, Италия"
      const parts = title.split(',').map(p => p.trim())

      // Last part is country
      const country = parts[parts.length - 1] || null

      // Find color and type parts
      const colorMap: Record<string, string> = {
        'красное': 'red',
        'белое': 'white',
        'розовое': 'rose',
        'игристое': 'sparkling',
      }
      const sweetnessMap: Record<string, string> = {
        'сухое': 'dry',
        'полусладкое': 'semi-sweet',
        'сладкое': 'sweet',
        'полусухое': 'semi-dry',
      }

      let wineType = 'unknown'
      for (const part of parts) {
        const lower = part.toLowerCase()
        if (colorMap[lower]) {
          wineType = colorMap[lower]
          break
        }
      }

      // Extract volume
      const volumeMatch = title.match(/(\d+\.?\d*)\s*(ж\/б|л|мл)/)
      let volumeMl: number | null = null
      if (volumeMatch) {
        const vol = parseFloat(volumeMatch[1])
        if (volumeMatch[2] === 'л') volumeMl = Math.round(vol * 1000)
        else if (volumeMatch[2] === 'ж/б') volumeMl = Math.round(vol * 1000)
        else if (volumeMatch[2] === 'мл') volumeMl = vol
      }

      // Extract vintage (4-digit year)
      const vintageMatch = title.match(/\b(1[89]\d{2}|20\d{2})\b/)
      const vintage = vintageMatch ? vintageMatch[1] : null

      // Extract name part - remove "вино" prefix, percentage, volume
      let namePart = parts[0]
        .replace(/^вино\s+/i, '')
        .replace(/\s+\d+\.?\d*%/, '')
        .replace(/\s+\d+-\d+%/, '')
        .replace(/\s+\d+\.?\d*\s*ж\/б/, '')
        .replace(/\s+\d+\.?\d*\s*л\b/, '')
        .replace(/\s+\d+\.?\d*\s*мл/, '')
        // Remove standalone volume like "0.75" or "1.5" at end
        .replace(/\s+(0\.75|1\.5|0\.5|0\.375|1|2|3|5)\s*$/, '')
        .trim()

      return {
        producer: null,
        wineName: namePart || null,
        fullName: namePart || null,
        vintage,
        country: country || null,
        region: null,
        originZone: null,
        wineType: wineType as any,
        volumeMl,
        confidence: 'medium',
      }
    } catch {
      return null
    }
  }

  private extractPricesFromFullText(fullText: string): { currentPrice: number | null; oldPrice: number | null } {
    // Step 1: Remove all spaces
    const noSpaces = fullText.replace(/\s/g, '')

    // Step 2: Find all sequences of 5+ consecutive digits followed by "р"
    const priceRegex = /(\d{5,})р/g
    const matches: number[] = []
    let match
    while ((match = priceRegex.exec(noSpaces)) !== null) {
      const num = parseInt(match[1], 10)
      const price = Math.round(num / 100)
      if (!isNaN(price) && price > 50 && price < 10000000) {
        matches.push(price)
      }
    }

    // Step 3: Handle matches
    if (matches.length === 0) {
      return { currentPrice: null, oldPrice: null }
    }
    if (matches.length === 1) {
      return { currentPrice: matches[0], oldPrice: null }
    }

    // Take the last two matches (from end of string)
    const lastTwo = matches.slice(-2)

    // Step 4: Larger = oldPrice, smaller = currentPrice
    const oldPrice = Math.max(lastTwo[0], lastTwo[1])
    const currentPrice = Math.min(lastTwo[0], lastTwo[1])

    return { currentPrice, oldPrice }
  }
}

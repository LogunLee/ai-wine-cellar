import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../shared/database/prisma.service'
import { AiModelsService } from '../../ai-models/ai-models.service'
import { normalizeRegionKey } from './region-key.util'

interface ResolvedRegion {
  regionId: string
  canonicalName: string
  country: string | null
}

interface LlmRegion {
  canonicalRegion: string | null
  country: string | null
  isWineRegion: boolean
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Unifies raw region/appellation strings into a single reference book (wine_region).
 *
 * Strategy (chosen with the user): a deterministic key (region-key.util) collapses
 * trivial spelling variants; cross-language / phonetic variants ("Cote de Nuits" vs
 * "кот де нюи") are resolved ONCE by an LLM (Gemini) to a canonical region, and the
 * mapping is cached in region_alias. Subsequent occurrences are a cheap DB lookup.
 *
 * Resolution is decoupled from scraping/normalization (which must stay fast and
 * deterministic): the normalizer only writes the raw region + region_key and, if a
 * mapping already exists, the canonical fields. This service fills in new mappings
 * via the LLM, on demand (admin endpoint) or in batch.
 */
@Injectable()
export class RegionResolverService {
  private readonly logger = new Logger(RegionResolverService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiModelsService: AiModelsService,
  ) {}

  /** Cheap, LLM-free lookup of an already-resolved region by raw string. */
  async lookupByRaw(raw: string | null | undefined): Promise<{ regionKey: string | null; resolved: ResolvedRegion | null }> {
    const regionKey = normalizeRegionKey(raw)
    if (!regionKey) return { regionKey: null, resolved: null }

    const alias = await this.prisma.regionAlias.findUnique({
      where: { regionKey },
      include: { region: true },
    })
    if (!alias) return { regionKey, resolved: null }

    return {
      regionKey,
      resolved: {
        regionId: alias.regionId,
        canonicalName: alias.region.canonicalName,
        country: alias.region.country,
      },
    }
  }

  /**
   * Resolve every distinct raw region present on discount_offer that has no alias
   * yet. Calls the LLM once per unique region_key, then backfills offers.
   */
  async resolvePending(limit = 100): Promise<{ resolved: number; failed: number; offersUpdated: number }> {
    // Distinct raw regions that have a region_key but no canonical mapping yet.
    const rows = await this.prisma.discountOffer.findMany({
      where: { region: { not: null }, regionId: null, deleted: false },
      select: { region: true, country: true, regionKey: true },
      distinct: ['regionKey'],
      take: limit,
    })

    let resolved = 0
    let failed = 0
    let offersUpdated = 0

    for (const row of rows) {
      const regionKey = row.regionKey ?? normalizeRegionKey(row.region)
      if (!regionKey || !row.region) continue

      // Maybe another offer already created the alias since we queried.
      const existing = await this.prisma.regionAlias.findUnique({ where: { regionKey } })
      let regionId = existing?.regionId ?? null

      if (!regionId) {
        try {
          regionId = await this.resolveViaLlm(row.region, row.country, regionKey)
          if (regionId) resolved++
          else failed++
        } catch (err) {
          this.logger.warn(`Region resolve failed for "${row.region}": ${err}`)
          failed++
        }
      }

      if (regionId) {
        const region = await this.prisma.wineRegion.findUnique({ where: { id: regionId } })
        const upd = await this.prisma.discountOffer.updateMany({
          where: { regionKey, regionId: null },
          data: { regionId, regionCanonical: region?.canonicalName ?? null },
        })
        offersUpdated += upd.count
      }
    }

    this.logger.log(`Region resolve: resolved=${resolved}, failed=${failed}, offersUpdated=${offersUpdated}`)
    return { resolved, failed, offersUpdated }
  }

  /**
   * Resolve a single raw region via the LLM, create/find the canonical WineRegion,
   * persist the RegionAlias cache entry, and return the region id (or null).
   */
  private async resolveViaLlm(raw: string, countryHint: string | null, regionKey: string): Promise<string | null> {
    const llm = await this.askLlm(raw, countryHint)
    if (!llm) return null

    // Use the LLM's canonical name when it recognized a real wine region,
    // otherwise fall back to the raw string so the alias is still cached
    // (prevents re-querying the LLM for the same unknown value every run).
    const canonicalName = (llm.isWineRegion && llm.canonicalRegion?.trim())
      ? llm.canonicalRegion.trim()
      : raw.trim()
    const canonicalKey = normalizeRegionKey(canonicalName) ?? regionKey
    const country = llm.country?.trim() || countryHint || null
    const source = (llm.isWineRegion && llm.canonicalRegion) ? 'llm' : 'llm-fallback'

    // Find or create the canonical region (this is where cross-language variants
    // merge: different raw spellings that the LLM maps to the same canonical name
    // share one canonicalKey → one WineRegion).
    const region = await this.prisma.wineRegion.upsert({
      where: { canonicalKey },
      create: {
        canonicalName,
        canonicalKey,
        country,
        source,
        status: source === 'llm' ? 'resolved' : 'needs_review',
      },
      update: {
        // Fill country if it was previously unknown.
        ...(country ? { country } : {}),
      },
    })

    await this.prisma.regionAlias.upsert({
      where: { regionKey },
      create: { regionKey, rawValue: raw, country: countryHint ?? null, source, regionId: region.id },
      update: {},
    })

    return region.id
  }

  /**
   * Prefer the lighter `gemini-2.0-flash` for resolution: this is a trivial
   * canonicalization task where 2.0 quality is sufficient, and on the free tier it
   * has a SEPARATE (higher) quota — so it doesn't compete with the default
   * `gemini-2.5-flash` reserved for complex tasks. Falls back to the default model.
   */
  private async getResolverModel() {
    const preferred = await this.prisma.aiModel.findFirst({
      where: { name: 'gemini-2.0-flash', purpose: 'TEXT_PROCESSING', isActive: true },
    })
    return preferred ?? (await this.aiModelsService.getDefaultForPurpose('TEXT_PROCESSING'))
  }

  /** Call Gemini to canonicalize a region string. */
  private async askLlm(raw: string, countryHint: string | null): Promise<LlmRegion | null> {
    const model = await this.getResolverModel()
    const baseUrl = model.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    const apiKey = model.apiKey
    const isGemini = baseUrl.includes('generativelanguage.googleapis.com')

    const prompt = this.buildPrompt(raw, countryHint)

    let response: Response
    if (isGemini) {
      const url = `${baseUrl}/models/${model.name}:generateContent?key=${apiKey}`
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.status === 429) {
        const txt = await response.text()
        const m = txt.match(/retry in\s+([\d.]+)s/i)
        const wait = m ? parseFloat(m[1]) + 1 : 30
        this.logger.warn(`Gemini rate limited, waiting ${wait}s`)
        await new Promise((r) => setTimeout(r, wait * 1000))
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
    } else {
      const body = {
        model: model.name,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: raw },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      })
    }

    const text = await response.text()
    if (!response.ok) {
      this.logger.error(`Gemini error (${response.status}): ${text.substring(0, 300)}`)
      return null
    }

    const data = JSON.parse(text)
    const content: string | undefined = isGemini
      ? data.candidates?.[0]?.content?.parts?.[0]?.text
      : data.choices?.[0]?.message?.content
    if (!content) return null

    const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      return {
        canonicalRegion: parsed.canonicalRegion ?? null,
        country: parsed.country ?? null,
        isWineRegion: parsed.isWineRegion === true,
        confidence: parsed.confidence ?? 'low',
      }
    } catch {
      this.logger.warn(`Gemini returned non-JSON: ${cleaned.substring(0, 200)}`)
      return null
    }
  }

  private buildPrompt(raw: string, countryHint: string | null): string {
    return `You normalize wine region / appellation names into a single canonical reference.

Input is a region name as written by a Russian wine shop. It may be in Russian (often a phonetic transcription), French, Italian, Spanish, English, etc. Different spellings of the SAME place must map to ONE canonical name.

Return STRICT JSON only:
{
  "canonicalRegion": string | null,  // canonical region/appellation name in its native language and standard spelling (e.g. "Côte de Nuits", "Bordeaux", "Toscana", "Rioja"). null if not a real wine region.
  "country": string | null,          // country of the region, in Russian (e.g. "Франция", "Италия", "Испания"). null if unknown.
  "isWineRegion": boolean,            // true only if the input is a recognizable wine region/appellation/zone.
  "confidence": "high" | "medium" | "low"
}

Rules:
- Always return the SAME canonicalRegion for variants of the same place. Example: "кот де нюи", "Cote de Nuits", "Côte de Nuits" → "Côte de Nuits".
- Do not invent regions. If the input is generic, a country, a producer, or unrecognizable, set isWineRegion=false and canonicalRegion=null.
- No commentary, JSON only.

Raw region: ${JSON.stringify(raw)}
Country hint: ${countryHint ? JSON.stringify(countryHint) : 'none'}`
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../../shared/database/prisma.service'
import { AiModelsService } from '../../ai-models/ai-models.service'
import { normalizeGrapeKey, normalizeGrapes } from './grape.util'

interface LlmGrape {
  canonicalGrape: string | null
  isGrape: boolean
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Grape-variety synonym dictionary, mirroring the region resolver.
 *
 * `normalizeGrapes` already Title-Cases and strips parentheticals, which merges
 * pure case variants ("семильон" == "Семильон"). This service handles the rest:
 * cross-language / phonetic spellings ("семийон", "Semillon") are resolved ONCE by
 * an LLM (Gemini) to a canonical variety, cached in grape_name_mapping. Thereafter
 * mapping is a cheap DB lookup.
 *
 * Backing tables (scaffolded earlier, wired up here):
 *   GrapeVariety.name           — canonical variety name (unique)
 *   GrapeNameMapping.inputTextNormalized — normalized key (unique) → grapeId
 */
@Injectable()
export class GrapeResolverService {
  private readonly logger = new Logger(GrapeResolverService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiModelsService: AiModelsService,
  ) {}

  /**
   * Map a Title-Cased grape list to canonical names using the (LLM-free) mapping
   * cache. Unmapped grapes are kept as-is and get resolved later by resolvePending.
   * Used by the normalizer so freshly stored offers already carry canonical grapes
   * once their spelling has been resolved at least once.
   */
  async mapToCanonical(grapes: string[]): Promise<string[]> {
    if (!grapes || grapes.length === 0) return []

    const keys = grapes.map((g) => normalizeGrapeKey(g)).filter((k): k is string => !!k)
    if (keys.length === 0) return grapes

    const mappings = await this.prisma.grapeNameMapping.findMany({
      where: { inputTextNormalized: { in: keys } },
      include: { grape: true },
    })
    const byKey = new Map(mappings.map((m) => [m.inputTextNormalized, m.grape.name]))

    const out: string[] = []
    const seen = new Set<string>()
    for (const g of grapes) {
      const key = normalizeGrapeKey(g)
      const canonical = (key && byKey.get(key)) || g
      const dedup = canonical.toLowerCase()
      if (seen.has(dedup)) continue
      seen.add(dedup)
      out.push(canonical)
    }
    return out
  }

  /**
   * Resolve every distinct grape present on discount_offer that has no mapping yet.
   * Calls the LLM once per unique grape key, then backfills offers (array_replace +
   * de-dup) so existing rows immediately use the canonical name.
   */
  async resolvePending(limit = 200): Promise<{ resolved: number; failed: number; offersUpdated: number }> {
    // Distinct raw grape strings currently stored on offers.
    const rows = await this.prisma.$queryRaw<{ grape: string }[]>`
      SELECT DISTINCT unnest(grapes) AS grape
      FROM discount_offer
      WHERE deleted = false AND array_length(grapes, 1) > 0
    `

    let resolved = 0
    let failed = 0
    let offersUpdated = 0
    let processed = 0

    for (const { grape } of rows) {
      if (processed >= limit) break
      const key = normalizeGrapeKey(grape)
      if (!key) continue

      const existing = await this.prisma.grapeNameMapping.findUnique({
        where: { inputTextNormalized: key },
        include: { grape: true },
      })
      processed++

      let canonical: string | null = existing?.grape.name ?? null

      if (!canonical) {
        try {
          canonical = await this.resolveViaLlm(grape, key)
          if (canonical) resolved++
          else failed++
        } catch (err) {
          this.logger.warn(`Grape resolve failed for "${grape}": ${err}`)
          failed++
        }
      }

      // Backfill offers when the canonical name differs from the stored spelling.
      if (canonical && canonical !== grape) {
        const res = await this.prisma.$executeRaw`
          UPDATE discount_offer
          SET grapes = array_replace(grapes, ${grape}, ${canonical})
          WHERE ${grape} = ANY(grapes)
        `
        offersUpdated += Number(res)
      }
    }

    // De-duplicate grape arrays that may now contain repeats after substitution.
    await this.prisma.$executeRaw`
      UPDATE discount_offer
      SET grapes = ARRAY(SELECT DISTINCT e FROM unnest(grapes) e)
      WHERE array_length(grapes, 1) > 1
    `

    this.logger.log(`Grape resolve: resolved=${resolved}, failed=${failed}, offersUpdated=${offersUpdated}`)
    return { resolved, failed, offersUpdated }
  }

  /** Resolve one grape via the LLM, find/create the canonical variety + mapping. */
  private async resolveViaLlm(raw: string, key: string): Promise<string | null> {
    const llm = await this.askLlm(raw)
    if (!llm) return null

    // Canonical name: the LLM's normalized variety when recognized, else the raw
    // (so the mapping is still cached and we don't re-query the same unknown value).
    const canonicalRaw = (llm.isGrape && llm.canonicalGrape?.trim()) ? llm.canonicalGrape.trim() : raw.trim()
    const canonical = normalizeGrapes([canonicalRaw])[0] ?? canonicalRaw
    const source = (llm.isGrape && llm.canonicalGrape) ? 'llm' : 'llm-fallback'

    // Find or create the canonical variety (cross-spelling variants that the LLM
    // maps to the same name share one GrapeVariety row).
    const variety = await this.prisma.grapeVariety.upsert({
      where: { name: canonical },
      create: { name: canonical },
      update: {},
    })

    await this.prisma.grapeNameMapping.upsert({
      where: { inputTextNormalized: key },
      create: { grapeId: variety.id, inputText: raw, inputTextNormalized: key, source },
      update: {},
    })

    return canonical
  }

  /**
   * Prefer the lighter `gemini-2.0-flash` for resolution: trivial canonicalization
   * where 2.0 quality is sufficient, and on the free tier it has a SEPARATE (higher)
   * quota — so it doesn't compete with the default `gemini-2.5-flash` reserved for
   * complex tasks. Falls back to the default model.
   */
  private async getResolverModel() {
    const preferred = await this.prisma.aiModel.findFirst({
      where: { name: 'gemini-2.0-flash', purpose: 'TEXT_PROCESSING', isActive: true },
    })
    return preferred ?? (await this.aiModelsService.getDefaultForPurpose('TEXT_PROCESSING'))
  }

  /** Call Gemini to canonicalize a grape-variety name. */
  private async askLlm(raw: string): Promise<LlmGrape | null> {
    const model = await this.getResolverModel()
    const baseUrl = model.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    const apiKey = model.apiKey
    const isGemini = baseUrl.includes('generativelanguage.googleapis.com')

    const prompt = this.buildPrompt(raw)

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
        canonicalGrape: parsed.canonicalGrape ?? null,
        isGrape: parsed.isGrape === true,
        confidence: parsed.confidence ?? 'low',
      }
    } catch {
      this.logger.warn(`Gemini returned non-JSON: ${cleaned.substring(0, 200)}`)
      return null
    }
  }

  private buildPrompt(raw: string): string {
    return `You normalize wine grape-variety names into a single canonical dictionary.

Input is a grape variety as written by a Russian wine shop. It may be Russian, a Russian phonetic transcription, Latin/English, or slightly misspelled. Different spellings of the SAME variety must map to ONE canonical name.

Return STRICT JSON only:
{
  "canonicalGrape": string | null,  // canonical variety name in Russian, standard spelling (e.g. "Семильон", "Каберне Совиньон", "Шардоне"). null if not a grape variety.
  "isGrape": boolean,               // true only if the input is a recognizable grape variety.
  "confidence": "high" | "medium" | "low"
}

Rules:
- Always return the SAME canonicalGrape for variants of one variety. Example: "семийон", "семильон", "Semillon", "Sémillon" → "Семильон".
- Use the most common Russian spelling as canonical.
- If the input is not a grape (a region, a wine type, marketing text, unreadable), set isGrape=false and canonicalGrape=null.
- No commentary, JSON only.

Raw grape: ${JSON.stringify(raw)}`
  }
}

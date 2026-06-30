import { Prisma, WineType } from '@prisma/client'

/**
 * Single source of truth for what ai-search can filter on. Adding a new searchable
 * attribute = one entry here: it automatically (a) appears in the JSON schema the
 * LLM fills during query understanding, and (b) is picked up by buildCellarWhere().
 *
 * Grounded in the REAL normalized schema:
 *   CellarItem → wineVintage(WineVintage) → series(WineSeries) → country/region…
 *
 * Only a handful of attributes map to clean columns and become HARD SQL filters.
 * Everything else (grape, producer, region wording, body, ageing vessel, …) is a
 * SOFT criterion: it is NOT used to exclude rows (NULL = unknown, not "no"), but is
 * handed to the LLM for judgement and to semantic vector search over descriptions.
 */

const COLOR_TO_WINE_TYPE: Record<string, WineType> = {
  red: 'RED',
  white: 'WHITE',
  rose: 'ROSE',
  sparkling: 'SPARKLING',
  sweet: 'SWEET',
  fortified: 'FORTIFIED',
  other: 'OTHER',
}

/** Structured filters the LLM is allowed to emit (closed set). */
export interface StructuredFilters {
  color?: keyof typeof COLOR_TO_WINE_TYPE | null
  vintageYearMin?: number | null
  vintageYearMax?: number | null
  priceMin?: number | null
  priceMax?: number | null
  inStockOnly?: boolean | null
}

/** Soft, free-text criteria — never used to exclude, only to rank/explain + search. */
export interface SoftCriteria {
  grape?: string | null
  region?: string | null
  country?: string | null
  producer?: string | null
  appellation?: string | null
  body?: string | null // light | medium | full
  ageingVessel?: string | null // steel | oak | …
  other?: string[] | null
}

/** Full result of stage-1 query understanding. */
export interface QueryUnderstanding {
  structured: StructuredFilters
  soft: SoftCriteria
  /** Text to embed for vector search over books + wine descriptions. */
  semanticQuery: string
  /** pairing | descriptor | attribute | surprise */
  mode: string
  /** Criteria the model could not map to anything we have (informational only). */
  unsupported?: string[]
}

/**
 * JSON-schema-ish description handed to the LLM so it knows exactly what it may
 * fill. Built from the registry, not hand-synced. Kept compact and human-readable
 * (the providers here are OpenAI-compatible chat, so we instruct via prompt).
 */
export const FIELD_SCHEMA_DESCRIPTION = `
structured (жёсткие фильтры — только эти ключи и значения):
  color: one of [red, white, rose, sparkling, sweet, fortified, other] | null  (цвет/тип вина)
  vintageYearMin: number | null         (год урожая «от»)
  vintageYearMax: number | null         (год урожая «до»)
  priceMin: number | null               (цена покупки «от»)
  priceMax: number | null               (цена покупки «до»)
  inStockOnly: boolean | null           (по умолчанию true — только то, что есть в наличии)
soft (мягкие критерии — НЕ исключают вино, влияют на ранжирование и поиск по описаниям):
  grape, region, country, producer, appellation, body (light|medium|full), ageingVessel (steel|oak|…), other: string[]
semanticQuery: string                   (фраза для смыслового поиска по книгам и описаниям вин;
                                         сюда же переводи нестандартные критерии — «под карбонару»,
                                         «тона шиповника», «RP>95» → «плотные насыщенные вина», «удиви меня»)
mode: one of [pairing, descriptor, attribute, surprise]
unsupported: string[]                   (критерии, которые ты не смог отнести ни к чему — справочно)
`.trim()

/**
 * Translate hard structured filters into a Prisma where over the user's cellar.
 * Soft criteria are intentionally ignored here (handled downstream).
 * Always scoped to the user's own cellars, not soft-deleted.
 */
export function buildCellarWhere(userId: string, f: StructuredFilters): Prisma.CellarItemWhereInput {
  const seriesWhere: Prisma.WineSeriesWhereInput = {}
  if (f.color && COLOR_TO_WINE_TYPE[f.color]) {
    seriesWhere.wineType = COLOR_TO_WINE_TYPE[f.color]
  }

  const vintageWhere: Prisma.WineVintageWhereInput = {}
  if (f.vintageYearMin != null || f.vintageYearMax != null) {
    vintageWhere.vintageYear = {
      ...(f.vintageYearMin != null ? { gte: f.vintageYearMin } : {}),
      ...(f.vintageYearMax != null ? { lte: f.vintageYearMax } : {}),
    }
  }
  if (Object.keys(seriesWhere).length) vintageWhere.series = seriesWhere

  const where: Prisma.CellarItemWhereInput = {
    cellar: { ownerId: userId },
    deletedAt: null,
  }
  if (Object.keys(vintageWhere).length) where.wineVintage = vintageWhere

  if (f.priceMin != null || f.priceMax != null) {
    where.purchasePrice = {
      ...(f.priceMin != null ? { gte: f.priceMin } : {}),
      ...(f.priceMax != null ? { lte: f.priceMax } : {}),
    }
  }

  // inStockOnly defaults to true
  if (f.inStockOnly !== false) {
    where.status = 'IN_CELLAR'
    where.quantity = { gt: 0 }
  }

  return where
}

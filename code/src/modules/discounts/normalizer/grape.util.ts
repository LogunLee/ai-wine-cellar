import { normalizeRegionKey } from './region-key.util'

/**
 * Dedup/synonym key for a grape name — same deterministic normalization used for
 * regions (lowercase + transliterate Cyrillic→Latin + strip diacritics &
 * non-letters). Collapses trivial spelling variants of one grape; cross-language /
 * phonetic variants ("семийон" vs "semillon") are merged by the LLM resolver,
 * which maps each distinct key to a canonical GrapeVariety.
 */
export function normalizeGrapeKey(raw: string | null | undefined): string | null {
  return normalizeRegionKey(raw)
}

/**
 * Normalize a list of raw grape-variety strings into clean, de-duplicated,
 * Title-Cased varieties. Applied centrally in the normalizer so every store
 * gets the same canonical grape names regardless of how its scraper formatted
 * the raw value.
 *
 * Handles:
 *  - multiple grapes packed into one string separated by commas / semicolons /
 *    newlines / bullets / pipes (FortWine emits newline-separated values);
 *  - collapsing runs of whitespace and stray line breaks;
 *  - stripping percentage suffixes ("Шардоне 100%" → "Шардоне");
 *  - stripping trailing parenthetical qualifiers so "Глера (Просекко)" == "Глера"
 *    and "Москато Бьянко (Мускат белый)" == "Москато Бьянко";
 *  - Title Case so "каберне совиньон" → "Каберне Совиньон";
 *  - case-insensitive de-duplication (first spelling wins).
 *
 * NOTE: splitting is done on explicit delimiters only — NEVER on spaces — because
 * a single variety legitimately contains spaces ("Каберне Совиньон").
 */
export function normalizeGrapes(input: unknown): string[] {
  const rawList: string[] = Array.isArray(input)
    ? input.filter((g): g is string => typeof g === 'string')
    : typeof input === 'string'
      ? [input]
      : []

  const out: string[] = []
  const seen = new Set<string>()

  for (const raw of rawList) {
    for (const piece of raw.split(/[,;/•|\n\r]+/)) {
      const cleaned = cleanGrape(piece)
      if (!cleaned) continue
      const dedupKey = cleaned.toLowerCase()
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)
      out.push(cleaned)
    }
  }

  return out
}

function cleanGrape(s: string): string | null {
  let g = (s || '').replace(/\s+/g, ' ').trim()
  if (!g) return null

  // Strip percentage suffix: "Шардоне 100%", "Мерло 15 %"
  g = g.replace(/\s*\d+([.,]\d+)?\s*%.*$/, '').trim()

  // Strip a trailing parenthetical qualifier/synonym: "Глера (Просекко)" → "Глера"
  g = g.replace(/\s*\([^)]*\)\s*$/, '').trim()

  if (g.length < 2) return null

  return toTitleCase(g)
}

/** Title Case: first letter of every word (also after hyphens) uppercased, rest lower. */
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-–—])([a-zа-яё])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

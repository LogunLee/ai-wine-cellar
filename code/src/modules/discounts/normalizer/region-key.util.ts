/**
 * Deterministic dedup key for a raw region/appellation string.
 *
 * This is NOT a semantic resolver — it only collapses *trivial* surface variants
 * of the SAME spelling: case, punctuation, whitespace, diacritics, and script
 * (Cyrillic is transliterated to Latin). Cross-language / phonetic variants
 * ("Cote de Nuits" vs "кот де нюи") are intentionally NOT merged here — that is
 * the job of the LLM resolver, which maps each distinct key to a canonical region.
 *
 * The key is used as the cache key in `region_alias`, so each unique spelling is
 * resolved by the LLM exactly once.
 */

// Cyrillic → Latin transliteration (key generation only; not meant to be
// reversible or phonetically perfect — just stable and deterministic).
const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function transliterate(input: string): string {
  let out = ''
  for (const ch of input) {
    const mapped = CYRILLIC_MAP[ch]
    out += mapped !== undefined ? mapped : ch
  }
  return out
}

/**
 * @returns a normalized key, or `null` for empty/meaningless input.
 */
export function normalizeRegionKey(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null

  let s = raw.trim().toLowerCase()
  if (!s) return null

  // Transliterate Cyrillic to Latin before stripping diacritics.
  s = transliterate(s)

  // Strip diacritics (é → e, ô → o, ñ → n, …) via combining-mark range U+0300–U+036F.
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '')

  // Keep only latin letters and digits; everything else becomes a separator,
  // then collapse separators.
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

  if (!s) return null

  // Final key: spaces removed entirely so "cote de nuits" == "cotedenuits".
  return s.replace(/\s+/g, '')
}

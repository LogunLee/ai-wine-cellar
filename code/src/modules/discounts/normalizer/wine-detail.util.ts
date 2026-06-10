/**
 * Centralized mapping of a scraper's raw characteristics map (label → value) into
 * our typed wine-detail columns. Each scraper just passes its full `characteristics`
 * map in the payload; the label-synonym logic lives here (one place), so adding a
 * new shop or a new label spelling never touches the scrapers.
 *
 * Falls back to explicit payload fields (payload.alcohol, payload.appellation, …)
 * for scrapers that already emit them directly.
 */

export interface WineDetails {
  producer: string | null
  appellation: string | null
  sweetness: string | null
  alcohol: number | null
  ageingVessel: string | null
  storagePotential: string | null
}

// Label synonyms (lowercased) per target field. Matched against normalized labels.
const SYNONYMS: Record<keyof WineDetails, string[]> = {
  producer: ['производитель', 'изготовитель', 'бренд', 'торговая марка', 'винодельня', 'хозяйство', 'винодельческое хозяйство'],
  appellation: ['аппеласьон', 'апеласьон', 'аппелласьон', 'апелласьон', 'апелляция', 'aoc', 'aop', 'doc', 'docg', 'do', 'igp', 'igt', 'наименование по происхождению'],
  sweetness: ['содержание сахара', 'сахар', 'сладость', 'тип сахара', 'уровень сахара', 'вид по содержанию сахара'],
  alcohol: ['крепость', 'алкоголь', 'содержание алкоголя', 'спиртуозность', 'abv', 'объёмная доля спирта', 'объемная доля спирта'],
  ageingVessel: ['выдержка', 'тип выдержки', 'ёмкость выдержки', 'емкость выдержки', 'тара', 'выдержка в'],
  storagePotential: ['потенциал хранения', 'потенциал выдержки', 'срок хранения', 'потенциал', 'потенциал старения'],
}

const normLabel = (s: string): string =>
  (s || '').replace(/\s+/g, ' ').trim().replace(/:+$/, '').trim().toLowerCase()

function lookup(chars: Record<string, string>, field: keyof WineDetails): string | null {
  const syns = SYNONYMS[field]
  for (const [rawLabel, rawVal] of Object.entries(chars)) {
    const label = normLabel(rawLabel)
    if (syns.includes(label)) {
      const v = (rawVal || '').toString().replace(/\s+/g, ' ').trim()
      if (v) return v
    }
  }
  return null
}

function parseAlcohol(s: string | null): number | null {
  if (!s) return null
  const m = s.replace(',', '.').match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1])
  return isNaN(n) || n <= 0 || n > 80 ? null : n
}

export function extractWineDetails(
  characteristics: Record<string, string> | undefined | null,
  payload: any,
): WineDetails {
  const chars = (characteristics && typeof characteristics === 'object') ? characteristics : {}

  const producer =
    payload?.manufacturer || payload?.producer || lookup(chars, 'producer') || null

  const appellation =
    payload?.appellation || lookup(chars, 'appellation') || null

  const sweetness =
    lookup(chars, 'sweetness') || payload?.sweetness || payload?.sugarType || payload?.sugar || null

  const alcoholRaw =
    lookup(chars, 'alcohol') ||
    (typeof payload?.alcohol === 'number' ? String(payload.alcohol) : payload?.alcohol) ||
    null
  const alcohol = parseAlcohol(alcoholRaw)

  const ageingVessel =
    lookup(chars, 'ageingVessel') || payload?.ageingVessel || null

  const storagePotential =
    lookup(chars, 'storagePotential') || payload?.storagePotential || null

  const trim = (v: string | null) => (v && v.length <= 300 ? v : v ? v.slice(0, 300) : null)

  return {
    producer: trim(producer),
    appellation: trim(appellation),
    sweetness: trim(sweetness),
    alcohol,
    ageingVessel: trim(ageingVessel),
    storagePotential: trim(storagePotential),
  }
}

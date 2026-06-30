/** Общие текстовые помощники для матчинга вин по слагам (Vivino, Wine-Searcher). */

/** Разбивает строку на слова для скоринга: lower-case, без диакритики, только [a-z0-9], длина > 1. */
export function toSearchWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1)
}

/** "chateau-margaux-2015" → "Chateau Margaux 2015" */
export function slugToTitle(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Артикли/предлоги винных языков — шум для матчинга ("La Bruja DE Rozas"). */
const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'del', 'le', 'les', 'du', 'des', 'da', 'di',
  'della', 'delle', 'il', 'lo', 'the', 'of', 'and', 'et', 'y', 'e', 'von', 'zu',
])

/** Слова для скоринга совпадений: как toSearchWords, но без стоп-слов. */
export function toMatchWords(text: string): string[] {
  const words = toSearchWords(text).filter((w) => !STOPWORDS.has(w))
  return words.length > 0 ? words : toSearchWords(text)
}

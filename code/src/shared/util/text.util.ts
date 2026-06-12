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

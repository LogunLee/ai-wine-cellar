/**
 * Admin/server-only: обогащение карточек вин официальными tech sheet'ами.
 *
 *   npx ts-node scripts/enrich-tech-sheets.ts --grep "Masi" --dry
 *   npx ts-node scripts/enrich-tech-sheets.ts --limit 3
 *   npx ts-node scripts/enrich-tech-sheets.ts            # все 102
 *
 * По каждому вину: Jina-поиск официального tech sheet → чтение страницы (r.jina.ai)
 * → извлечение состава и текста через LLM (Gemini) СТРОГО из найденного текста
 * (без «знаний из головы»). Записывает producer_description (полный текст tech sheet)
 * и wine_vintage.composition (сорта), затем векторизует через indexCellarItemDescriptions.
 *
 * Фолбэк, если официального tech sheet нет: берём состав/описание из надёжного
 * результата поиска (Wine-Searcher / магазин), помечаем source != 'tech_sheet'.
 *
 * Требует: JINA_API_KEY, GEMINI_API_KEY, VOYAGE_API_KEY (для векторов).
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/database/prisma.service'
import { KbIndexService } from '../src/modules/cellar-ai-search/kb-index.service'

const OWNER_EMAIL = 'logun_lee@mail.ru'
const JINA = process.env.JINA_API_KEY
// LLM-извлечение: Mistral (OpenAI-совместимый). Gemini-ключ исчерпан, OpenAI-ключ пуст.
const LLM_KEY = process.env.MISTRAL_API_KEY
const LLM_URL = 'https://api.mistral.ai/v1/chat/completions'
const LLM_MODEL = process.env.ENRICH_MODEL || 'mistral-small-latest'

interface Args { limit?: number; offset?: number; grep?: string; dry?: boolean; onlyMissing?: boolean }
function parseArgs(): Args {
  const a: Args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--limit') a.limit = parseInt(argv[++i], 10)
    else if (k === '--offset') a.offset = parseInt(argv[++i], 10)
    else if (k === '--grep') a.grep = argv[++i]
    else if (k === '--dry') a.dry = true
    else if (k === '--only-missing') a.onlyMissing = true
  }
  return a
}

/** Jina-кредиты кончились (HTTP 402) — поднимаем флаг, чтобы прервать прогон, а не помечать всё «не найдено». */
let JINA_CREDIT_EXHAUSTED = false

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Jina web search → список {title,url,content}. */
async function jinaSearch(query: string): Promise<{ title: string; url: string; content: string }[]> {
  try {
    const res = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${JINA}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(40_000),
    })
    if (res.status === 402) { JINA_CREDIT_EXHAUSTED = true; return [] }
    if (!res.ok) return []
    const data = await res.json()
    return (data.data ?? []).map((d: any) => ({
      title: d.title ?? '',
      url: d.url ?? '',
      content: (d.content || d.description || '').toString().slice(0, 18_000),
    }))
  } catch {
    return []
  }
}

/** Jina reader → markdown-текст страницы (или PDF). */
async function jinaRead(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Authorization: `Bearer ${JINA}`, Accept: 'text/plain' },
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) return ''
    const txt = await res.text()
    return txt.slice(0, 18_000)
  } catch {
    return ''
  }
}

/** LLM-извлечение строго из переданного текста. */
async function llmExtract(
  wine: { producer: string; name: string; vintage: number | null; region: string | null; country: string | null },
  pageText: string,
): Promise<{ found: boolean; isTechSheet: boolean; grapes: string[]; text: string } | null> {
  const sys =
    'Ты извлекаешь данные о вине СТРОГО из предоставленного текста страницы. ' +
    'Категорически запрещено использовать собственные знания о вине — только то, что написано в тексте. ' +
    'Если в тексте нет данных именно об этом вине (совпадение производителя и названия) — found=false. ' +
    'Верни строго JSON.'
  const user =
    `Вино: производитель «${wine.producer}», название «${wine.name}»` +
    `${wine.vintage ? `, год ${wine.vintage}` : ''}${wine.region ? `, регион ${wine.region}` : ''}` +
    `${wine.country ? `, страна ${wine.country}` : ''}.\n\n` +
    `Текст страницы:\n"""\n${pageText}\n"""\n\n` +
    `Верни JSON: {"found": bool, "isTechSheet": bool, "grapes": ["сорт", ...], "text": "..."}.\n` +
    `- found: есть ли в тексте сведения именно об этом вине.\n` +
    `- isTechSheet: это официальный технический лист/описание производителя (состав, винификация, выдержка), а не просто карточка магазина.\n` +
    `- grapes: сортовой состав ТОЛЬКО если он явно указан в тексте (массив названий; пусто, если не указан). НЕ додумывай.\n` +
    `- text: связная выжимка из текста о вине (состав, регион, винификация, выдержка, органолептика) на языке оригинала, до 3000 символов, без навигации/рекламы/cookie. Пусто, если found=false.`
  try {
    let res: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(LLM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
        body: JSON.stringify({
          model: LLM_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(60_000),
      })
      if (res.status !== 429) break
      await sleep(2500 * (attempt + 1)) // rate limit — backoff
    }
    if (!res || !res.ok) return null
    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const s = cleaned.indexOf('{'); const e = cleaned.lastIndexOf('}')
    const obj = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned)
    return {
      found: !!obj.found,
      isTechSheet: !!obj.isTechSheet,
      grapes: Array.isArray(obj.grapes) ? obj.grapes.map((g: any) => String(g).trim()).filter(Boolean) : [],
      text: typeof obj.text === 'string' ? obj.text.trim() : '',
    }
  } catch {
    return null
  }
}

function techSheetQueries(w: { producer: string; name: string; vintage: number | null; country: string | null }): string[] {
  const base = `${w.producer} ${w.name}`.replace(/\s+/g, ' ').trim()
  const localized: Record<string, string> = {
    Italy: 'scheda tecnica', France: 'fiche technique', Spain: 'ficha técnica',
    Germany: 'datenblatt', Russia: 'характеристики вино',
  }
  const loc = (w.country && localized[w.country]) || 'technical sheet'
  return [
    `${base} ${w.vintage ?? ''} technical sheet`.trim(),
    `${base} ${loc}`.trim(),
    `${base} ${w.vintage ?? ''} grape varieties composition`.trim(),
  ]
}

async function main() {
  const args = parseArgs()
  if (!JINA || !LLM_KEY) throw new Error('JINA_API_KEY и MISTRAL_API_KEY обязательны')

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] })
  const prisma = app.get(PrismaService)
  const kbIndex = app.get(KbIndexService)

  const cellar = await prisma.wineCellar.findFirst({ where: { owner: { email: OWNER_EMAIL } } })
  if (!cellar) throw new Error(`Погреб ${OWNER_EMAIL} не найден`)

  let items = await prisma.cellarItem.findMany({
    where: { cellarId: cellar.id, deletedAt: null, status: 'IN_CELLAR' },
    include: { wineVintage: { include: { series: { include: { country: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  if (args.onlyMissing) items = items.filter((it) => !it.producerDescription)
  if (args.grep) {
    const g = args.grep.toLowerCase()
    items = items.filter((it) => `${it.wineVintage.series.producer} ${it.wineVintage.series.name}`.toLowerCase().includes(g))
  }
  if (args.offset) items = items.slice(args.offset)
  if (args.limit) items = items.slice(0, args.limit)

  console.log(`\n=== Обогащение tech sheet: ${items.length} вин${args.dry ? ' (DRY RUN)' : ''} ===\n`)
  const report: string[] = []

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const s = it.wineVintage.series
    const wine = {
      producer: s.producer, name: s.name, vintage: it.wineVintage.vintageYear,
      region: s.region, country: s.country?.name ?? null,
    }
    const label = `${wine.producer} — ${wine.name}${wine.vintage ? ' ' + wine.vintage : ''}`
    process.stdout.write(`[${i + 1}/${items.length}] ${label} … `)

    let best: { found: boolean; isTechSheet: boolean; grapes: string[]; text: string } | null = null
    let bestUrl = ''
    const queries = techSheetQueries(wine)

    outer: for (const q of queries) {
      const results = await jinaSearch(q)
      for (const r of results.slice(0, 3)) {
        if (!r.url) continue
        let page = r.content
        if (page.length < 400) page = await jinaRead(r.url) // контент короткий — читаем страницу
        if (page.length < 200) continue
        const ext = await llmExtract(wine, page)
        if (ext && ext.found && (ext.grapes.length > 0 || ext.text.length > 100)) {
          if (!best || (ext.isTechSheet && !best.isTechSheet) || (ext.grapes.length > best.grapes.length)) {
            best = ext; bestUrl = r.url
          }
          if (ext.isTechSheet && ext.grapes.length > 0) break outer
        }
        await sleep(400)
      }
      if (best && best.isTechSheet && best.grapes.length > 0) break
    }

    if (JINA_CREDIT_EXHAUSTED) {
      console.log('⛔ Jina-кредиты исчерпаны (HTTP 402) — прерываю прогон, остаток не трогаю')
      report.push(`⛔ ОСТАНОВ на «${label}»: пополни Jina и запусти с --only-missing`)
      break
    }
    if (!best || !best.found) {
      console.log('✗ не найдено')
      report.push(`✗  ${label}`)
      continue
    }

    const kind = best.isTechSheet ? 'tech sheet' : 'источник'
    console.log(`✓ ${kind} | сорта: ${best.grapes.join(', ') || '—'} | ${best.text.length} симв.`)
    report.push(`${best.isTechSheet ? '✓✓' : '✓ '} ${label} → [${best.grapes.join(', ') || '—'}]  (${bestUrl})`)

    if (!args.dry) {
      const techText = best.text + (bestUrl ? `\n\nИсточник: ${bestUrl}` : '')
      await prisma.cellarItem.update({ where: { id: it.id }, data: { producerDescription: techText } })
      if (best.grapes.length > 0) {
        await prisma.wineVintage.update({ where: { id: it.wineVintage.id }, data: { composition: best.grapes } })
      }
      await kbIndex.indexCellarItemDescriptions(it.id).catch((e) => console.warn(`  ⚠ embed: ${e.message}`))
    }
    await sleep(800) // пауза между винами — щадим rate limits
  }

  console.log('\n=== Итог ===')
  console.log(report.join('\n'))
  await app.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('enrich failed:', e)
  process.exit(1)
})

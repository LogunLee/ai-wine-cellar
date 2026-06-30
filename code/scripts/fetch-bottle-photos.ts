/**
 * Admin/server-only: авто-подбор фото бутылок (в полный рост) для погреба.
 *
 *   npx ts-node scripts/fetch-bottle-photos.ts --limit 3 --dry
 *   npx ts-node scripts/fetch-bottle-photos.ts --only-missing
 *   npx ts-node scripts/fetch-bottle-photos.ts                 # все 102
 *
 * Переиспользует WineCellarService.getPhotoCandidates (Jina image search) и
 * setItemPhotoFromUrl (скачивание + сохранение в uploads/cellar + photoPath).
 * Берёт первый успешно скачанный кандидат. Пользователь потом правит вручную
 * через «Подобрать фото» в приложении.
 *
 * Требует: JINA_API_KEY.
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/database/prisma.service'
import { WineCellarService } from '../src/modules/wine-cellar/wine-cellar.service'

const OWNER_EMAIL = 'logun_lee@mail.ru'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

async function main() {
  const args = parseArgs()
  if (!process.env.JINA_API_KEY) throw new Error('JINA_API_KEY обязателен')

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] })
  const prisma = app.get(PrismaService)
  const svc = app.get(WineCellarService)

  const cellar = await prisma.wineCellar.findFirst({ where: { owner: { email: OWNER_EMAIL } } })
  if (!cellar) throw new Error(`Погреб ${OWNER_EMAIL} не найден`)
  const ownerId = cellar.ownerId

  let items = await prisma.cellarItem.findMany({
    where: { cellarId: cellar.id, deletedAt: null, status: 'IN_CELLAR' },
    include: { wineVintage: { include: { series: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (args.onlyMissing) items = items.filter((it) => !it.photoPath)
  if (args.grep) {
    const g = args.grep.toLowerCase()
    items = items.filter((it) => `${it.wineVintage.series.producer} ${it.wineVintage.series.name}`.toLowerCase().includes(g))
  }
  if (args.offset) items = items.slice(args.offset)
  if (args.limit) items = items.slice(0, args.limit)

  console.log(`\n=== Фото бутылок: ${items.length} вин${args.dry ? ' (DRY RUN)' : ''} ===\n`)
  let ok = 0, fail = 0
  const failed: string[] = []

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const s = it.wineVintage.series
    const wine = { producer: s.producer, name: s.name, vintageYear: it.wineVintage.vintageYear ?? undefined }
    const label = `${s.producer} — ${s.name}${it.wineVintage.vintageYear ? ' ' + it.wineVintage.vintageYear : ''}`
    process.stdout.write(`[${i + 1}/${items.length}] ${label} … `)

    try {
      const { images } = await svc.getPhotoCandidates(wine)
      if (!images.length) { console.log('✗ нет кандидатов'); fail++; failed.push(label); await sleep(600); continue }
      if (args.dry) { console.log(`✓ ${images.length} кандидатов (${images[0].slice(0, 60)}…)`); ok++; await sleep(600); continue }

      let saved = false
      for (const url of images.slice(0, 5)) {
        try {
          await svc.setItemPhotoFromUrl(ownerId, it.id, url)
          saved = true
          console.log('✓ сохранено')
          break
        } catch { /* пробуем следующий кандидат */ }
      }
      if (saved) ok++; else { console.log('✗ не удалось скачать'); fail++; failed.push(label) }
    } catch (e) {
      console.log(`✗ ${(e as Error).message}`); fail++; failed.push(label)
    }
    await sleep(800)
  }

  console.log(`\n=== Итог: ${ok} с фото, ${fail} без ===`)
  if (failed.length) console.log('Без фото:\n' + failed.map((f) => '  • ' + f).join('\n'))
  await app.close()
  process.exit(0)
}

main().catch((e) => { console.error('photos failed:', e); process.exit(1) })

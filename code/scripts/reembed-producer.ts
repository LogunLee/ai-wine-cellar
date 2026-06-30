/**
 * Admin/server-only: до-векторизация producer_description для бутылок, у которых
 * текст tech sheet записан напрямую в БД (минуя API), поэтому в wine_desc_chunk
 * ещё нет строк source='producer'.
 *
 *   npx ts-node scripts/reembed-producer.ts
 *
 * Идемпотентно: обрабатывает только позиции с producer_description и БЕЗ producer-чанков.
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/database/prisma.service'
import { KbIndexService } from '../src/modules/cellar-ai-search/kb-index.service'

const OWNER_EMAIL = 'logun_lee@mail.ru'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] })
  const prisma = app.get(PrismaService)
  const kbIndex = app.get(KbIndexService)

  const cellar = await prisma.wineCellar.findFirst({ where: { owner: { email: OWNER_EMAIL } } })
  if (!cellar) throw new Error(`Погреб ${OWNER_EMAIL} не найден`)

  const items = await prisma.cellarItem.findMany({
    where: { cellarId: cellar.id, deletedAt: null, status: 'IN_CELLAR', producerDescription: { not: null } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  // у кого уже есть producer-чанки — пропускаем
  const withChunks = await prisma.$queryRawUnsafe<{ cellar_item_id: string }[]>(
    `SELECT DISTINCT cellar_item_id FROM wine_desc_chunk WHERE source='producer'`,
  )
  const done = new Set(withChunks.map((r) => r.cellar_item_id))
  const todo = items.filter((it) => !done.has(it.id))

  console.log(`\n=== Re-embed producer: всего с tech sheet ${items.length}, нужно векторизовать ${todo.length} ===\n`)
  let ok = 0
  for (let i = 0; i < todo.length; i++) {
    const id = todo[i]
    process.stdout.write(`[${i + 1}/${todo.length}] ${id.id} … `)
    try {
      const r = await kbIndex.indexCellarItemDescriptions(id.id)
      console.log(`✓ ${r.chunks} чанков`)
      ok++
    } catch (e) {
      console.log(`✗ ${(e as Error).message}`)
    }
  }
  console.log(`\n=== Готово: ${ok}/${todo.length} ===`)
  await app.close()
  process.exit(0)
}

main().catch((e) => { console.error('reembed failed:', e); process.exit(1) })

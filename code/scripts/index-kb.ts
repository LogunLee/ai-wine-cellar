/**
 * Admin/server-only: embed the book knowledge base into pgvector.
 *
 *   npx ts-node scripts/index-kb.ts
 *
 * Prerequisites: pgvector installed + prisma/sql/0001_ai_search.sql applied +
 * VOYAGE_API_KEY set. Incremental — re-running only embeds new/changed chunks.
 * NOT exposed over HTTP; book ingestion is admin-only by design.
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { KbIndexService } from '../src/modules/cellar-ai-search/kb-index.service'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] })
  try {
    const svc = app.get(KbIndexService)
    const res = await svc.indexBooks()
    // eslint-disable-next-line no-console
    console.log('KB index done:', res)
  } finally {
    await app.close()
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('KB index failed:', e.message)
  process.exit(1)
})

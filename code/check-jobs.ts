import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const p = new PrismaClient({ adapter })
  const jobs = await p.scrapeJob.findMany({ orderBy: { createdAt: 'desc' }, take: 3 })
  for (const j of jobs) {
    console.log(`${j.storeId} | ${j.status} | found=${j.foundCount} | ${j.createdAt}`)
  }
  await p.$disconnect()
  await pool.end()
}
main()

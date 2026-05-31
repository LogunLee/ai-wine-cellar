import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
async function main() {
  const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const p = new PrismaClient({ adapter })
  const offers = await p.discountOffer.findMany({ select: { id: true, rawOfferId: true, wineNameRaw: true }, take: 200 })
  const rawIds = offers.map(o => o.rawOfferId ?? 'NULL')
  const uniqueRaw = new Set(rawIds)
  console.log(`Total offers: ${rawIds.length}, unique rawOfferId: ${uniqueRaw.size}`)
  if (rawIds.length !== uniqueRaw.size) {
    const counts: Record<string, number> = {}
    rawIds.forEach(id => { counts[id] = (counts[id] || 0) + 1 })
    const dupes = Object.entries(counts).filter(([, c]) => c > 1)
    console.log('Duplicate rawOfferId:', dupes.slice(0, 5))
  }
  await p.$disconnect()
  await pool.end()
}
main()

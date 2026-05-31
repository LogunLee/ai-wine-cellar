import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
async function main() {
  const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const p = new PrismaClient({ adapter })
  const stores = await p.store.findMany()
  for (const s of stores) {
    const rawCount = await p.rawOffer.count({ where: { storeId: s.id } })
    const discCount = await p.discountOffer.count({ where: { storeId: s.id } })
    console.log(`${s.name}: raw=${rawCount}, discount=${discCount}`)
  }
  await p.$disconnect()
  await pool.end()
}
main()

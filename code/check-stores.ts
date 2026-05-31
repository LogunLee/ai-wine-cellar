import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
async function main() {
  const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const p = new PrismaClient({ adapter })
  const stores = await p.store.findMany()
  console.log(JSON.stringify(stores.map(s => ({ id: s.id, name: s.name, code: s.code, active: s.active, lastSuccessAt: s.lastSuccessAt })), null, 2))
  await p.$disconnect()
  await pool.end()
}
main()

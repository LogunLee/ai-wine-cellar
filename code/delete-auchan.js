const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const auchan = await prisma.store.findFirst({ where: { code: 'auchan' } })
  if (auchan) {
    await prisma.rawOffer.deleteMany({ where: { storeId: auchan.id } })
    await prisma.discountOffer.deleteMany({ where: { storeId: auchan.id } })
    await prisma.scrapeJob.deleteMany({ where: { storeId: auchan.id } })
    await prisma.store.delete({ where: { id: auchan.id } })
    console.log('Deleted Auchan store and related data')
  } else {
    console.log('Auchan store not found')
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)

const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const metro = await prisma.store.findFirst({ where: { code: 'metro' } })
  if (metro) {
    await prisma.rawOffer.deleteMany({ where: { storeId: metro.id } })
    await prisma.discountOffer.deleteMany({ where: { storeId: metro.id } })
    await prisma.scrapeJob.deleteMany({ where: { storeId: metro.id } })
    console.log('Cleared all Metro data')
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)

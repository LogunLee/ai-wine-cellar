const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const fortwine = await prisma.store.findFirst({ where: { code: 'fortwine' } })
  if (fortwine) {
    const rawCount = await prisma.rawOffer.count({ where: { storeId: fortwine.id } })
    const discountCount = await prisma.discountOffer.count({ where: { storeId: fortwine.id } })
    const jobCount = await prisma.scrapeJob.count({ where: { storeId: fortwine.id } })
    console.log(`FortWine: ${rawCount} raw offers, ${discountCount} discount offers, ${jobCount} jobs`)

    await prisma.rawOffer.deleteMany({ where: { storeId: fortwine.id } })
    await prisma.discountOffer.deleteMany({ where: { storeId: fortwine.id } })
    await prisma.scrapeJob.deleteMany({ where: { storeId: fortwine.id } })
    console.log('Cleared all FortWine data')
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)

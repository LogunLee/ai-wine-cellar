const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  console.log('Recent jobs:')
  jobs.forEach(j => {
    console.log(`  ${j.id} | store: ${j.storeId} | started: ${j.startedAt} | finished: ${j.finishedAt} | error: ${j.errorMessage}`)
  })

  const rawOffers = await prisma.rawOffer.count({
    where: {
      scrapeJob: {
        store: {
          code: 'fortwine'
        }
      }
    }
  })
  console.log(`\nFortWine raw offers: ${rawOffers}`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)

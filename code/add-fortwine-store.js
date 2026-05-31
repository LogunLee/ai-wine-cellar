const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const stores = await prisma.store.findMany({
    orderBy: { code: 'asc' },
  })
  console.log('Existing stores:')
  stores.forEach(s => {
    console.log(`  ${s.code} | ${s.name} | ${s.baseUrl} | active: ${s.active}`)
  })

  const existing = stores.find(s => s.code === 'fortwine')
  if (existing) {
    console.log('\nFortWine already exists:', existing)
  } else {
    const newStore = await prisma.store.create({
      data: {
        name: 'FortWine',
        code: 'fortwine',
        baseUrl: 'https://fortwine.ru',
        active: true,
        parserType: 'playwright',
      },
    })
    console.log('\nCreated FortWine store:', newStore)
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)

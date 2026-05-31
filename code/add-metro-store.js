const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const existing = await prisma.store.findFirst({ where: { code: 'metro' } })
  if (existing) {
    console.log('Metro already exists:', existing)
  } else {
    const newStore = await prisma.store.create({
      data: {
        name: 'Metro',
        code: 'metro',
        baseUrl: 'https://online.metro-cc.ru',
        active: true,
        parserType: 'playwright',
      },
    })
    console.log('Created Metro store:', newStore)
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)

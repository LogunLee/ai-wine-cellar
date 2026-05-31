const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const offers = await prisma.discountOffer.findMany({
    where: {
      sellerName: 'FortWine'
    },
    take: 10,
    orderBy: { vintage: 'desc' },
  })

  console.log('FortWine discount offers (first 10):')
  offers.forEach((o, i) => {
    console.log(`\n--- ${i + 1} ---`)
    console.log(`Title: ${o.wineNameRaw}`)
    console.log(`Country: ${o.country}`)
    console.log(`Vintage: ${o.vintage}`)
    console.log(`Volume: ${o.volumeMl} ml`)
    console.log(`WineType: ${o.wineType}`)
    console.log(`Price: ${o.currentPrice} / ${o.oldPrice}`)
  })

  const stats = await prisma.discountOffer.groupBy({
    by: ['country'],
    where: { sellerName: 'FortWine' },
    _count: true,
    orderBy: { _count: { country: 'desc' } },
  })
  console.log('\n\nCountry stats:')
  stats.forEach(s => console.log(`  ${s.country}: ${s._count}`))

  const volumeStats = await prisma.discountOffer.groupBy({
    by: ['volumeMl'],
    where: { sellerName: 'FortWine' },
    _count: true,
    orderBy: { _count: { volumeMl: 'desc' } },
  })
  console.log('\nVolume stats:')
  volumeStats.forEach(s => console.log(`  ${s.volumeMl}ml: ${s._count}`))

  const vintageStats = await prisma.discountOffer.groupBy({
    by: ['vintage'],
    where: { sellerName: 'FortWine' },
    _count: true,
    orderBy: { _count: { vintage: 'desc' } },
  })
  console.log('\nVintage stats (top 10):')
  vintageStats.slice(0, 10).forEach(s => console.log(`  ${s.vintage}: ${s._count}`))

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)

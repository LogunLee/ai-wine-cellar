const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_wine_cellar' })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const raw = await prisma.rawOffer.findFirst({
    where: {
      store: { code: 'metro' },
      rawTitle: { contains: 'Matsu El Picaro' },
    },
  })

  if (raw) {
    console.log('=== RAW OFFER ===')
    console.log(`ID: ${raw.id}`)
    console.log(`Title: ${raw.rawTitle}`)
    console.log(`URL: ${raw.rawUrl}`)
    console.log(`Image: ${raw.rawImageUrl}`)
    console.log(`Current Price: ${raw.rawCurrentPrice}`)
    console.log(`Old Price: ${raw.rawOldPrice}`)
    console.log(`Discount %: ${raw.rawDiscountPercent}`)
    console.log(`Availability: ${raw.rawAvailability}`)
    console.log(`Payload JSON: ${JSON.stringify(raw.rawPayloadJson, null, 2)}`)
  } else {
    console.log('No raw offer found for "Matsu El Picaro"')
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)

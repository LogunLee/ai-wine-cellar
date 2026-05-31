import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const existing = await prisma.store.findFirst({
    where: { code: 'winelab' },
  })

  if (!existing) {
    await prisma.store.create({
      data: {
        name: 'WineLab',
        code: 'winelab',
        baseUrl: 'https://www.winelab.ru',
        parserType: 'playwright',
        scrapePeriodMinutes: 60,
        currency: 'RUB',
        country: 'RU',
        active: true,
        configJson: {
          sitemapUrl: 'https://www.winelab.ru/sitemap.xml',
        },
      },
    })
    console.log('Created store: WineLab (winelab)')
  } else {
    console.log('Store already exists: winelab')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

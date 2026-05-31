import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const existing = await prisma.store.findFirst({
    where: { code: 'coolclever' },
  })

  if (!existing) {
    await prisma.store.create({
      data: {
        name: 'Отдохни - Тихие вина',
        code: 'coolclever',
        baseUrl: 'https://www.coolclever.ru',
        parserType: 'playwright',
        scrapePeriodMinutes: 60,
        currency: 'RUB',
        country: 'RU',
        active: true,
        configJson: {
          catalogPath: '/catalog/otdokhni/vino',
        },
      },
    })
    console.log('Created store: Отдохни - Тихие вина (coolclever)')
  } else {
    console.log('Store already exists: coolclever')
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

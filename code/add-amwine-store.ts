import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const existing = await prisma.store.findFirst({
    where: { code: 'amwine' },
  })

  if (!existing) {
    await prisma.store.create({
      data: {
        name: 'Ароматный Мир',
        code: 'amwine',
        baseUrl: 'https://amwine.ru',
        parserType: 'playwright',
        scrapePeriodMinutes: 60,
        currency: 'RUB',
        country: 'RU',
        active: true,
        configJson: {
          catalogPath: '/catalog/vino/',
        },
      },
    })
    console.log('Created store: Ароматный Мир (amwine)')
  } else {
    console.log('Store already exists: amwine')
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

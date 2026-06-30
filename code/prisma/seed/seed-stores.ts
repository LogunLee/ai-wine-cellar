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

  // ── Лента ──────────────────────────────────────────────────────────────────
  const lenta = await prisma.store.findFirst({ where: { code: 'lenta' } })
  if (!lenta) {
    await prisma.store.create({
      data: {
        name: 'Лента',
        code: 'lenta',
        baseUrl: 'https://lenta.com',
        parserType: 'playwright',
        scrapePeriodMinutes: 60,
        currency: 'RUB',
        country: 'RU',
        active: true,
        // Категории можно переопределить здесь; пусто → дефолтные в lenta.scraper.ts
        // (Красное/Белое/Розовое/Крепленое). Игристое добавляется сюда, когда
        // станет известен его categoryId: { id: <N>, label: 'Игристое', wineType: 'SPARKLING' }.
        configJson: { categories: [] },
      },
    })
    console.log('Created store: Лента (lenta)')
  } else {
    console.log('Store already exists: lenta')
  }

  // ── Глобус ───────────────────────────────────────────────────────────────────
  // Внимание: каталог Глобуса доступен только с российского IP (гео-блок).
  const globus = await prisma.store.findFirst({ where: { code: 'globus' } })
  if (!globus) {
    await prisma.store.create({
      data: {
        name: 'Глобус',
        code: 'globus',
        baseUrl: 'https://online.globus.ru',
        parserType: 'playwright',
        scrapePeriodMinutes: 60,
        currency: 'RUB',
        country: 'RU',
        active: true,
        // Пусто → дефолтная категория «Вино» в globus.scraper.ts. Доп. категории:
        // { categoryId: <N>, urlPath: '/catalog/alkogol-1225631/<slug>-<N>/', label: '...' }
        configJson: { categories: [] },
      },
    })
    console.log('Created store: Глобус (globus)')
  } else {
    console.log('Store already exists: globus')
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

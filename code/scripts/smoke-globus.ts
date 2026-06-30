/* Smoke-тест GlobusScraper без БД, с ТВОЕГО российского IP (VPN выключен).
   Запуск из папки code:
     npx ts-node --transpile-only scripts/smoke-globus.ts
   Печатает скидочные офферы (1 страница). */
import type { Store } from '@prisma/client'
import { GlobusScraper } from '../src/modules/discounts/scraper/globus.scraper'

const store = {
  id: 'smoke', name: 'Глобус', code: 'globus', baseUrl: 'https://online.globus.ru',
  configJson: { categories: [] }, // дефолтная категория «Вино»
} as unknown as Store

;(async () => {
  process.env.SCRAPER_MAX_PAGES = process.env.SCRAPER_MAX_PAGES || '1'
  const { offers } = await new GlobusScraper().scrape(store, 'smoke-job')
  console.log(`\n=== ${offers.length} скидочных офферов ===`)
  offers.slice(0, 12).forEach((o) => {
    const p = o.rawPayload as any
    console.log(
      `${o.title.slice(0, 44).padEnd(45)} | now ${o.currentPrice} | was ${o.oldPrice} | -${o.discountPercent ?? '?'}% | ${p.wineType} | ${p.country ?? '—'}`,
    )
  })
  process.exit(0)
})().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1) })

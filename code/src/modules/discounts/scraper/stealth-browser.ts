import { chromium } from 'playwright'
import { chromium as chromiumExtra } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

chromiumExtra.use(StealthPlugin())

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
]

export interface StealthContext {
  userAgent: string
}

export async function createStealthBrowser(): Promise<{ browser: import('playwright').Browser; contextOptions: import('playwright').BrowserContextOptions }> {
  const browser = await chromiumExtra.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--lang=ru-RU',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  })

  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

  const contextOptions = {
    userAgent,
    viewport: { width: 1920, height: 1080 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    extraHTTPHeaders: {
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Sec-CH-UA': userAgent.match(/Chrome\/(\d+)/)?.[1] ? `"Chromium";v="${userAgent.match(/Chrome\/(\d+)/)?.[1]}", "Google Chrome";v="${userAgent.match(/Chrome\/(\d+)/)?.[1]}"` : '',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  }

  return { browser, contextOptions }
}

export function jitter(baseMs: number, maxJitterMs: number = 10000): number {
  return baseMs + Math.floor(Math.random() * maxJitterMs)
}

export async function humanScroll(page: import('playwright').Page, steps: number = 5): Promise<void> {
  await page.evaluate(async (s) => {
    const doc = document.documentElement
    const totalHeight = doc.scrollHeight - window.innerHeight
    const step = totalHeight / s
    for (let i = 0; i <= s; i++) {
      window.scrollTo(0, Math.min(i * step, totalHeight))
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 800))
    }
  }, steps)
}

export async function randomDelay(page: import('playwright').Page, baseMs: number = 30000, maxJitterMs: number = 10000): Promise<void> {
  const delay = jitter(baseMs, maxJitterMs)
  await page.waitForTimeout(delay)
}

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromium.use(stealth());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  // Intercept ALL responses and log JSON ones
  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';
    
    if (contentType.includes('json') && url.includes('perekrestok')) {
      console.log(`\n[${status}] ${url.substring(0, 150)}`);
      try {
        const data = await response.json();
        const keys = Object.keys(data);
        console.log(`  Keys: ${keys.slice(0, 20).join(', ')}`);
        if (data.content?.items) console.log(`  items: ${data.content.items.length}`);
        if (data.content?.products) console.log(`  products: ${data.content.products.length}`);
      } catch {}
    }
  });

  console.log('Visiting homepage...');
  await page.goto('https://www.perekrestok.ru', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);

  // Check if we're on captcha page
  const title = await page.title();
  console.log(`Homepage title: ${title}`);

  if (title && title.includes('бот')) {
    console.log('Captcha detected on homepage. Trying to solve...');
    // Wait for captcha page to potentially auto-solve
    await page.waitForTimeout(30000);
  }

  console.log('\nVisiting wine catalog...');
  await page.goto('https://www.perekrestok.ru/cat/c/2/vino', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(20000);

  const catalogTitle = await page.title();
  console.log(`Catalog title: ${catalogTitle}`);

  const htmlLength = await page.content().then(c => c.length);
  console.log(`HTML length: ${htmlLength}`);

  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log(`Body text:\n${bodyText}`);

  await browser.close();
  console.log('\nDone');
  process.exit(0);
})();

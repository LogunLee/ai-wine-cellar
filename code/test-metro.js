const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  console.log('Checking pages 1, 10, 20, 30, 38 for prices...');
  for (const p of [1, 10, 20, 30, 38]) {
    const url = p === 1 ? 'https://online.metro-cc.ru/category/alkogolnaya-produkciya/vino' : `https://online.metro-cc.ru/category/alkogolnaya-produkciya/vino?page=${p}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const stats = await page.evaluate(() => {
      const cards = document.querySelectorAll('.catalog-2-level-product-card');
      let withPrice = 0;
      let withDiscount = 0;
      let total = 0;
      cards.forEach(card => {
        const link = card.querySelector('a[href*="/products/"]');
        if (!link) return;
        total++;
        const priceEl = card.querySelector('.product-unit-prices__actual .product-price__sum-rubles');
        if (priceEl) withPrice++;
        const discountEl = card.querySelector('.product-discount');
        if (discountEl) withDiscount++;
      });
      return { total, withPrice, withDiscount };
    });
    console.log(`Page ${p}: ${stats.total} products, ${stats.withPrice} with prices, ${stats.withDiscount} with discounts`);
  }

  await browser.close();
  process.exit(0);
})();

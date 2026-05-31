const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  // Check pages 2-5 for discounts
  for (let p = 2; p <= 5; p++) {
    const url = `https://fortwine.ru/vino/?PAGEN_1=${p}`;
    console.log(`\n--- Page ${p}: ${url} ---`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    const stats = await page.evaluate(() => {
      const cards = document.querySelectorAll('.product_card');
      let withOldPrice = 0;
      let withSale = 0;
      const examples = [];
      
      cards.forEach((card, i) => {
        const oldPrice = card.querySelector('.old_price');
        const sale = card.querySelector('.sale');
        if (oldPrice) {
          withOldPrice++;
          if (examples.length < 2) {
            examples.push({
              name: card.querySelector('.name')?.textContent.trim(),
              price: card.querySelector('.price')?.textContent.trim(),
              oldPrice: oldPrice.textContent.trim(),
            });
          }
        }
        if (sale) withSale++;
      });
      
      return { total: cards.length, withOldPrice, withSale, examples };
    });
    
    console.log(`Total: ${stats.total}, With old price: ${stats.withOldPrice}, With sale: ${stats.withSale}`);
    if (stats.examples.length > 0) {
      console.log('Examples:', stats.examples);
    }
  }

  await browser.close();
  process.exit(0);
})();

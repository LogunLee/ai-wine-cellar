require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://amwine.ru/catalog/vino/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Get first 2 products only
  const products = await page.evaluate(() => {
    return window.products.slice(0, 2);
  });
  
  console.log('=== RAW PRODUCT DATA (first 2 products) ===');
  console.log(JSON.stringify(products, null, 2));
  
  await browser.close();
})();

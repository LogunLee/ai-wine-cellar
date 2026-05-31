require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://amwine.ru/catalog/vino/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Get window.products data
  const productsData = await page.evaluate(() => {
    return window.products;
  });
  
  console.log('Total products on page:', productsData ? productsData.length : 0);
  
  if (productsData && productsData.length > 0) {
    console.log('\n=== First 3 products RAW DATA ===');
    productsData.slice(0, 3).forEach((p, i) => {
      console.log('\n--- Product ' + (i+1) + ' ---');
      console.log(JSON.stringify(p, null, 2));
    });
  }
  
  // Check pagination
  const pagination = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('[class*=\"page\"], [class*=\"pagination\"] a'));
    return pages.map(p => ({ text: p.textContent, href: p.href })).slice(0, 10);
  });
  console.log('\n=== Pagination ===');
  console.log(JSON.stringify(pagination, null, 2));
  
  // Check catalogProps for filters
  const catalogProps = await page.evaluate(() => {
    return window.catalogProps;
  });
  console.log('\n=== Catalog Props (filters) ===');
  console.log(JSON.stringify(catalogProps, null, 2));
  
  await browser.close();
})();

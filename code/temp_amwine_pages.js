require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://amwine.ru/catalog/vino/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Check pagination
  const pagination = await page.evaluate(() => {
    const nav = document.querySelector('[class*=\"nav\"], [class*=\"pagination\"]');
    const links = Array.from(document.querySelectorAll('a[href*=\"PAGEN\"]'));
    return {
      totalLinks: links.length,
      lastPage: links[links.length - 1]?.href,
      currentPage: document.querySelector('[class*=\"active\"]')?.textContent,
    };
  });
  console.log('Pagination:', JSON.stringify(pagination, null, 2));
  
  // Check if there's an API for pagination
  const page2Url = 'https://amwine.ru/catalog/vino/?PAGEN_1=2';
  await page.goto(page2Url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  const page2Products = await page.evaluate(() => {
    return window.products ? window.products.length : 0;
  });
  console.log('Page 2 products count:', page2Products);
  
  const page2First = await page.evaluate(() => {
    return window.products ? window.products[0] : null;
  });
  console.log('Page 2 first product:', JSON.stringify(page2First, null, 2));
  
  await browser.close();
})();

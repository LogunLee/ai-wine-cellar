require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.winelab.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const modal = document.getElementById('age-confirm-modal');
    if (modal) modal.remove();
    const overlay = document.querySelector('.w-modal__overlay');
    if (overlay) overlay.remove();
  });
  
  await page.goto('https://www.winelab.ru/sitemap.xml', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const content = await page.content();
  const codes = content.match(/product\/(\d{7})/g) || [];
  const uniqueCodes = [...new Set(codes.map(c => c.replace('product/', '')))];
  
  // Fetch first batch (20 codes)
  const batch = uniqueCodes.slice(0, 20);
  const data = await page.evaluate(async (codes) => {
    const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return await resp.json();
  }, batch);
  
  console.log('=== RAW API RESPONSE (1 batch, 20 codes) ===');
  console.log('Is array: ' + Array.isArray(data));
  console.log('Length: ' + data.length);
  console.log('\n');
  console.log(JSON.stringify(data, null, 2));
  
  await browser.close();
})();

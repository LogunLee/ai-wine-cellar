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
  
  // Test sizes between 20 and 50
  const sizes = [25, 30, 35, 40, 45];
  
  for (const size of sizes) {
    const batch = uniqueCodes.slice(0, size);
    const result = await page.evaluate(async (codes) => {
      const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      return {
        status: resp.status,
        ok: resp.ok,
        length: resp.ok ? (await resp.json()).length : 0
      };
    }, batch);
    
    console.log('Batch size: ' + size + ' -> Status: ' + result.status + ', OK: ' + result.ok + ', Returned: ' + result.length);
  }
  
  await browser.close();
})();

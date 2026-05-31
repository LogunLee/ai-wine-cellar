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
  
  // Fetch first batch
  const batch = uniqueCodes.slice(0, 20);
  const data = await page.evaluate(async (codes) => {
    const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return await resp.json();
  }, batch);
  
  // Search for 1332 in all values
  function searchForValue(obj, path = '', target = 1332) {
    if (!obj) return;
    if (typeof obj === 'number') {
      if (Math.abs(obj - target) < 5 || Math.abs(obj - target * 100) < 500) {
        console.log('FOUND number at ' + path + ': ' + obj);
      }
    } else if (typeof obj === 'string') {
      if (obj.includes('1332') || obj.includes('1 332')) {
        console.log('FOUND string at ' + path + ': ' + obj);
      }
    } else if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        searchForValue(obj[key], path + '.' + key, target);
      }
    }
  }
  
  data.forEach((p, i) => {
    console.log('\n=== Product ' + (i+1) + ': ' + p.name + ' ===');
    console.log('price.value: ' + p.price?.value);
    console.log('discount: ' + p.discount);
    console.log('volumePrices: ' + JSON.stringify(p.volumePrices));
    console.log('priceRange: ' + JSON.stringify(p.priceRange));
    console.log('bestPrice: ' + JSON.stringify(p.bestPrice));
    console.log('bestOffer: ' + JSON.stringify(p.bestOffer));
    
    // Search for 1332
    searchForValue(p, '', 1332);
  });
  
  await browser.close();
})();

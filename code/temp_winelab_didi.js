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
  
  // Find code for Диди Дарбаисели
  const batch = uniqueCodes.slice(0, 20);
  const data = await page.evaluate(async (codes) => {
    const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return await resp.json();
  }, batch);
  
  // Find Диди Дарбаисели
  const didi = data.find(p => p.name && p.name.includes('Диди Дарбаисели'));
  if (didi) {
    console.log('=== Диди Дарбаисели RAW DATA ===');
    console.log('name:', didi.name);
    console.log('country:', didi.country);
    console.log('countryProduct:', didi.countryProduct);
    console.log('categories:', JSON.stringify(didi.categories));
    console.log('breadcrumbProduct:', JSON.stringify(didi.breadcrumbProduct));
    console.log('manufacturer:', didi.manufacturer);
    console.log('winLabManufacturer:', didi.winLabManufacturer);
    console.log('brand:', JSON.stringify(didi.brand));
    
    // Search for Грузия anywhere in the object
    console.log('\n=== Searching for Грузия ===');
    function searchForStr(obj, path = '', target = 'Грузия') {
      if (!obj) return;
      if (typeof obj === 'string' && obj.includes(target)) {
        console.log('FOUND at ' + path + ': ' + obj);
      } else if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          searchForStr(obj[key], path + '.' + key, target);
        }
      }
    }
    searchForStr(didi);
  } else {
    console.log('Product not found in first batch');
  }
  
  await browser.close();
})();

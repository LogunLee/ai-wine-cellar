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
  console.log('Unique product codes: ' + uniqueCodes.length);
  
  const batch = uniqueCodes.slice(0, 20);
  const products = await page.evaluate(async (codes) => {
    const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return await resp.json();
  }, batch);
  
  const first = Object.values(products)[0];
  const name = first.name;
  console.log('First char code: ' + name.charCodeAt(0) + ' (Cyrillic V=1042)');
  console.log('First 4 char codes: ' + [...name].slice(0, 4).map(c => c.charCodeAt(0)).join(','));
  
  // Unicode regex for Cyrillic words
  const wineRegex = /^[\u0412\u0432]\u0438\u043d\u043e/i;
  const portRegex = /^[\u041f\u043f]\u043e\u0440\u0442\u0432\u0435\u0439\u043d/i;
  const vermouthRegex = /^[\u0412\u0432]\u0435\u0440\u043c\u0443\u0442/i;
  const sparklingRegex = /[\u0438\u0418]\u0433\u0440\u0438\u0441\u0442\u043e\u0435|[\u0428\u0448]\u0430\u043c\u043f\u0430\u043d\u0441\u043a\u043e\u0435/i;
  
  let wineCount = 0;
  let totalCount = 0;
  const wineNames = [];
  
  for (let i = 0; i < uniqueCodes.length; i += 20) {
    const batch = uniqueCodes.slice(i, i + 20);
    try {
      const products = await page.evaluate(async (codes) => {
        const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        return await resp.json();
      }, batch);
      
      Object.values(products).forEach(p => {
        totalCount++;
        const name = p.name || '';
        const isWine = wineRegex.test(name) || portRegex.test(name) || vermouthRegex.test(name) || sparklingRegex.test(name);
        if (isWine) {
          wineCount++;
          if (wineNames.length < 10) wineNames.push(name);
        }
      });
    } catch (e) {}
    
    if ((i + 20) % 400 === 0 || i + 20 >= uniqueCodes.length) {
      console.log('Processed ' + Math.min(i + 20, uniqueCodes.length) + '/' + uniqueCodes.length + ', wine: ' + wineCount + ', total: ' + totalCount);
    }
  }
  
  console.log('\n=== Results ===');
  console.log('Total fetched: ' + totalCount);
  console.log('Wine products: ' + wineCount);
  console.log('\nSample wines:');
  wineNames.forEach(n => console.log('  ' + n));
  
  await browser.close();
})();

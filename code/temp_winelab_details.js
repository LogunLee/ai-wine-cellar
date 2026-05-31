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
  
  const wineRegex = /^[\u0412\u0432]\u0438\u043d\u043e/i;
  const portRegex = /^[\u041f\u043f]\u043e\u0440\u0442\u0432\u0435\u0439\u043d/i;
  const vermouthRegex = /^[\u0412\u0432]\u0435\u0440\u043c\u0443\u0442/i;
  const sparklingRegex = /[\u0438\u0418]\u0433\u0440\u0438\u0441\u0442\u043e\u0435|[\u0428\u0448]\u0430\u043c\u043f\u0430\u043d\u0441\u043a\u043e\u0435/i;
  
  let wineCodes = [];
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
        const name = p.name || '';
        const isWine = wineRegex.test(name) || portRegex.test(name) || vermouthRegex.test(name) || sparklingRegex.test(name);
        if (isWine) wineCodes.push(p.code);
      });
    } catch (e) {}
  }
  
  console.log('Wine codes found: ' + wineCodes.length);
  
  // Fetch first 5 wine products with full details
  console.log('\n=== First 5 wine products - full details ===');
  const first5 = wineCodes.slice(0, 5);
  const details = await page.evaluate(async (codes) => {
    const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return await resp.json();
  }, first5);
  
  Object.values(details).forEach((p, i) => {
    console.log('\n--- Product ' + (i+1) + ' ---');
    console.log('Code: ' + p.code);
    console.log('Name: ' + p.name);
    console.log('Price: ' + JSON.stringify(p.price));
    console.log('Old Price: ' + JSON.stringify(p.oldPrice));
    console.log('Description: ' + (p.description || 'N/A').substring(0, 200));
    console.log('Keywords: ' + JSON.stringify(p.keywords));
    console.log('Categories: ' + JSON.stringify(p.categories));
    console.log('SuperCategory: ' + JSON.stringify(p.superCategory));
    console.log('FirstCategoryNameList: ' + JSON.stringify(p.firstCategoryNameList));
    console.log('RootNavigationCategories: ' + JSON.stringify(p.rootNavigationCategories));
    console.log('Classifications: ' + JSON.stringify(p.classifications));
    console.log('Attributes: ' + JSON.stringify(p.attributes));
    console.log('Full keys: ' + Object.keys(p).join(', '));
  });
  
  await browser.close();
})();

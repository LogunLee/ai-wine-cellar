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
  
  // Parse sitemap
  await page.goto('https://www.winelab.ru/sitemap.xml', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const content = await page.content();
  const codes = content.match(/product\/(\d{7})/g) || [];
  const uniqueCodes = [...new Set(codes.map(c => c.replace('product/', '')))];
  console.log('Total codes in sitemap: ' + uniqueCodes.length);
  
  // Wine regex
  const wineRegex = /^[\u0412\u0432]\u0438\u043d\u043e/i;
  const portRegex = /^[\u041f\u043f]\u043e\u0440\u0442\u0432\u0435\u0439\u043d/i;
  const vermouthRegex = /^[\u0412\u0432]\u0435\u0440\u043c\u0443\u0442/i;
  const sparklingRegex = /[\u0438\u0418]\u0433\u0440\u0438\u0441\u0442\u043e\u0435|[\u0428\u0448]\u0430\u043c\u043f\u0430\u043d\u0441\u043a\u043e\u0435/i;
  
  const wines = [];
  let totalProcessed = 0;
  let totalFetched = 0;
  
  // Test: first 10 batches (200 codes)
  for (let i = 0; i < 200 && i < uniqueCodes.length; i += 20) {
    const batch = uniqueCodes.slice(i, i + 20);
    
    const data = await page.evaluate(async (codes) => {
      const resp = await fetch('/productdata/populateProduct?productCodes=' + codes.join(','), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      return await resp.json();
    }, batch);
    
    totalProcessed += batch.length;
    totalFetched += data.length;
    
    data.forEach(p => {
      const name = p.name || '';
      const isWine = wineRegex.test(name) || portRegex.test(name) || vermouthRegex.test(name) || sparklingRegex.test(name);
      if (isWine) {
        wines.push({
          code: p.code,
          name: p.name,
          price: p.price?.value,
          discount: p.discount ? JSON.stringify(p.discount) : null,
          categories: p.categories?.map(c => c.name).join(', '),
          manufacturer: p.manufacturer,
          country: p.country,
          countryProduct: p.countryProduct,
          alcoholContent: p.alcoholContent,
          stickers: p.stickers,
          potentialPromotions: p.potentialPromotions?.length || 0
        });
      }
    });
    
    console.log('Batch ' + (Math.floor(i/20) + 1) + '/10: processed ' + batch.length + ', fetched ' + data.length + ', wines found: ' + wines.length);
    
    // 30 sec pause between batches
    if (i + 20 < 200) {
      console.log('  Waiting 30s...');
      await page.waitForTimeout(30000);
    }
  }
  
  console.log('\n=== Results ===');
  console.log('Total processed: ' + totalProcessed);
  console.log('Total fetched: ' + totalFetched);
  console.log('Wines found: ' + wines.length);
  console.log('\nSample wines:');
  wines.slice(0, 5).forEach((w, i) => {
    console.log((i+1) + '. ' + w.name);
    console.log('   Price: ' + w.price + ', Categories: ' + w.categories);
  });
  
  await browser.close();
})();

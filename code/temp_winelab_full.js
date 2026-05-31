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
  
  // Fetch a batch with multiple products to check response format
  const data = await page.evaluate(async () => {
    const resp = await fetch('/productdata/populateProduct?productCodes=1019959,1019953,1019954', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return await resp.json();
  });
  
  console.log('Is array: ' + Array.isArray(data));
  console.log('Length: ' + data.length);
  
  // Check each product
  data.forEach((p, i) => {
    console.log('\n--- Product ' + (i+1) + ' ---');
    console.log('Name: ' + p.name);
    console.log('Code: ' + p.code);
    console.log('Manufacturer: ' + JSON.stringify(p.manufacturer));
    console.log('Country: ' + JSON.stringify(p.country));
    console.log('CountryProduct: ' + JSON.stringify(p.countryProduct));
    console.log('WinLabManufacturer: ' + JSON.stringify(p.winLabManufacturer));
    console.log('AlcoholContent: ' + JSON.stringify(p.alcoholContent));
    console.log('Summary: ' + JSON.stringify(p.summary));
    console.log('Description: ' + JSON.stringify(p.description));
    console.log('Brand: ' + JSON.stringify(p.brand));
    console.log('Stickers: ' + JSON.stringify(p.stickers));
    console.log('Sommelier: ' + JSON.stringify(p.sommelier));
    console.log('Consumption: ' + JSON.stringify(p.consumption));
    console.log('MetaDescription: ' + JSON.stringify(p.metaDescription));
    console.log('EAN: ' + JSON.stringify(p.ean));
    console.log('Price: ' + JSON.stringify(p.price));
    console.log('Discount: ' + JSON.stringify(p.discount));
    console.log('Categories: ' + JSON.stringify(p.categories));
    console.log('PotentialPromotions: ' + JSON.stringify(p.potentialPromotions));
    console.log('VariantOptions: ' + JSON.stringify(p.variantOptions));
    console.log('Classifications: ' + JSON.stringify(p.classifications));
    console.log('Reviews: ' + JSON.stringify(p.reviews));
    
    // Search for grape info in all values
    console.log('\n=== Searching for grape/variety info in values ===');
    function searchForGrape(obj, path = '') {
      if (!obj) return;
      if (typeof obj === 'string') {
        const lower = obj.toLowerCase();
        if (lower.includes('grape') || lower.includes('sort') || lower.includes('variety') || 
            lower.includes('\u0432\u0438\u043d\u043e\u0433\u0440\u0430\u0434') || // виноград
            lower.includes('\u0441\u043e\u0440\u0442')) { // сорт
          console.log('FOUND at ' + path + ': ' + obj.substring(0, 200));
        }
      } else if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          searchForGrape(obj[key], path + '.' + key);
        }
      }
    }
    searchForGrape(p);
  });
  
  await browser.close();
})();

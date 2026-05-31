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
  
  const data = await page.evaluate(async () => {
    const resp = await fetch('/productdata/populateProduct?productCodes=1019959', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return await resp.json();
  });
  
  console.log('Response type: ' + typeof data);
  console.log('Is array: ' + Array.isArray(data));
  console.log('Keys: ' + JSON.stringify(Object.keys(data)));
  
  if (Object.keys(data).length > 0) {
    const firstKey = Object.keys(data)[0];
    console.log('First key: ' + firstKey);
    const product = data[firstKey];
    console.log('Product name: ' + product.name);
    console.log('Product keys: ' + Object.keys(product).join(', '));
  }
  
  await browser.close();
})();

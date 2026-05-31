require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://amwine.ru/catalog/vino/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Get the full HTML of the first product card that contains "Elmstone"
  const cardHtml = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('*'));
    const elmstone = allElements.find(el => el.textContent && el.textContent.includes('Elmstone Marlborough'));
    if (!elmstone) return null;
    
    // Find the parent card container
    let parent = elmstone;
    for (let i = 0; i < 10; i++) {
      if (parent.parentElement) parent = parent.parentElement;
      else break;
    }
    return parent.outerHTML.substring(0, 2000);
  });
  console.log('=== Product card HTML ===');
  console.log(cardHtml);
  
  // Also check catalogProps for country mapping
  const countries = await page.evaluate(() => {
    return window.catalogProps?.country;
  });
  console.log('\n=== Country mapping in catalogProps ===');
  console.log(JSON.stringify(countries, null, 2));
  
  await browser.close();
})();

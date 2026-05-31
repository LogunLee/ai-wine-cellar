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
  
  // Check product page for detailed info
  const productUrl = 'https://www.winelab.ru/catalog/vino/product/1019959/';
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Get page content and look for structured data
  const pageContent = await page.content();
  
  // Check for JSON-LD
  const jsonLd = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    return Array.from(scripts).map(s => s.textContent);
  });
  console.log('JSON-LD scripts: ' + jsonLd.length);
  if (jsonLd.length > 0) {
    console.log('First JSON-LD: ' + jsonLd[0].substring(0, 500));
  }
  
  // Check for data attributes on product elements
  const productData = await page.evaluate(() => {
    const result = {};
    // Look for grape variety
    const grapeElements = document.querySelectorAll('[data-grape], .grape, [class*="grape"], [class*="sort"], [class*="variety"]');
    result.grapeElements = grapeElements.length;
    
    // Look for description
    const descElements = document.querySelectorAll('[class*="description"], [class*="desc"], [class*="info"]');
    result.descElements = Array.from(descElements).slice(0, 5).map(e => ({
      class: e.className,
      text: e.textContent?.substring(0, 100)
    }));
    
    // Look for characteristics
    const charElements = document.querySelectorAll('[class*="char"], [class*="param"], [class*="spec"], [class*="attribute"]');
    result.charElements = Array.from(charElements).slice(0, 5).map(e => ({
      class: e.className,
      text: e.textContent?.substring(0, 100)
    }));
    
    return result;
  });
  console.log('\nProduct page elements:');
  console.log(JSON.stringify(productData, null, 2));
  
  // Check API endpoints from network
  const apiCheck = await page.evaluate(async () => {
    try {
      // Try product details API
      const resp = await fetch('/product/1019959', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      return { status: resp.status, data: await resp.text().substring(0, 300) };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('\nProduct API: ' + JSON.stringify(apiCheck));
  
  // Check for additional fields in populateProduct
  const details = await page.evaluate(async () => {
    const resp = await fetch('/productdata/populateProduct?productCodes=1019959', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const data = await resp.json();
    const p = data['1019959'];
    return {
      manufacturer: p.manufacturer,
      country: p.country,
      countryProduct: p.countryProduct,
      winLabManufacturer: p.winLabManufacturer,
      alcoholContent: p.alcoholContent,
      summary: p.summary,
      description: p.description,
      brand: p.brand,
      stickers: p.stickers,
      sommelier: p.sommelier,
      consumption: p.consumption,
      metaDescription: p.metaDescription,
      ean: p.ean
    };
  });
  console.log('\nDetailed fields:');
  console.log(JSON.stringify(details, null, 2));
  
  await browser.close();
})();

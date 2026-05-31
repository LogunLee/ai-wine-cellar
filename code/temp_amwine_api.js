require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Intercept network requests to find API calls
  const apiRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api') || url.includes('graphql') || url.includes('json') || url.includes('ajax')) {
      apiRequests.push({ method: req.method(), url: url });
    }
  });
  
  await page.goto('https://amwine.ru/catalog/vino/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  console.log('=== API requests found ===');
  apiRequests.forEach(r => console.log(r.method, r.url));
  
  // Check page source for product data
  const pageContent = await page.content();
  
  // Look for JSON-LD or embedded data
  const jsonLd = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type=\"application/ld+json\"]');
    return Array.from(scripts).map(s => s.textContent);
  });
  console.log('\nJSON-LD scripts:', jsonLd.length);
  if (jsonLd.length > 0) console.log('First JSON-LD:', jsonLd[0].substring(0, 500));
  
  // Look for __NEXT_DATA__ or similar
  const embeddedData = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    const found = [];
    scripts.forEach(s => {
      const text = s.textContent || '';
      if (text.includes('window.__') || text.includes('__INITIAL') || text.includes('PRODUCTS') || text.includes('catalog')) {
        found.push({ id: s.id, src: s.src, textPreview: text.substring(0, 200) });
      }
    });
    return found;
  });
  console.log('\nEmbedded data scripts:', JSON.stringify(embeddedData, null, 2));
  
  // Check first product card structure
  const productCard = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*=\"product\"], [class*=\"card\"], [class*=\"item\"]');
    if (cards.length === 0) return null;
    const card = cards[0];
    return {
      className: card.className,
      innerHTML: card.innerHTML.substring(0, 500),
      textContent: card.textContent?.substring(0, 300),
    };
  });
  console.log('\nFirst product card:', JSON.stringify(productCard, null, 2));
  
  await browser.close();
})();

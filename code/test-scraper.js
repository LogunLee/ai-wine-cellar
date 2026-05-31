const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Go to homepage and handle popups
  await page.goto('https://www.coolclever.ru', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  const ageBtn = await page.$('button:has-text("Мне есть 18 лет")');
  if (ageBtn) { await ageBtn.click(); await page.waitForTimeout(1000); }
  
  const closeBtn = await page.$('button:has-text("Понятно")');
  if (closeBtn) { await closeBtn.click(); await page.waitForTimeout(1000); }
  
  // Navigate to wine catalog
  await page.goto('https://www.coolclever.ru/catalog/otdokhni/vino', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);
  
  // Extract detailed product info
  const products = await page.evaluate(() => {
    // Find all product card containers
    const cards = document.querySelectorAll('[class*="ProductCard"]');
    const results = [];
    
    cards.forEach(card => {
      const link = card.querySelector('a[href*="/catalog/product/"]');
      if (!link) return;
      
      const href = link.getAttribute('href');
      const title = link.textContent?.trim() || '';
      const img = card.querySelector('img');
      const imgUrl = img ? img.getAttribute('src') : null;
      
      // Get all text content and parse prices
      const fullText = card.textContent || '';
      const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
      
      // Find prices - look for numbers that look like prices
      const prices = [];
      for (const line of lines) {
        // Remove spaces and commas, look for price patterns
        const cleaned = line.replace(/\s/g, '').replace(',', '.');
        const match = cleaned.match(/^(\d+\.?\d*)$/);
        if (match) {
          const num = parseFloat(match[1]);
          if (num > 50 && num < 100000) {
            prices.push(num);
          }
        }
      }
      
      // Check for discount indicators
      const hasDiscount = fullText.includes('%') && (fullText.includes('скидка') || fullText.includes('-'));
      
      results.push({
        href,
        title: title.substring(0, 200),
        imgUrl,
        prices,
        hasDiscount,
        fullText: fullText.substring(0, 500),
      });
    });
    
    return results.slice(0, 5);
  });
  
  console.log('=== PRODUCTS ===');
  products.forEach((p, i) => {
    console.log(`\n${i + 1}. ${p.title}`);
    console.log(`   URL: ${p.href}`);
    console.log(`   Image: ${p.imgUrl}`);
    console.log(`   Prices: ${JSON.stringify(p.prices)}`);
    console.log(`   Full text: ${p.fullText}`);
  });
  
  await browser.close();
})().catch(e => console.error(e));

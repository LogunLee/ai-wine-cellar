require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://amwine.ru/catalog/vino/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Check page structure
  const pageInfo = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      hasProducts: document.querySelectorAll('[class*="product"], [class*="card"], [class*="item"]').length,
      hasPagination: document.querySelectorAll('[class*="pagination"], [class*="page"]').length,
      scripts: Array.from(document.querySelectorAll('script')).map(s => s.src).filter(Boolean).slice(0, 10),
    };
  });
  console.log('Page info:', JSON.stringify(pageInfo, null, 2));
  
  // Check for API calls in network
  const apiUrls = await page.evaluate(() => {
    // Look for XHR/fetch patterns
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
    const apiLinks = links.filter(l => l.includes('api') || l.includes('json') || l.includes('graphql'));
    return apiLinks;
  });
  console.log('\nAPI-like URLs:', JSON.stringify(apiUrls));
  
  // Check for sitemap
  try {
    await page.goto('https://amwine.ru/sitemap.xml', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const sitemapContent = await page.content();
    console.log('\nSitemap exists, length:', sitemapContent.length);
    console.log('First 500 chars:', sitemapContent.substring(0, 500));
  } catch (e) {
    console.log('\nNo sitemap.xml');
  }
  
  await browser.close();
})();

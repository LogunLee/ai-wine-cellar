require("dotenv").config();
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "ru-RU",
  });
  const page = await context.newPage();
  
  // Try sitemap
  console.log("=== Sitemap ===");
  try {
    const sitemapResp = await page.goto("https://www.winelab.ru/sitemap.xml", { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log(`Status: ${sitemapResp.status()}`);
    const content = await page.content();
    const vinoLinks = content.match(/vino[^<]*/g) || [];
    console.log(`Vino-related links: ${vinoLinks.length}`);
    vinoLinks.slice(0, 10).forEach(l => console.log(`  ${l}`));
    
    const productLinks = content.match(/product\/\d{7}/g) || [];
    console.log(`Product links in sitemap: ${productLinks.length}`);
    productLinks.slice(0, 5).forEach(l => console.log(`  ${l}`));
  } catch (e) {
    console.log(`Sitemap error: ${e.message}`);
  }
  
  // Try robots.txt
  console.log("\n=== Robots.txt ===");
  try {
    const robotsResp = await page.goto("https://www.winelab.ru/robots.txt", { waitUntil: "domcontentloaded", timeout: 30000 });
    const content = await page.content();
    console.log(content.substring(0, 1000));
  } catch (e) {}
  
  // Try to find the search results API by intercepting network
  console.log("\n=== Homepage with network interception ===");
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const modal = document.getElementById("age-confirm-modal");
    if (modal) modal.remove();
    const overlay = document.querySelector(".w-modal__overlay");
    if (overlay) overlay.remove();
  });
  
  // Try navigating to catalog via click on the menu link
  console.log("\n=== Clicking Vino menu link ===");
  const vinoLink = await page.$("a[href='/catalog/vino']");
  if (vinoLink) {
    console.log("Found /catalog/vino link, clicking...");
    await vinoLink.click({ timeout: 10000 });
    await page.waitForTimeout(10000);
    console.log(`URL: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);
    
    // Check for product codes
    const codes = await page.evaluate(() => {
      const html = document.body.innerHTML;
      const codes = new Set();
      const pattern = /product\/(\d{7})/g;
      let match;
      while ((match = pattern.exec(html)) !== null) codes.add(match[1]);
      return [...codes];
    });
    console.log(`Product codes: ${codes.length}`);
    
    // Check page content
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300));
    console.log(`Body: ${bodyText}`);
  }
  
  await browser.close();
})();

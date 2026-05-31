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
  
  console.log("=== Homepage ===");
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  
  // Try search page (returns HTML)
  console.log("\n=== Search page ===");
  const resp = await page.goto("https://www.winelab.ru/search?text=вино&pageSize=50", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(10000);
  console.log(`Status: ${resp.status()}, Title: ${await page.title()}`);
  
  // Check for product codes in the HTML
  const productCodes = await page.evaluate(() => {
    const html = document.body.innerHTML;
    const codes = new Set();
    // Look for product codes in data attributes or URLs
    const patterns = [
      /product\/(\d{7})/g,
      /productCode["']?\s*[:=]\s*["']?(\d{7})/g,
      /"code"\s*:\s*"(\d{7})"/g,
      /data-product-code=["']?(\d{7})/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        codes.add(match[1]);
      }
    }
    return [...codes].slice(0, 50);
  });
  console.log(`Found ${productCodes.length} product codes: ${productCodes.slice(0, 10).join(", ")}...`);
  
  // Try to get product data for these codes
  if (productCodes.length > 0) {
    console.log("\n=== Trying populateProduct with found codes ===");
    const codes = productCodes.slice(0, 20).join(",");
    const products = await page.evaluate(async (codes) => {
      const resp = await fetch(`/productdata/populateProduct?productCodes=${codes}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      return await resp.json();
    }, codes);
    console.log(`Got ${Object.keys(products).length} products`);
    if (products[0]) {
      console.log(`Product 0: ${products[0].name}`);
      console.log(`  Price: ${products[0].price?.value} ${products[0].price?.currencyIso}`);
      console.log(`  Country: ${products[0].country}`);
      console.log(`  Discount: ${JSON.stringify(products[0].discount)}`);
      console.log(`  Categories: ${JSON.stringify(products[0].categories?.slice(0, 3))}`);
      console.log(`  url: ${products[0].url}`);
    }
  }
  
  // Check for pagination on search page
  const pagination = await page.evaluate(() => {
    const els = document.querySelectorAll("[class*='page'], [class*='Page'], [class*='pagination']");
    return [...els].map(e => ({ class: e.className.substring(0, 80), text: e.textContent?.substring(0, 50) })).filter(e => e.text?.trim());
  });
  console.log(`\nPagination: ${JSON.stringify(pagination).substring(0, 300)}`);
  
  // Check for JSON-LD or embedded data
  const embeddedData = await page.evaluate(() => {
    const scripts = document.querySelectorAll("script[type='application/ld+json']");
    return [...scripts].map(s => s.textContent?.substring(0, 200));
  });
  console.log(`\nJSON-LD scripts: ${embeddedData.length}`);
  if (embeddedData.length > 0) console.log(`First: ${embeddedData[0]}`);
  
  // Check for window.__data or similar
  const globalData = await page.evaluate(() => {
    const keys = Object.keys(window).filter(k => k.includes("data") || k.includes("DATA") || k.includes("state") || k.includes("STATE"));
    return keys;
  });
  console.log(`\nGlobal data keys: ${globalData.join(", ")}`);
  
  await browser.close();
})();

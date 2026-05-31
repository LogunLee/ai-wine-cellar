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
  
  const apiCalls = [];
  page.on("response", async (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if (url.includes("winelab.ru") && ct.includes("json") && !url.includes("mindbox") && !url.includes("flocktory") && !url.includes("firebase") && !url.includes("indoleads") && !url.includes("uxfeedback")) {
      try {
        const body = await response.json();
        console.log(`RES ${response.status()}: ${url.substring(0, 150)}`);
        console.log(`  Keys: ${Object.keys(body || {}).slice(0, 15).join(", ")}`);
        if (Array.isArray(body) && body.length > 0) {
          console.log(`  [0] keys: ${Object.keys(body[0] || {}).slice(0, 15).join(", ")}`);
          if (body[0].name || body[0].title) console.log(`  [0] name/title: ${body[0].name || body[0].title}`);
          if (body[0].price) console.log(`  [0] price: ${JSON.stringify(body[0].price)}`);
        }
        console.log();
      } catch (e) {}
    }
  });
  
  console.log("=== Loading homepage ===\n");
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(10000);
  
  console.log("\n=== Loading catalog/vino ===\n");
  await page.goto("https://www.winelab.ru/catalog/vino/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(15000);
  
  const title = await page.title();
  console.log(`\n=== Page title: ${title}`);
  
  // Check if blocked
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
  console.log(`Body text: ${bodyText}`);
  
  // Check for product elements
  const productCount = await page.evaluate(() => {
    const selectors = [
      '[class*="ProductCard"]',
      '[class*="product-card"]',
      '[class*="productCard"]',
      '[class*="catalog-item"]',
      '[class*="catalogItem"]',
      '[class*="good"]',
      '[class*="item"]',
    ];
    for (const sel of selectors) {
      const count = document.querySelectorAll(sel).length;
      if (count > 0) return `${sel}: ${count}`;
    }
    return "none found";
  });
  console.log(`\nProduct elements: ${productCount}`);
  
  // Check all class names that contain "product" or "card" or "catalog"
  const classNames = await page.evaluate(() => {
    const all = document.querySelectorAll("*");
    const found = new Set();
    all.forEach(el => {
      for (const cls of el.classList) {
        if (/product|card|catalog|item|good|wine/i.test(cls)) {
          found.add(cls);
        }
      }
    });
    return [...found].slice(0, 30);
  });
  console.log(`\nRelevant class names: ${classNames.join(", ")}`);
  
  await browser.close();
})();

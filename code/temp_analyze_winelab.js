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
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("api") || url.includes("graphql") || url.includes("catalog") || url.includes("product") || url.includes("vino") || url.includes("filter") || url.includes("search") || url.includes("query")) {
      apiCalls.push({ method: request.method(), url: url.substring(0, 200) });
    }
  });
  
  page.on("response", async (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if ((url.includes("api") || url.includes("graphql") || url.includes("catalog") || url.includes("product") || url.includes("filter") || url.includes("search") || url.includes("query")) && ct.includes("json")) {
      try {
        const body = await response.json();
        const keys = Object.keys(body || {});
        console.log(`RES ${response.status()}: ${url.substring(0, 120)}`);
        console.log(`  Keys: ${keys.slice(0, 10).join(", ")}`);
        if (body.data) {
          const dataKeys = Object.keys(body.data || {});
          console.log(`  data keys: ${dataKeys.slice(0, 10).join(", ")}`);
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
  
  console.log("\n=== Page title:", await page.title());
  console.log("=== H1:", await page.locator("h1").first().textContent().catch(() => "no h1"));
  
  // Check for Next.js / Nuxt / React
  const hasNext = await page.evaluate(() => !!window.__NEXT_DATA__);
  const hasNuxt = await page.evaluate(() => !!window.__NUXT__);
  console.log(`\n=== Next.js: ${hasNext}, Nuxt: ${hasNuxt}`);
  
  // Check page structure
  const html = await page.content();
  const hasJsonLd = html.includes("application/ld+json");
  const hasRedux = html.includes("__REDUX");
  console.log(`JSON-LD: ${hasJsonLd}, Redux: ${hasRedux}`);
  
  // Check for data attributes
  const dataAttrs = await page.evaluate(() => {
    const attrs = new Set();
    document.querySelectorAll("[data-*]").forEach(el => {
      for (const attr of el.attributes) {
        if (attr.name.startsWith("data-")) attrs.add(attr.name);
      }
    });
    return [...attrs].slice(0, 20);
  });
  console.log(`\nData attributes: ${dataAttrs.join(", ")}`);
  
  // Check product cards
  const cardCount = await page.evaluate(() => document.querySelectorAll("[class*='card'], [class*='product'], [class*='item']").length);
  console.log(`\nCard-like elements: ${cardCount}`);
  
  // Check for pagination
  const pagination = await page.evaluate(() => {
    const els = document.querySelectorAll("[class*='page'], [class*='pagination'], [class*='pager']");
    return [...els].map(e => ({ tag: e.tagName, class: e.className.substring(0, 80), text: e.textContent?.substring(0, 50) })).slice(0, 5);
  });
  console.log(`\nPagination elements: ${JSON.stringify(pagination)}`);
  
  await browser.close();
})();

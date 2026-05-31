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
  
  // Get sitemap content
  console.log("=== Getting sitemap ===");
  await page.goto("https://www.winelab.ru/sitemap.xml", { waitUntil: "domcontentloaded", timeout: 30000 });
  const content = await page.content();
  
  // Parse sitemap for vino category links
  const lines = content.split("\n");
  const vinoCategoryLinks = lines.filter(l => l.includes("catalog/vino") && !l.includes("product"));
  console.log(`\nVino category links: ${vinoCategoryLinks.length}`);
  vinoCategoryLinks.slice(0, 20).forEach(l => console.log(`  ${l.trim()}`));
  
  // Check for sitemap index
  const sitemapIndex = content.includes("<sitemapindex>");
  console.log(`\nSitemap index: ${sitemapIndex}`);
  
  if (sitemapIndex) {
    const sitemaps = content.match(/<loc>([^<]+)<\/loc>/g) || [];
    console.log(`Sitemap files: ${sitemaps.length}`);
    sitemaps.slice(0, 20).forEach(s => console.log(`  ${s}`));
  }
  
  // Get product codes from sitemap
  const productCodes = content.match(/product\/(\d{7})/g) || [];
  console.log(`\nTotal product codes: ${productCodes.length}`);
  console.log(`Sample: ${productCodes.slice(0, 10).join(", ")}`);
  
  // Try to get a few product details to check structure
  const codes = productCodes.slice(0, 20).map(c => c.replace("product/", "")).join(",");
  console.log(`\n=== Fetching product details ===`);
  const products = await page.evaluate(async (codes) => {
    const resp = await fetch(`/productdata/populateProduct?productCodes=${codes}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    return await resp.json();
  }, codes);
  
  console.log(`Got ${Object.keys(products).length} products`);
  Object.values(products).forEach((p, i) => {
    if (i >= 5) return;
    const prod = p;
    console.log(`\n${i+1}. ${prod.name}`);
    console.log(`   Price: ${prod.price?.value} ${prod.price?.currencyIso}`);
    console.log(`   Discount: ${prod.discount}`);
    console.log(`   Country: ${prod.country}`);
    console.log(`   url: ${prod.url}`);
    console.log(`   Categories: ${(prod.categories || []).map(c => c.name).join(", ")}`);
    console.log(`   volumePrices: ${JSON.stringify(prod.volumePrices?.slice(0, 2))}`);
    console.log(`   stickers: ${JSON.stringify(prod.stickers?.slice(0, 3))}`);
  });
  
  await browser.close();
})();

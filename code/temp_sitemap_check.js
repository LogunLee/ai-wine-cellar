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
  
  console.log("=== Getting sitemap ===");
  await page.goto("https://www.winelab.ru/sitemap.xml", { waitUntil: "domcontentloaded", timeout: 30000 });
  const content = await page.content();
  
  // Count all URLs
  const allUrls = content.match(/<loc>(https:\/\/www\.winelab\.ru\/[^<]+)<\/loc>/g) || [];
  console.log(`Total URLs in sitemap: ${allUrls.length}`);
  
  // Categorize
  const categories = content.match(/<loc>https:\/\/www\.winelab\.ru\/catalog\/[^<]+<\/loc>/g) || [];
  const products = content.match(/<loc>https:\/\/www\.winelab\.ru\/product\/\d{7}<\/loc>/g) || [];
  const others = allUrls.filter(u => !u.includes("/catalog/") && !u.includes("/product/"));
  
  console.log(`\nCatalog pages: ${categories.length}`);
  console.log(`Product pages: ${products.length}`);
  console.log(`Other pages: ${others.length}`);
  
  // Check catalog subcategories
  console.log("\n=== Catalog subcategories ===");
  const subcats = {};
  categories.forEach(c => {
    const match = c.match(/catalog\/([^\/]+)/);
    if (match) {
      const key = match[1];
      subcats[key] = (subcats[key] || 0) + 1;
    }
  });
  Object.entries(subcats).sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  /catalog/${k}: ${v}`));
  
  // Check if there are nested sitemaps
  const sitemapRefs = content.match(/<loc>(https:\/\/www\.winelab\.ru\/sitemap[^<]*\.xml)<\/loc>/g) || [];
  console.log(`\nNested sitemaps: ${sitemapRefs.length}`);
  sitemapRefs.forEach(s => console.log(`  ${s}`));
  
  // Check for product codes in vino-related categories
  const vinoCats = categories.filter(c => c.includes("vino") || c.includes("вин"));
  console.log(`\nVino-related catalog URLs: ${vinoCats.length}`);
  vinoCats.slice(0, 30).forEach(c => console.log(`  ${c.replace(/<loc>|<\/loc>/g, "")}`));
  
  await browser.close();
})();

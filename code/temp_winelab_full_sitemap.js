require("dotenv").config();
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Get main sitemap
  await page.goto("https://www.winelab.ru/sitemap.xml", { waitUntil: "domcontentloaded", timeout: 30000 });
  const content = await page.content();
  
  // Check for sitemap index
  if (content.includes("<sitemapindex>")) {
    console.log("=== Sitemap Index ===");
    const sitemaps = content.match(/<loc>([^<]+)<\/loc>/g) || [];
    console.log(`Found ${sitemaps.length} sitemaps:`);
    sitemaps.forEach(s => console.log(`  ${s.replace(/<loc>|<\/loc>/g, "")}`));
    
    // Fetch each sitemap and count products
    for (const sitemapUrl of sitemaps) {
      const url = sitemapUrl.replace(/<loc>|<\/loc>/g, "");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const sc = await page.content();
      const products = (sc.match(/<loc>https:\/\/www\.winelab\.ru\/product\/\d{7}<\/loc>/g) || []).length;
      const catalogs = (sc.match(/<loc>https:\/\/www\.winelab\.ru\/catalog\/([^<]+)<\/loc>/g) || []).length;
      console.log(`  ${url}: ${products} products, ${catalogs} catalogs`);
    }
  } else {
    // Single sitemap - count products
    const products = (content.match(/<loc>https:\/\/www\.winelab\.ru\/product\/\d{7}<\/loc>/g) || []).length;
    console.log(`Single sitemap: ${products} products`);
    
    // Get all product codes
    const codes = content.match(/product\/(\d{7})/g) || [];
    console.log(`Product codes: ${codes.length}`);
    
    // Fetch details for all products to check which are wine
    console.log("\n=== Fetching product details in batches ===");
    let wineCount = 0;
    let totalCount = 0;
    const allCodes = codes.map(c => c.replace("product/", ""));
    
    for (let i = 0; i < allCodes.length; i += 20) {
      const batch = allCodes.slice(i, i + 20);
      const products = await page.evaluate(async (codes) => {
        const resp = await fetch(`/productdata/populateProduct?productCodes=${codes.join(",")}`, {
          method: "GET",
          headers: { "Accept": "application/json" }
        });
        return await resp.json();
      }, batch);
      
      Object.values(products).forEach(p => {
        totalCount++;
        const prod = p;
        const name = prod.name || "";
        const cats = (prod.categories || []).map(c => c.name).join(", ").toLowerCase();
        const isWine = name.toLowerCase().includes("вино") || cats.includes("вино") || cats.includes("wine");
        if (isWine) wineCount++;
      });
      
      if ((i + 20) % 200 === 0 || i + 20 >= allCodes.length) {
        console.log(`Processed ${Math.min(i + 20, allCodes.length)}/${allCodes.length} products, wine: ${wineCount}`);
      }
    }
    
    console.log(`\nTotal: ${totalCount} products, Wine: ${wineCount}`);
  }
  
  await browser.close();
})();

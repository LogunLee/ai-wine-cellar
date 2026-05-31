require("dotenv").config();
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const modal = document.getElementById("age-confirm-modal");
    if (modal) modal.remove();
    const overlay = document.querySelector(".w-modal__overlay");
    if (overlay) overlay.remove();
  });
  
  // Get sitemap
  await page.goto("https://www.winelab.ru/sitemap.xml", { waitUntil: "domcontentloaded", timeout: 30000 });
  const content = await page.content();
  const codes = content.match(/product\/(\d{7})/g) || [];
  const uniqueCodes = [...new Set(codes.map(c => c.replace("product/", "")))];
  console.log(`Unique product codes: ${uniqueCodes.length}`);
  
  // Fetch ALL products in batches of 20
  console.log("\n=== Fetching all products ===");
  let wineCount = 0;
  let totalCount = 0;
  let failedBatches = 0;
  const wineNames = [];
  
  for (let i = 0; i < uniqueCodes.length; i += 20) {
    const batch = uniqueCodes.slice(i, i + 20);
    try {
      const products = await page.evaluate(async (codes) => {
        const resp = await fetch(`/productdata/populateProduct?productCodes=${codes.join(",")}`, {
          method: "GET",
          headers: { "Accept": "application/json" }
        });
        return await resp.json();
      }, batch);
      
      const keys = Object.keys(products);
      totalCount += keys.length;
      
      keys.forEach(key => {
        const p = products[key];
        const name = (p.name || "").toLowerCase();
        const cats = (p.categories || []).map(c => (c.name || "").toLowerCase()).join(" ");
        
        // Check if it's wine
        const isWine = name.startsWith("вино") || name.includes("винное") || cats.includes("вина") || cats.includes("вино") || name.includes("портвейн") || name.includes("вермут") || name.includes("игристое") || name.includes("шампанское");
        
        if (isWine) {
          wineCount++;
          wineNames.push(p.name);
        }
      });
    } catch (e) {
      failedBatches++;
    }
    
    if ((i + 20) % 400 === 0 || i + 20 >= uniqueCodes.length) {
      console.log(`Processed ${Math.min(i + 20, uniqueCodes.length)}/${uniqueCodes.length}, wine: ${wineCount}, total fetched: ${totalCount}, failed batches: ${failedBatches}`);
    }
  }
  
  console.log(`\n=== Results ===`);
  console.log(`Total unique codes: ${uniqueCodes.length}`);
  console.log(`Total products fetched: ${totalCount}`);
  console.log(`Wine products: ${wineCount}`);
  console.log(`Failed batches: ${failedBatches}`);
  console.log(`\nSample wine names:`);
  wineNames.slice(0, 10).forEach(n => console.log(`  ${n}`));
  
  await browser.close();
})();

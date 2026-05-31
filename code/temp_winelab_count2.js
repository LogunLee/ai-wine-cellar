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
  
  // Fetch first batch and check raw names
  console.log("=== First batch - checking raw names ===");
  const batch = uniqueCodes.slice(0, 20);
  const products = await page.evaluate(async (codes) => {
    const resp = await fetch(`/productdata/populateProduct?productCodes=${codes.join(",")}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    return await resp.json();
  }, batch);
  
  let wineCount = 0;
  Object.values(products).forEach((p, i) => {
    const name = p.name || "";
    const nameLower = name.toLowerCase();
    const isWine = nameLower.includes("вино") || nameLower.includes("портвейн") || nameLower.includes("вермут") || nameLower.includes("игристое") || nameLower.includes("шампанское");
    console.log(`${i+1}. "${name}" -> isWine: ${isWine}, lower: "${nameLower.substring(0, 30)}"`);
    if (isWine) wineCount++;
  });
  console.log(`\nWine in first 20: ${wineCount}`);
  
  // Now fetch all and count properly
  console.log("\n=== Fetching all ===");
  let totalWine = 0;
  let totalFetched = 0;
  
  for (let i = 0; i < uniqueCodes.length; i += 20) {
    const batch = uniqueCodes.slice(i, i + 20);
    const products = await page.evaluate(async (codes) => {
      const resp = await fetch(`/productdata/populateProduct?productCodes=${codes.join(",")}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      return await resp.json();
    }, batch);
    
    Object.values(products).forEach(p => {
      totalFetched++;
      const name = (p.name || "").toLowerCase();
      const isWine = name.includes("вино") || name.includes("портвейн") || name.includes("вермут") || name.includes("игристое") || name.includes("шампанское");
      if (isWine) totalWine++;
    });
    
    if ((i + 20) % 400 === 0 || i + 20 >= uniqueCodes.length) {
      console.log(`Processed ${Math.min(i + 20, uniqueCodes.length)}/${uniqueCodes.length}, wine: ${totalWine}, fetched: ${totalFetched}`);
    }
  }
  
  console.log(`\nTotal: ${totalFetched} fetched, ${totalWine} wine`);
  
  await browser.close();
})();

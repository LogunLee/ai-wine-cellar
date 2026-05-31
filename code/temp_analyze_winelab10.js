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
  
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const modal = document.getElementById("age-confirm-modal");
    if (modal) modal.remove();
    const overlay = document.querySelector(".w-modal__overlay");
    if (overlay) overlay.remove();
  });
  
  // Try autocomplete API with "вино"
  console.log("=== Autocomplete API ===");
  const autocomplete = await page.evaluate(async () => {
    const resp = await fetch("/search/autocomplete/WineLabSearchBoxComponent?term=вино", {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    return await resp.json();
  });
  console.log(`Keys: ${Object.keys(autocomplete).join(", ")}`);
  console.log(`suggestions: ${(autocomplete.suggestions || []).length}`);
  console.log(`products: ${(autocomplete.products || []).length}`);
  if (autocomplete.products && autocomplete.products.length > 0) {
    console.log(`products[0]: ${JSON.stringify(autocomplete.products[0]).substring(0, 300)}`);
  }
  if (autocomplete.categories && autocomplete.categories.length > 0) {
    console.log(`\ncategories:`);
    autocomplete.categories.forEach(c => console.log(`  ${c.name} -> ${c.url || c.code}`));
  }
  
  // Try with empty term to get all products
  console.log("\n=== Autocomplete with empty term ===");
  const empty = await page.evaluate(async () => {
    const resp = await fetch("/search/autocomplete/WineLabSearchBoxComponent?term=", {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    return await resp.json();
  });
  console.log(`products: ${(empty.products || []).length}`);
  if (empty.products && empty.products.length > 0) {
    empty.products.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i+1}. ${p.name || p.code} - ${JSON.stringify(p).substring(0, 200)}`);
    });
  }
  
  // Try the search page with proper encoding
  console.log("\n=== Search page with proper encoding ===");
  await page.goto("https://www.winelab.ru/search/?text=вино", { waitUntil: "domcontentloaded", timeout: 60000 });
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
  console.log(`Product codes: ${codes.length} - ${codes.slice(0, 10).join(", ")}`);
  
  // Try to find pagination info
  const pageInfo = await page.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/(\d+)\s*из\s*(\d+)/);
    return match ? { current: match[1], total: match[2] } : null;
  });
  console.log(`Pagination: ${JSON.stringify(pageInfo)}`);
  
  await browser.close();
})();

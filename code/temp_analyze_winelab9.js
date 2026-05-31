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
  
  const jsonResponses = [];
  page.on("response", async (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if (url.includes("winelab.ru") && ct.includes("json") && !url.includes("mindbox") && !url.includes("flocktory") && !url.includes("firebase") && !url.includes("indoleads") && !url.includes("uxfeedback") && !url.includes("yandex") && !url.includes("novabev") && !url.includes("mc.yandex")) {
      try {
        const body = await response.json();
        jsonResponses.push({ url: url.substring(0, 300), status: response.status(), keys: Object.keys(body || {}).slice(0, 10) });
      } catch (e) {}
    }
  });
  
  console.log("=== Homepage ===");
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Remove age modal
  await page.evaluate(() => {
    const modal = document.getElementById("age-confirm-modal");
    if (modal) modal.remove();
    const overlay = document.querySelector(".w-modal__overlay");
    if (overlay) overlay.remove();
  });
  await page.waitForTimeout(1000);
  
  // Try clicking the search icon
  console.log("\n=== Clicking search ===");
  const searchBtn = await page.$("[class*='header__search'], [class*='search-btn'], [class*='SearchButton'], [class*='search-icon'], a[href*='search']");
  if (searchBtn) {
    await searchBtn.click();
    await page.waitForTimeout(3000);
    console.log(`URL after click: ${page.url()}`);
  }
  
  // Try to find the search input after clicking
  const searchInput = await page.$("input[type='text'], input[type='search']");
  if (searchInput) {
    console.log("Found search input, typing...");
    await searchInput.fill("вино");
    await page.waitForTimeout(2000);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(10000);
    console.log(`URL after search: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);
  }
  
  // Check for product codes
  const codes = await page.evaluate(() => {
    const html = document.body.innerHTML;
    const codes = new Set();
    const pattern = /product\/(\d{7})/g;
    let match;
    while ((match = pattern.exec(html)) !== null) codes.add(match[1]);
    return [...codes];
  });
  console.log(`\nProduct codes: ${codes.length} - ${codes.slice(0, 10).join(", ")}`);
  
  // If we have codes, get details
  if (codes.length > 0) {
    const codesStr = codes.slice(0, 20).join(",");
    const products = await page.evaluate(async (codes) => {
      const resp = await fetch(`/productdata/populateProduct?productCodes=${codes}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      return await resp.json();
    }, codesStr);
    console.log(`\nGot ${Object.keys(products).length} products`);
    Object.values(products).forEach((p, i) => {
      if (i >= 3) return;
      const prod = p;
      console.log(`${i+1}. ${prod.name}`);
      console.log(`   Price: ${prod.price?.value}, Discount: ${prod.discount}, Country: ${prod.country}`);
      console.log(`   Categories: ${(prod.categories || []).map(c => c.name).join(", ")}`);
    });
  }
  
  // Print relevant JSON responses
  console.log("\n=== Relevant JSON API calls ===");
  jsonResponses.filter(r => r.url.includes("search") || r.url.includes("product") || r.url.includes("view") || r.url.includes("catalog") || r.url.includes("populate")).forEach(r => {
    console.log(`${r.status}: ${r.url.substring(0, 200)}`);
    console.log(`  Keys: ${r.keys.join(", ")}`);
  });
  
  await browser.close();
})();

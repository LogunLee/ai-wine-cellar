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
  
  // Close age confirmation modal
  console.log("Closing age modal...");
  const ageBtn = await page.$("button:has-text('ћне есть'), button:has-text('18'), [class*='confirm']:has-text('18')");
  if (ageBtn) {
    await ageBtn.click();
    await page.waitForTimeout(2000);
    console.log("Age modal closed");
  } else {
    // Try to close via overlay click or JS
    await page.evaluate(() => {
      const modal = document.getElementById("age-confirm-modal");
      if (modal) modal.remove();
      const overlay = document.querySelector(".w-modal__overlay");
      if (overlay) overlay.remove();
    });
    console.log("Age modal removed via JS");
  }
  
  // Find and use search
  console.log("\n=== Finding search ===");
  // Try clicking search icon
  const searchIcons = await page.$$("svg, [class*='search'], [class*='Search'], [class*='icon-search']");
  console.log(`Found ${searchIcons.length} potential search elements`);
  
  // Try to find search input directly
  const inputs = await page.evaluate(() => {
    const all = document.querySelectorAll("input");
    return [...all].map(i => ({ type: i.type, placeholder: i.placeholder, name: i.name, id: i.id, class: i.className.substring(0, 50) })).filter(i => i.placeholder?.toLowerCase().includes("поиск") || i.type === "search" || i.name?.includes("search") || i.id?.includes("search"));
  });
  console.log(`Search inputs: ${JSON.stringify(inputs)}`);
  
  // Try navigating to search URL directly
  console.log("\n=== Direct search URL ===");
  await page.goto("https://www.winelab.ru/search?text=вино&page=0&pageSize=50", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(10000);
  console.log(`Title: ${await page.title()}`);
  
  // Check for product data in the page
  const productCodes = await page.evaluate(() => {
    const html = document.body.innerHTML;
    const codes = new Set();
    const pattern = /product\/(\d{7})/g;
    let match;
    while ((match = pattern.exec(html)) !== null) codes.add(match[1]);
    return [...codes];
  });
  console.log(`Product codes on search page: ${productCodes.length} - ${productCodes.slice(0, 10).join(", ")}`);
  
  // If we have codes, get product details
  if (productCodes.length > 0) {
    const codes = productCodes.slice(0, 20).join(",");
    const products = await page.evaluate(async (codes) => {
      const resp = await fetch(`/productdata/populateProduct?productCodes=${codes}`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      return await resp.json();
    }, codes);
    console.log(`\nGot ${Object.keys(products).length} products`);
    Object.values(products).slice(0, 3).forEach((p, i) => {
      const prod = p;
      console.log(`\n${i+1}. ${prod.name}`);
      console.log(`   Price: ${prod.price?.value} ${prod.price?.currencyIso}`);
      console.log(`   Discount: ${prod.discount}`);
      console.log(`   Country: ${prod.country}`);
      console.log(`   url: ${prod.url}`);
      console.log(`   Categories: ${JSON.stringify(prod.categories?.slice(0, 2))}`);
    });
  }
  
  // Print relevant JSON responses
  console.log("\n=== Relevant JSON API calls ===");
  jsonResponses.filter(r => r.url.includes("search") || r.url.includes("product") || r.url.includes("view") || r.url.includes("catalog")).forEach(r => {
    console.log(`${r.status}: ${r.url.substring(0, 200)}`);
    console.log(`  Keys: ${r.keys.join(", ")}`);
  });
  
  await browser.close();
})();

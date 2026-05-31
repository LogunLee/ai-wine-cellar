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
  await page.waitForTimeout(8000);
  
  // Use the search input on the page
  console.log("\n=== Using search input ===");
  const searchInput = await page.$("input[type='search'], input[placeholder*='Поиск'], input[placeholder*='поиск']");
  if (searchInput) {
    await searchInput.click();
    await searchInput.fill("вино");
    await page.waitForTimeout(3000);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(10000);
    console.log(`Title after search: ${await page.title()}`);
  } else {
    console.log("No search input found");
    // Try clicking search icon
    const searchBtn = await page.$("[class*='search'], [class*='Search']");
    if (searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(3000);
      const input = await page.$("input[type='text'], input[type='search']");
      if (input) {
        await input.fill("вино");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(10000);
      }
    }
  }
  
  console.log("\n=== JSON API calls after search ===");
  jsonResponses.forEach(r => {
    if (r.url.includes("search") || r.url.includes("product") || r.url.includes("catalog") || r.url.includes("view")) {
      console.log(`${r.status}: ${r.url.substring(0, 200)}`);
      console.log(`  Keys: ${r.keys.join(", ")}`);
    }
  });
  
  // Check page content
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
  console.log(`\nBody text: ${bodyText}`);
  
  // Find product codes
  const codes = await page.evaluate(() => {
    const html = document.body.innerHTML;
    const codes = new Set();
    const pattern = /product\/(\d{7})/g;
    let match;
    while ((match = pattern.exec(html)) !== null) codes.add(match[1]);
    return [...codes].slice(0, 30);
  });
  console.log(`\nProduct codes found: ${codes.length} - ${codes.slice(0, 10).join(", ")}`);
  
  await browser.close();
})();

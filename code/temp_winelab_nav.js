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
        if (body.pagination) console.log(`  >>> Pagination: ${JSON.stringify(body.pagination)}`);
        if (body.results) console.log(`  >>> Results: ${Array.isArray(body.results) ? body.results.length : body.results}`);
      } catch (e) {}
    }
  });
  
  console.log("=== Homepage ===");
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const modal = document.getElementById("age-confirm-modal");
    if (modal) modal.remove();
    const overlay = document.querySelector(".w-modal__overlay");
    if (overlay) overlay.remove();
  });
  await page.waitForTimeout(2000);
  
  // Navigate via JS to avoid click interception
  console.log("\n=== Navigating to /catalog/vino via JS ===");
  await page.evaluate(() => { window.location.href = "/catalog/vino"; });
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
  console.log(`Product codes: ${codes.length}`);
  
  // Check for pagination text
  const pageText = await page.evaluate(() => {
    const text = document.body.innerText;
    const lines = text.split("\n").filter(l => /страниц|page|из\s*\d+|показано|товаров/i.test(l));
    return lines.slice(0, 10);
  });
  console.log(`Pagination text: ${JSON.stringify(pageText)}`);
  
  // Print JSON responses
  console.log("\n=== JSON responses ===");
  jsonResponses.filter(r => r.url.includes("view") || r.url.includes("product") || r.url.includes("catalog") || r.url.includes("search") || r.url.includes("facet")).forEach(r => {
    console.log(`${r.status}: ${r.url.substring(0, 200)}`);
    console.log(`  Keys: ${r.keys.join(", ")}`);
  });
  
  await browser.close();
})();

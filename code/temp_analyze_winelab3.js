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
    if (url.includes("winelab.ru") && ct.includes("json") && !url.includes("mindbox") && !url.includes("flocktory") && !url.includes("firebase") && !url.includes("indoleads") && !url.includes("uxfeedback") && !url.includes("yandex") && !url.includes("novabev")) {
      try {
        const body = await response.json();
        jsonResponses.push({ url: url.substring(0, 200), status: response.status(), keys: Object.keys(body || {}).slice(0, 10) });
      } catch (e) {}
    }
  });
  
  // Step 1: Homepage
  console.log("=== Step 1: Homepage ===");
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  
  // Step 2: Try different catalog URLs
  console.log("\n=== Step 2: Try catalog URLs ===");
  const urls = [
    "https://www.winelab.ru/catalog/vino",
    "https://www.winelab.ru/catalog/wine",
    "https://www.winelab.ru/catalog/vino/",
    "https://www.winelab.ru/wine",
  ];
  
  for (const url of urls) {
    console.log(`\nTrying: ${url}`);
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(e => null);
    await page.waitForTimeout(5000);
    const title = await page.title();
    const status = resp ? resp.status() : "failed";
    console.log(`  Status: ${status}, Title: ${title.substring(0, 50)}`);
    if (title !== "HTTP 403" && !title.includes("403")) {
      console.log("  SUCCESS! Found working URL");
      break;
    }
  }
  
  // Print all JSON responses from the successful page
  console.log("\n=== JSON API calls ===");
  jsonResponses.forEach(r => {
    console.log(`${r.status}: ${r.url}`);
    console.log(`  Keys: ${r.keys.join(", ")}`);
  });
  
  await browser.close();
})();

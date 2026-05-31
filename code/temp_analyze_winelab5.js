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
        jsonResponses.push({ url: url.substring(0, 300), status: response.status(), keys: Object.keys(body || {}).slice(0, 10) });
      } catch (e) {}
    }
  });
  
  console.log("=== Homepage ===");
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  
  // Try search API with different patterns
  console.log("\n=== Trying search patterns ===");
  const searchUrls = [
    "/search?q=вино",
    "/search?q=вино&pageSize=20",
    "/search?text=вино&pageSize=20",
    "/vino/search?q=вино&pageSize=20",
    "/catalog/vino/search?q=&pageSize=20",
    "/search/vino?q=&pageSize=20",
  ];
  
  for (const url of searchUrls) {
    console.log(`\nTrying: ${url}`);
    try {
      const result = await page.evaluate(async (u) => {
        const resp = await fetch(u, { method: "GET", headers: { "Accept": "application/json" } });
        const ct = resp.headers.get("content-type");
        if (ct && ct.includes("json")) {
          const data = await resp.json();
          return { status: resp.status, isJson: true, keys: Object.keys(data).slice(0, 10) };
        }
        const text = await resp.text();
        return { status: resp.status, isJson: false, preview: text.substring(0, 200) };
      }, url);
      console.log(`  Result: ${JSON.stringify(result).substring(0, 200)}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  // Try to find product codes from the homepage featured products
  console.log("\n=== Featured Products component ===");
  const featured = await page.evaluate(async () => {
    const resp = await fetch("/view/WineLabFeaturedProductsCarouselComponentController/json?componentUid=HomepageNewProductsCarouselComponent", {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    const data = await resp.json();
    return data;
  });
  console.log(`Featured keys: ${Object.keys(featured).join(", ")}`);
  if (featured.productData) {
    console.log(`productData type: ${Array.isArray(featured.productData) ? "array" : typeof featured.productData}`);
    if (Array.isArray(featured.productData) && featured.productData.length > 0) {
      console.log(`productData[0] keys: ${Object.keys(featured.productData[0]).join(", ")}`);
      console.log(`productData[0]: ${JSON.stringify(featured.productData[0]).substring(0, 300)}`);
    }
  }
  
  // Try the category navigation to find vino category code
  console.log("\n=== Category Navigation ===");
  const nav = await page.evaluate(async () => {
    const resp = await fetch("/view/CategoryNavigationComponentController/json?componentUid=CategoryNavBarComponent", {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    return await resp.json();
  });
  console.log(`Nav keys: ${Object.keys(nav).join(", ")}`);
  if (nav.mainMenu) {
    const vinoCat = nav.mainMenu.find(c => c.name?.includes("Вино") || c.url?.includes("vino"));
    if (vinoCat) console.log(`Vino category: ${JSON.stringify(vinoCat).substring(0, 300)}`);
  }
  
  // Print all JSON responses
  console.log("\n=== All JSON API calls ===");
  jsonResponses.forEach(r => {
    console.log(`${r.status}: ${r.url}`);
    console.log(`  Keys: ${r.keys.join(", ")}`);
  });
  
  await browser.close();
})();

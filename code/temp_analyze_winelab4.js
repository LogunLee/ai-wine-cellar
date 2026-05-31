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
        if (Array.isArray(body) && body.length > 0 && body[0].name) {
          console.log(`  Product: ${body[0].name.substring(0, 60)}`);
        }
      } catch (e) {}
    }
  });
  
  console.log("=== Homepage ===");
  await page.goto("https://www.winelab.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  
  // Check navigation menu for catalog link
  const menuLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll("a").forEach(a => {
      const href = a.getAttribute("href") || "";
      const text = a.textContent?.trim() || "";
      if (href.includes("catalog") || text.includes("Вино") || text.includes("вин")) {
        links.push({ text, href });
      }
    });
    return links;
  });
  console.log("\n=== Menu links with 'catalog' or 'вино' ===");
  menuLinks.forEach(l => console.log(`  "${l.text}" -> ${l.href}`));
  
  // Try clicking on the catalog link
  console.log("\n=== Trying to navigate via menu ===");
  const vinoLink = await page.evaluate(() => {
    const links = document.querySelectorAll("a");
    for (const a of links) {
      if (a.textContent?.includes("Вино") && a.getAttribute("href")?.includes("catalog")) {
        return a.getAttribute("href");
      }
    }
    return null;
  });
  
  if (vinoLink) {
    console.log(`Found link: ${vinoLink}`);
    await page.goto(`https://www.winelab.ru${vinoLink}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(10000);
    console.log(`Title: ${await page.title()}`);
    console.log(`Status: ${await page.evaluate(() => document.title)}`);
  }
  
  // Try search API
  console.log("\n=== Trying search API ===");
  const searchResult = await page.evaluate(async () => {
    const resp = await fetch("/search?q=вино&pageSize=10", {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    return { status: resp.status, contentType: resp.headers.get("content-type") };
  });
  console.log(`Search API: ${searchResult.status}, ${searchResult.contentType}`);
  
  // Try the populateProduct API with known wine codes
  console.log("\n=== Trying productdata API ===");
  const productResult = await page.evaluate(async () => {
    const resp = await fetch("/productdata/populateProduct?productCodes=1029193,1004563,1027925", {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    const data = await resp.json();
    return { status: resp.status, count: Object.keys(data).length, first: data[0] ? { name: data[0].name, price: data[0].price?.value } : null };
  });
  console.log(`Product API: ${productResult.status}, count: ${productResult.count}`);
  if (productResult.first) console.log(`  First: ${productResult.first.name} - ${productResult.first.price}`);
  
  // Print all JSON responses
  console.log("\n=== All JSON API calls ===");
  jsonResponses.forEach(r => {
    console.log(`${r.status}: ${r.url}`);
    console.log(`  Keys: ${r.keys.join(", ")}`);
  });
  
  await browser.close();
})();

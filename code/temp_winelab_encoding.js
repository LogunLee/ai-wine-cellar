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
  
  // Fetch first batch and check character codes
  const batch = uniqueCodes.slice(0, 5);
  const products = await page.evaluate(async (codes) => {
    const resp = await fetch(`/productdata/populateProduct?productCodes=${codes.join(",")}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    return await resp.json();
  }, batch);
  
  const first = Object.values(products)[0];
  const name = first.name;
  console.log(`Name: "${name}"`);
  console.log(`Name length: ${name.length}`);
  console.log(`First 10 char codes: ${[...name].slice(0, 10).map(c => c.charCodeAt(0))}`);
  console.log(`First 10 chars: ${[...name].slice(0, 10).map(c => `'${c}'(${c.charCodeAt(0)})`)}`);
  
  // Check if "вино" matches
  const searchStr = "вино";
  console.log(`\nSearch string: "${searchStr}"`);
  console.log(`Search char codes: ${[...searchStr].map(c => c.charCodeAt(0))}`);
  
  // Try different matching approaches
  console.log(`\nMatching tests:`);
  console.log(`  name.includes("вино"): ${name.includes("вино")}`);
  console.log(`  name.toLowerCase().includes("вино"): ${name.toLowerCase().includes("вино")}`);
  console.log(`  name.startsWith("Вино"): ${name.startsWith("Вино")}`);
  console.log(`  name.startsWith("вино"): ${name.startsWith("вино")}`);
  
  // Try regex
  console.log(`  /вино/i.test(name): ${/вино/i.test(name)}`);
  console.log(`  /^вино/i.test(name): ${/^вино/i.test(name)}`);
  console.log(`  /^Вино/.test(name): ${/^Вино/.test(name)}`);
  
  // Check if the "В" is Cyrillic or Latin
  const firstChar = name[0];
  console.log(`\nFirst char: '${firstChar}' code: ${firstChar.charCodeAt(0)} (Cyrillic В = 1042, Latin B = 66)`);
  
  await browser.close();
})();

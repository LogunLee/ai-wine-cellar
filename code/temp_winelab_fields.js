require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.winelab.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const modal = document.getElementById('age-confirm-modal');
    if (modal) modal.remove();
    const overlay = document.querySelector('.w-modal__overlay');
    if (overlay) overlay.remove();
  });
  
  // Check populateProduct for all fields
  const details = await page.evaluate(async () => {
    const resp = await fetch('/productdata/populateProduct?productCodes=1019959', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const data = await resp.json();
    return data['1019959'];
  });
  
  console.log('=== All fields for product 1019959 ===');
  console.log('Name: ' + details.name);
  console.log('Manufacturer: ' + JSON.stringify(details.manufacturer));
  console.log('Country: ' + JSON.stringify(details.country));
  console.log('CountryProduct: ' + JSON.stringify(details.countryProduct));
  console.log('WinLabManufacturer: ' + JSON.stringify(details.winLabManufacturer));
  console.log('AlcoholContent: ' + JSON.stringify(details.alcoholContent));
  console.log('Summary: ' + JSON.stringify(details.summary));
  console.log('Description: ' + JSON.stringify(details.description));
  console.log('Brand: ' + JSON.stringify(details.brand));
  console.log('Stickers: ' + JSON.stringify(details.stickers));
  console.log('Sommelier: ' + JSON.stringify(details.sommelier));
  console.log('Consumption: ' + JSON.stringify(details.consumption));
  console.log('MetaDescription: ' + JSON.stringify(details.metaDescription));
  console.log('EAN: ' + JSON.stringify(details.ean));
  console.log('Price: ' + JSON.stringify(details.price));
  console.log('Discount: ' + JSON.stringify(details.discount));
  console.log('Categories: ' + JSON.stringify(details.categories));
  console.log('VariantOptions: ' + JSON.stringify(details.variantOptions));
  console.log('PotentialPromotions: ' + JSON.stringify(details.potentialPromotions));
  
  // Check ALL keys for any grape/variety info
  console.log('\n=== Searching for grape/variety info ===');
  const allKeys = Object.keys(details);
  const grapeKeys = allKeys.filter(k => 
    k.toLowerCase().includes('grape') || 
    k.toLowerCase().includes('variety') || 
    k.toLowerCase().includes('sort') ||
    k.toLowerCase().includes('vine') ||
    k.toLowerCase().includes('wine') ||
    k.toLowerCase().includes('color') ||
    k.toLowerCase().includes('sugar') ||
    k.toLowerCase().includes('taste')
  );
  console.log('Grape-related keys: ' + JSON.stringify(grapeKeys));
  
  // Check values of some interesting keys
  console.log('\n=== Interesting values ===');
  console.log('averageColorRating: ' + details.averageColorRating);
  console.log('averageTasteRating: ' + details.averageTasteRating);
  console.log('averageFlavorRating: ' + details.averageFlavorRating);
  console.log('percentagePeopleRecommended: ' + details.percentagePeopleRecommended);
  console.log('numberOfReviews: ' + details.numberOfReviews);
  console.log('averageRating: ' + details.averageRating);
  
  // Check if description has content
  console.log('\nDescription type: ' + typeof details.description);
  console.log('Description length: ' + (details.description ? details.description.length : 0));
  console.log('Summary type: ' + typeof details.summary);
  console.log('Summary length: ' + (details.summary ? details.summary.length : 0));
  
  await browser.close();
})();

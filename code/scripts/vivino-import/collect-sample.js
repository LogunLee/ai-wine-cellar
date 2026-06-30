// Сбор образца: первая страница оценок + записи погреба из state. Только чтение, без записи.
const fs = require('fs');
const path = require('path');
const { connect, fetchActivitiesPage, readCellarEntriesFromState } = require('./lib');

const OUT = 'C:/Users/LoGun/AppData/Local/Temp/claude/C--Users-LoGun-Documents-ClaudeProjects-AI-wine-cellar/4ffa7219-3797-4218-a9ab-cb58575f02a0/scratchpad/';

(async () => {
  const { browser, page } = await connect();

  // Погреб: убедимся, что мы на странице cellar (иначе state пуст)
  let cellar = await readCellarEntriesFromState(page);
  if (!cellar.length) {
    await page.goto('https://www.vivino.com/cellar', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    cellar = await readCellarEntriesFromState(page);
  }

  // Оценки: первая страница
  const act = await fetchActivitiesPage(page, 0, 20);

  fs.writeFileSync(OUT + 'sample-cellar.json', JSON.stringify(cellar, null, 2));
  fs.writeFileSync(OUT + 'sample-activities.json', JSON.stringify(act, null, 2));

  console.log('CELLAR entries in state:', cellar.length);
  console.log('Sample cellar[0..2]:', JSON.stringify(cellar.slice(0, 3), null, 2));
  console.log('\nACTIVITIES status:', act.status, 'nodes:', act.count, 'rated:', act.items.length);
  console.log('Sample activities[0..3]:', JSON.stringify(act.items.slice(0, 4), null, 2));

  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

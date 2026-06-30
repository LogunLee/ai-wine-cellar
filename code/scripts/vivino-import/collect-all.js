// Полный сбор: весь погреб + все оценки. Только чтение Vivino, throttled, с дедупом.
const fs = require('fs');
const { connect, sleep, fetchActivitiesPage, fetchCellarPage } = require('./lib');

const OUT = 'C:/Users/LoGun/AppData/Local/Temp/claude/C--Users-LoGun-Documents-ClaudeProjects-AI-wine-cellar/4ffa7219-3797-4218-a9ab-cb58575f02a0/scratchpad/';
const CELLAR_ID = 2297289;
const PAUSE = 3000;

(async () => {
  const { browser, page } = await connect();

  // ── ПОГРЕБ ──
  const cellarMap = new Map();
  let total = null;
  for (let pg = 1; pg <= 20; pg++) {
    const res = await fetchCellarPage(page, pg, 50, CELLAR_ID);
    if (res.status !== 200) { console.log('cellar page', pg, 'status', res.status, '→ стоп'); break; }
    total = res.total;
    let added = 0;
    for (const e of res.entries) if (!cellarMap.has(e.entryId)) { cellarMap.set(e.entryId, e); added++; }
    console.log(`cellar page ${pg}: +${added} (всего ${cellarMap.size}/${total})`);
    fs.writeFileSync(OUT + 'cellar-all.json', JSON.stringify([...cellarMap.values()], null, 2));
    if (res.entries.length < 50 || added === 0) break;
    await sleep(PAUSE);
  }

  // ── ОЦЕНКИ ──
  const actMap = new Map();
  const seenNodes = new Set();
  let cursor = 0;
  for (let i = 0; i < 80; i++) {
    const res = await fetchActivitiesPage(page, cursor, 50);
    if (res.status !== 200) { console.log('activities cursor', cursor, 'status', res.status, '→ стоп'); break; }
    let newNodes = 0;
    for (const id of res.allIds || []) { if (!seenNodes.has(id)) { seenNodes.add(id); newNodes++; } }
    let addedRated = 0;
    for (const it of res.items) if (!actMap.has(it.activityId)) { actMap.set(it.activityId, it); addedRated++; }
    console.log(`activities page ${i + 1} (cursor ${cursor}): nodes ${res.count}, новых узлов ${newNodes}, +оценок ${addedRated} (всего ${actMap.size})`);
    fs.writeFileSync(OUT + 'activities-all.json', JSON.stringify([...actMap.values()], null, 2));
    if (res.count === 0 || newNodes === 0 || res.lastId == null) break;
    if (res.lastId >= cursor && cursor !== 0) break; // нет прогресса
    cursor = res.lastId;
    await sleep(PAUSE);
  }

  console.log(`\nИТОГО: погреб ${cellarMap.size} (total ${total}), оценок ${actMap.size}`);
  await browser.close();
})().catch((e) => { console.error('ERR', e.stack || e.message); process.exit(1); });

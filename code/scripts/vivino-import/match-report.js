// Матчинг образцов Vivino (погреб + оценки) с погребом Merlotic. Только отчёт.
const fs = require('fs');
const { pool, norm, loadMerlotItems } = require('./db');

const OUT = 'C:/Users/LoGun/AppData/Local/Temp/claude/C--Users-LoGun-Documents-ClaudeProjects-AI-wine-cellar/4ffa7219-3797-4218-a9ab-cb58575f02a0/scratchpad/';

function tokens(s) { return new Set(norm(s).split(' ').filter(Boolean)); }
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function bestMatch(vWinery, vName, vYear, items) {
  const vComb = `${vWinery || ''} ${vName || ''}`;
  let best = null;
  for (const it of items) {
    const score = jaccard(vComb, `${it.producer || ''} ${it.name || ''}`);
    const yearMatch = vYear && it.year ? Number(vYear) === Number(it.year) : null;
    let adj = score + (yearMatch === true ? 0.15 : yearMatch === false ? -0.25 : 0);
    if (!best || adj > best.adj) best = { it, score: Math.round(score * 100) / 100, yearMatch, adj };
  }
  return best;
}

function classify(b) {
  if (!b) return 'unmatched';
  if (b.score >= 0.75 && b.yearMatch !== false) return 'confident';
  if (b.score >= 0.45) return 'ambiguous';
  return 'unmatched';
}

(async () => {
  const items = await loadMerlotItems();
  const cellar = JSON.parse(fs.readFileSync(OUT + 'sample-cellar.json', 'utf8'));
  const acts = JSON.parse(fs.readFileSync(OUT + 'sample-activities.json', 'utf8')).items;

  const run = (label, list, getW, getN, getY) => {
    const buckets = { confident: [], ambiguous: [], unmatched: [] };
    for (const v of list) {
      const b = bestMatch(getW(v), getN(v), getY(v), items);
      const cls = classify(b);
      buckets[cls].push({
        vivino: `${getW(v)} — ${getN(v)} ${getY(v) || ''}`.trim(),
        match: b ? `${b.it.producer} — ${b.it.name} ${b.it.year || ''} [${b.it.status}]` : null,
        score: b ? b.score : null,
        yearMatch: b ? b.yearMatch : null,
      });
    }
    console.log(`\n===== ${label} =====`);
    for (const k of ['confident', 'ambiguous', 'unmatched']) {
      console.log(`\n--- ${k} (${buckets[k].length}) ---`);
      for (const r of buckets[k]) {
        console.log(`  V: ${r.vivino}`);
        console.log(`  M: ${r.match || '—'}  (score ${r.score}, year ${r.yearMatch})`);
      }
    }
    return buckets;
  };

  console.log('Merlotic items loaded:', items.length);
  run('CELLAR (задача 1, образец 16)', cellar, (v) => v.winery, (v) => v.wineName, (v) => v.year);
  run('ACTIVITIES (задача 2, образец 10)', acts, (v) => v.winery, (v) => v.wineName, (v) => v.year);

  await pool.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

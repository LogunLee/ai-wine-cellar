// Импорт Vivino → Merlotic: фото погреба (задача 1) + дегустационные заметки (задача 2).
// Источник: cellar-all.json / activities-all.json (или sample-* при --sample).
// Идемпотентно: чекпойнт reviewId + дедуп заметок по содержимому; фото не перезаписываются.
// Запуск:  node scripts/vivino-import/import.js --full
//          node scripts/vivino-import/import.js --sample --limit 6   (пилот)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { pool, CELLAR_ID, USER_DB_ID, norm, loadMerlotItems } = require('./db');

const OUT = 'C:/Users/LoGun/AppData/Local/Temp/claude/C--Users-LoGun-Documents-ClaudeProjects-AI-wine-cellar/4ffa7219-3797-4218-a9ab-cb58575f02a0/scratchpad/';
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'cellar');
const CKPT = OUT + 'imported-reviews.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const args = process.argv.slice(2);
const SAMPLE = args.includes('--sample');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
const APP_PAUSE = 2500; // после запроса к vivino-приложению (/api/vintages)
const IMG_PAUSE = 1000; // между картинками с CDN
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { const s = a.join(' '); console.log(s); };

// ── magic bytes (зеркало backend sniffImageExt) ──
function sniffExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return '.gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}
async function downloadImage(url) {
  if (!url) return null;
  const abs = url.startsWith('//') ? 'https:' + url : url;
  try {
    const r = await fetch(abs, { headers: { 'User-Agent': UA, Accept: 'image/*', Referer: 'https://www.vivino.com/' } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = sniffExt(buf);
    if (!ext) return null;
    return { buf, ext };
  } catch { return null; }
}
async function setPhoto(itemId, imageUrl) {
  const img = await downloadImage(imageUrl);
  if (!img) return { ok: false, reason: 'не изображение/недоступно' };
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fileName = `${CELLAR_ID}_${itemId}_${Date.now()}${img.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), img.buf);
  const photoPath = `/uploads/cellar/${fileName}`;
  await pool.query('UPDATE cellar_item SET photo_path=$1, updated_at=now() WHERE id=$2', [photoPath, itemId]);
  return { ok: true, photoPath, bytes: img.buf.length };
}

// ── матчинг ──
function tokens(s) { return new Set(norm(s).split(' ').filter(Boolean)); }
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / (A.size + B.size - i);
}
function isSubset(small, big) {
  const S = tokens(small), B = tokens(big);
  if (!S.size) return false;
  for (const t of S) if (!B.has(t)) return false;
  return true;
}
function bestCellarMatch(winery, name, year, items) {
  const vC = `${winery || ''} ${name || ''}`;
  let best = null;
  for (const it of items) {
    const mC = `${it.producer || ''} ${it.name || ''}`;
    let score = jaccard(vC, mC);
    if ((isSubset(mC, vC) || isSubset(vC, mC)) && score > 0.4) score = Math.max(score, 0.9);
    const yearMatch = year && it.year ? Number(year) === Number(it.year) : null;
    const adj = score + (yearMatch === true ? 0.15 : yearMatch === false ? -0.3 : 0);
    if (!best || adj > best.adj) best = { it, score: Math.round(score * 100) / 100, yearMatch, adj };
  }
  return best;
}
const confident = (b) => b && b.score >= 0.75 && b.yearMatch !== false;

// ── справочники ──
const TYPE_MAP = { 1: 'RED', 2: 'WHITE', 3: 'SPARKLING', 4: 'ROSE', 7: 'SWEET', 24: 'FORTIFIED' };
async function loadCountries() {
  const { rows } = await pool.query('SELECT id, iso2, name FROM country');
  const byIso = new Map(), byName = new Map();
  for (const r of rows) { if (r.iso2) byIso.set(r.iso2.toLowerCase(), r.id); byName.set(norm(r.name), r.id); }
  return { byIso, byName };
}
async function loadSeries() {
  const { rows } = await pool.query('SELECT id, producer, name, country_id FROM wine_series');
  return rows;
}
function resolveCountryId(countries, code, name) {
  if (code && countries.byIso.has(code.toLowerCase())) return countries.byIso.get(code.toLowerCase());
  if (name && countries.byName.has(norm(name))) return countries.byName.get(norm(name));
  return null;
}
async function fetchVintage(page, vintageId) {
  return await page.evaluate(async (id) => {
    try {
      const r = await fetch('https://www.vivino.com/api/vintages/' + id, {
        headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' }, credentials: 'include',
      });
      if (r.status !== 200) return { status: r.status };
      const j = await r.json();
      const v = j.vintage || {}; const w = v.wine || {}; const img = v.image || {}; const vars = img.variations || {};
      return {
        status: 200, typeId: w.type_id, winery: w.winery && w.winery.name, wineName: w.name, year: v.year,
        region: w.region && w.region.name, country: w.region && w.region.country && w.region.country.name,
        countryCode: w.region && w.region.country && w.region.country.code,
        image: vars.bottle_large || vars.label_large || vars.large || img.location || null,
      };
    } catch (e) { return { status: -1, error: String(e) }; }
  }, vintageId);
}

function parseDate(title, rel) {
  const now = new Date();
  let approx = new Date(now);
  const rm = rel && rel.match(/(\d+)\s+(day|week|month|year)/i);
  if (rm) { const n = +rm[1]; const days = { day: 1, week: 7, month: 30, year: 365 }[rm[2].toLowerCase()]; approx = new Date(now.getTime() - n * days * 86400000); }
  const md = title && title.match(/([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (md) {
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(md[1]);
    const day = +md[2];
    let best = null;
    for (const y of [approx.getFullYear() - 1, approx.getFullYear(), approx.getFullYear() + 1]) {
      const d = new Date(Date.UTC(y, mon, day));
      if (d > now) continue;
      const diff = Math.abs(d - approx);
      if (!best || diff < best.diff) best = { d, diff };
    }
    if (best) return best.d;
  }
  return approx;
}
const ymd = (d) => d.toISOString().slice(0, 10);
const clampRating = (r) => Math.min(5, Math.max(1, Math.round(r * 10) / 10));
// Год → int или null (N.V./нечисловые → null), чтобы не падать на безвинтажных винах.
const toYear = (y) => { const n = parseInt(y, 10); return Number.isFinite(n) ? n : null; };

async function findOrCreateConsumedItem(v, countries, seriesCache) {
  const vC = `${v.winery || ''} ${v.wineName || ''}`;
  let series = null, bestScore = 0;
  for (const s of seriesCache) {
    let sc = jaccard(vC, `${s.producer || ''} ${s.name || ''}`);
    if (isSubset(`${s.producer} ${s.name}`, vC) || isSubset(vC, `${s.producer} ${s.name}`)) sc = Math.max(sc, 0.9);
    if (sc > bestScore) { bestScore = sc; series = s; }
  }
  if (!series || bestScore < 0.85) {
    const countryId = resolveCountryId(countries, v.countryCode, v.country);
    let cid = countryId;
    if (!cid) { const fr = await pool.query("SELECT id FROM country WHERE iso2='FR'"); cid = fr.rows[0] && fr.rows[0].id; }
    const wineType = TYPE_MAP[v.typeId] || 'RED';
    const ins = await pool.query(
      `INSERT INTO wine_series (id, producer, name, country_id, region, wine_type, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::"WineType", now(), now()) RETURNING id, producer, name, country_id`,
      [v.winery || v.wineName || 'Unknown', v.wineName || v.winery || 'Unknown', cid, v.region || null, wineType],
    );
    series = ins.rows[0];
    seriesCache.push(series);
  }
  const yr = toYear(v.year);
  let vint = await pool.query('SELECT id FROM wine_vintage WHERE series_id=$1 AND vintage_year IS NOT DISTINCT FROM $2', [series.id, yr]);
  let vintageId;
  if (vint.rows.length) vintageId = vint.rows[0].id;
  else {
    const vi = await pool.query('INSERT INTO wine_vintage (id, series_id, vintage_year, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, now(), now()) RETURNING id', [series.id, yr]);
    vintageId = vi.rows[0].id;
  }
  const it = await pool.query(
    `INSERT INTO cellar_item (id, wine_vintage_id, cellar_id, quantity, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 0, 'CONSUMED', now(), now()) RETURNING id`,
    [vintageId, CELLAR_ID],
  );
  return it.rows[0].id;
}

// дедуп заметки по содержимому (на случай пилотных строк без чекпойнта)
async function noteExistsByContent(dateStr, rating, noteText) {
  const r = await pool.query(
    `SELECT id FROM tasting_note
      WHERE user_id=$1 AND tasting_date=$2 AND rating=$3
        AND COALESCE(left(note_text,40),'')=COALESCE(left($4,40),'') AND deleted_at IS NULL`,
    [USER_DB_ID, dateStr, rating, noteText],
  );
  return r.rows.length > 0;
}
async function insertNote(cellarItemId, year, dateStr, rating, noteText) {
  await pool.query(
    `INSERT INTO tasting_note (id, user_id, cellar_item_id, vintage, tasting_date, rating, note_text, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())`,
    [USER_DB_ID, cellarItemId, toYear(year), dateStr, rating, noteText || null],
  );
}

function loadCkpt() { try { return new Set(JSON.parse(fs.readFileSync(CKPT, 'utf8'))); } catch { return new Set(); } }
function saveCkpt(set) { fs.writeFileSync(CKPT, JSON.stringify([...set])); }

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];

  let items = await loadMerlotItems();
  const countries = await loadCountries();
  const seriesCache = await loadSeries();
  const cellar = JSON.parse(fs.readFileSync(OUT + (SAMPLE ? 'sample-cellar.json' : 'cellar-all.json'), 'utf8'));
  const actsRaw = JSON.parse(fs.readFileSync(OUT + (SAMPLE ? 'sample-activities.json' : 'activities-all.json'), 'utf8'));
  const acts = SAMPLE ? actsRaw.items : actsRaw;
  const ckpt = loadCkpt();

  const report = { ts: new Date().toISOString(), cellarPhotos: { ok: 0, skipExisting: 0, failPhoto: 0 }, ambiguousCellar: [], notes: { created: 0, skipDup: 0, bridged: 0, consumed: 0, failPhoto: 0 }, errors: [] };

  // ── bridge + задача 1 ──
  const bridge = new Map();
  const photoByItem = new Map(items.map((it) => [it.item_id, it.photo_path]));
  log(`\n===== ЗАДАЧА 1: ФОТО ПОГРЕБА (${cellar.length}) =====`);
  let n1 = 0;
  for (const c of cellar) {
    if (n1 >= LIMIT) break;
    const b = bestCellarMatch(c.winery, c.wineName, c.year, items);
    if (!confident(b)) {
      report.ambiguousCellar.push({ vivino: `${c.winery} — ${c.wineName} ${c.year}`, guess: b && `${b.it.producer} — ${b.it.name} ${b.it.year}`, score: b && b.score, yearMatch: b && b.yearMatch });
      continue;
    }
    bridge.set(String(c.vintageId), b.it.item_id);
    if (photoByItem.get(b.it.item_id)) { report.cellarPhotos.skipExisting++; continue; }
    const res = await setPhoto(b.it.item_id, c.imageLarge);
    if (res.ok) { report.cellarPhotos.ok++; photoByItem.set(b.it.item_id, res.photoPath); log(`  ✓ ${b.it.producer} — ${b.it.name} ${b.it.year} (${res.bytes}b)`); }
    else { report.cellarPhotos.failPhoto++; log(`  ✗ ФОТО ${b.it.producer} — ${b.it.name}: ${res.reason}`); }
    n1++;
    await sleep(IMG_PAUSE);
  }
  // достроим bridge по ВСЕМ уверенным матчам (даже если фото уже было) — нужно для задачи 2
  for (const c of cellar) {
    const b = bestCellarMatch(c.winery, c.wineName, c.year, items);
    if (confident(b)) bridge.set(String(c.vintageId), b.it.item_id);
  }

  // ── задача 2 ──
  log(`\n===== ЗАДАЧА 2: ЗАМЕТКИ (${acts.length}) =====`);
  let n2 = 0, idx = 0;
  for (const a of acts) {
    idx++;
    if (n2 >= LIMIT) break;
    const key = String(a.reviewId || a.activityId);
    if (ckpt.has(key)) { report.notes.skipDup++; continue; }
    try {
      const rating = clampRating(a.rating);
      const dateStr = ymd(parseDate(a.dateTitle, a.dateRel));
      if (await noteExistsByContent(dateStr, rating, a.noteText)) { report.notes.skipDup++; ckpt.add(key); saveCkpt(ckpt); continue; }

      let itemId = bridge.get(String(a.vintageId));
      if (itemId) {
        report.notes.bridged++;
      } else {
        const v = await fetchVintage(page, a.vintageId);
        await sleep(APP_PAUSE);
        const wine = v.status === 200 ? v : { winery: a.winery, wineName: a.wineName, year: a.year, typeId: 1, region: a.region, country: a.country, image: a.imageUrl };
        itemId = await findOrCreateConsumedItem(wine, countries, seriesCache);
        report.notes.consumed++;
        const ph = await setPhoto(itemId, wine.image || a.imageUrl);
        if (!ph.ok) report.notes.failPhoto++;
        await sleep(IMG_PAUSE);
      }
      await insertNote(itemId, a.year, dateStr, rating, a.noteText);
      report.notes.created++;
      ckpt.add(key); saveCkpt(ckpt);
      if (report.notes.created % 20 === 0) log(`  ... заметок создано: ${report.notes.created} (обработано ${idx}/${acts.length})`);
      n2++;
    } catch (e) {
      report.errors.push({ wine: `${a.winery} — ${a.wineName}`, reviewId: a.reviewId, error: String(e.message || e) });
      log(`  ! ОШИБКА ${a.winery} — ${a.wineName}: ${e.message}`);
    }
  }

  fs.writeFileSync(OUT + 'import-report-full.json', JSON.stringify(report, null, 2));
  log('\n=== ИТОГ ===');
  log('Фото погреба: ok', report.cellarPhotos.ok, '| уже было', report.cellarPhotos.skipExisting, '| фото-фейл', report.cellarPhotos.failPhoto, '| спорных(пропущено)', report.ambiguousCellar.length);
  log('Заметки: создано', report.notes.created, '| привязка к погребу', report.notes.bridged, '| consumed', report.notes.consumed, '| дубль-пропуск', report.notes.skipDup, '| фото-фейл', report.notes.failPhoto);
  log('Ошибок:', report.errors.length, '| отчёт:', OUT + 'import-report-full.json');
  await pool.end();
  await browser.close();
})().catch((e) => { console.error('FATAL', e.stack || e.message); process.exit(1); });

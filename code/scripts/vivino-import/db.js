// Подключение к dev-БД и нормализация строк для матчинга.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function readDatabaseUrl() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const txt = fs.readFileSync(envPath, 'utf8');
  const m = txt.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error('DATABASE_URL не найден в code/.env');
  return m[1];
}

const pool = new Pool({ connectionString: readDatabaseUrl() });

const CELLAR_ID = '2f3f8612-226b-43bf-8a00-ef86465b2aa9';
const USER_DB_ID = 'c6d748d4-961e-4bdf-a0f2-a0366d033dc9';

// Нормализация для нечёткого сравнения: нижний регистр, без диакритики, без пунктуации, схлоп пробелов.
function norm(s) {
  if (!s) return '';
  return s
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // диакритика
    .replace(/[^a-zа-я0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadMerlotItems() {
  const { rows } = await pool.query(
    `SELECT ci.id AS item_id, ci.status, ci.photo_path,
            ws.producer, ws.name, wv.vintage_year AS year,
            c.name AS country, c.iso2
       FROM cellar_item ci
       JOIN wine_vintage wv ON wv.id = ci.wine_vintage_id
       JOIN wine_series  ws ON ws.id = wv.series_id
       LEFT JOIN country  c  ON c.id = ws.country_id
      WHERE ci.cellar_id = $1 AND ci.deleted_at IS NULL`,
    [CELLAR_ID],
  );
  return rows;
}

module.exports = { pool, CELLAR_ID, USER_DB_ID, norm, loadMerlotItems };

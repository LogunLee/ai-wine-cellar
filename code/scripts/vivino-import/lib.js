// Общие помощники для переноса Vivino → Merlotic.
const { chromium } = require('playwright');

const CDP = 'http://localhost:9222';
const USER_ID = 67775599;

async function connect() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  return { browser, page };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Скачивает одну страницу ленты активностей и парсит её В СТРАНИЦЕ через DOMParser.
// Возвращает массив нормализованных оценок.
async function fetchActivitiesPage(page, cursor, limit) {
  return await page.evaluate(
    async ({ uid, cursor, limit }) => {
      const url = `https://www.vivino.com/users/${uid}/activities?limit=${limit}&start_from_id=${cursor}&_=${Date.now()}`;
      const resp = await fetch(url, {
        headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01' },
        credentials: 'include',
      });
      const status = resp.status;
      const js = await resp.text();
      if (status !== 200) return { status, items: [], raw: js.slice(0, 300) };

      // Вытаскиваем все payload-ы из .append('...') (одинарные кавычки с экранированием)
      const unesc = (s) =>
        s
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\(['"\/\\])/g, '$1');
      const parts = [];
      const re = /\.append\('((?:[^'\\]|\\.)*)'\)/g;
      let m;
      while ((m = re.exec(js)) !== null) parts.push(unesc(m[1]));
      const html = parts.join('\n');

      const doc = new DOMParser().parseFromString('<div id="root">' + html + '</div>', 'text/html');
      const nodes = Array.from(doc.querySelectorAll('.user-activity-item'));

      const items = nodes.map((el) => {
        const ratingIcons = Array.from(el.querySelectorAll('.activity-rating .rating i'));
        let ratingSum = null;
        if (ratingIcons.length) {
          ratingSum = 0;
          for (const i of ratingIcons) {
            const mm = (i.className || '').match(/icon-(\d+)-pct/);
            if (mm) ratingSum += parseInt(mm[1], 10);
          }
          ratingSum = Math.round((ratingSum / 100) * 10) / 10; // звёзды, шаг 0.1
        }
        const timeA = el.querySelector('a[href^="/en/activities/"]');
        const card = el.querySelector('.activity-wine-card');
        const noteEl = el.querySelector('.tasting-note');
        let noteText = noteEl ? noteEl.textContent.trim() : null;
        if (noteText) noteText = noteText.replace(/^"|"$/g, '').trim() || null;

        const winery = card ? card.querySelector('a[href*="/wineries/"]') : null;
        const wineNameA = card ? card.querySelector('.wine-name a') : null;
        const regionA = card ? card.querySelector('a[href*="/regions/"]') : null;
        const countryA = card ? card.querySelector('a[href*="/countries/"]') : null;
        const imgC = card ? card.querySelector('.wine-image-container') : null;
        let imageUrl = null;
        if (imgC) {
          const st = imgC.getAttribute('style') || '';
          const im = st.match(/url\(([^)]+)\)/);
          if (im) imageUrl = im[1].replace(/^["']|["']$/g, '').trim();
        }
        // review_id из любой share-ссылки
        let reviewId = null;
        const share = el.querySelector('a[href*="/reviews/"]');
        if (share) {
          const rm = share.getAttribute('href').match(/\/reviews\/(\d+)/);
          if (rm) reviewId = rm[1];
        }
        // ★ из pinterest-описания как кросс-проверка рейтинга
        let starText = null;
        const pin = el.querySelector('a[href*="pinterest.com"]');
        if (pin) {
          let href = pin.getAttribute('href') || '';
          try { href = decodeURIComponent(href); } catch (e) { /* malformed % — оставляем как есть */ }
          const pm = href.match(/-\s*([0-5](?:\.\d)?)★/);
          if (pm) starText = parseFloat(pm[1]);
        }
        const flag = card ? card.querySelector('[class*="icon-flag-"]') : null;
        let countryCode = null;
        if (flag) {
          const sizes = new Set(['xs', 'sm', 'md', 'lg', 'xl']);
          const codes = Array.from((flag.className || '').matchAll(/icon-flag-([a-z]{2})\b/g))
            .map((x) => x[1])
            .filter((c) => !sizes.has(c));
          if (codes.length) countryCode = codes[0];
        }

        return {
          activityId: el.getAttribute('data-id'),
          reviewId,
          vintageId: card ? card.getAttribute('data-vintage_id') : null,
          year: card ? card.getAttribute('data-year') : null,
          winery: winery ? winery.textContent.trim() : null,
          wineName: wineNameA ? wineNameA.textContent.trim() : null,
          region: regionA ? regionA.textContent.trim() : null,
          country: countryA ? countryA.textContent.trim() : null,
          countryCode,
          rating: ratingSum,
          starText,
          noteText,
          dateTitle: timeA ? timeA.getAttribute('title') : null,
          dateRel: timeA ? timeA.textContent.trim().replace(/\s+/g, ' ') : null,
          imageUrl,
          wineUrl: wineNameA ? wineNameA.getAttribute('href') : null,
        };
      });

      // курсор: минимальный id среди ВСЕХ узлов (для пагинации), не только оценок
      const allIds = nodes.map((n) => Number(n.getAttribute('data-id'))).filter((x) => x);
      const lastId = allIds.length ? Math.min(...allIds) : null;
      // оставляем только записи с оценкой (ratings)
      const rated = items.filter((i) => i.rating != null && i.rating > 0);
      return { status, count: nodes.length, items: rated, lastId, allIds };
    },
    { uid: USER_ID, cursor, limit },
  );
}

// Одна страница погреба через JSON API. Возвращает нормализованные записи.
async function fetchCellarPage(page, pageNum, perPage, cellarId) {
  return await page.evaluate(
        async ({ cid, pg, pp }) => {
          const url = `https://www.vivino.com/api/cellars/${cid}?page=${pg}&per_page=${pp}`;
          const resp = await fetch(url, {
            headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
            credentials: 'include',
          });
          if (resp.status !== 200) return { status: resp.status, entries: [], total: null };
          const j = await resp.json();
          const cl = j.cellar_list || {};
          const entries = (cl.entries || []).map((e) => {
            const v = e.vintage || {};
            const w = v.wine || {};
            const img = v.image || {};
            const vars = img.variations || {};
            return {
              entryId: e.id,
              vintageId: e.vintage_id,
              year: v.year,
              wineName: w.name,
              winery: w.winery && w.winery.name,
              region: w.region && w.region.name,
              country: w.region && w.region.country && (w.region.country.name || w.region.country.native_name),
              countryCode: w.region && w.region.country && w.region.country.code,
              typeId: w.type_id,
              imageLarge: vars.bottle_large || vars.label_large || vars.large || img.location || null,
            };
          });
          return { status: 200, total: cl.total_count, entries };
        },
    { cid: cellarId, pg: pageNum, pp: perPage },
  );
}

// Читает все записи погреба из state открытой страницы /cellar.
async function readCellarEntriesFromState(page) {
  return await page.evaluate(() => {
    const d = ((window.__PRELOADED_STATE__ || {}).cellarPageData || {}).entries || [];
    return d.map((e) => {
      const v = e.vintage || {};
      const w = v.wine || {};
      const img = v.image || {};
      const vars = img.variations || {};
      return {
        entryId: e.id,
        vintageId: e.vintage_id,
        year: v.year,
        wineName: w.name,
        winery: w.winery && w.winery.name,
        region: w.region && w.region.name,
        country: w.region && w.region.country && (w.region.country.name || w.region.country.native_name),
        countryCode: w.region && w.region.country && w.region.country.code,
        typeId: w.type_id,
        imageLarge:
          vars.bottle_large || vars.label_large || vars.large || img.location || null,
      };
    });
  });
}

module.exports = { connect, sleep, fetchActivitiesPage, fetchCellarPage, readCellarEntriesFromState, USER_ID };

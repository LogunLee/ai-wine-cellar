# Vivino → Merlotic: перенос фото погреба и дегустационных заметок

Рабочий файл-точка входа фичи. Запущено 2026-06-28.

## Задача (от пользователя)
1. **Фото погреба:** скопировать фото вин из Vivino-погреба пользователя в фото карточек погреба Merlotic (вчера вина перенесли по скриншотам, но без фото).
2. **Заметки:** перенести все оценённые вина из Vivino в раздел дегустационных заметок Merlotic + скопировать фото оценённых вин.

Погреб и оценённые вина — **разные множества** (подтверждено пользователем).

## Ключевые решения
- Доступ к Vivino: **реальный Chrome + remote-debugging :9222**, пользователь логинится сам (пароль я не ввожу). Я подключаюсь по CDP (`connectOverCDP`). Preview не подошёл (пинит origin на localhost). Chrome-расширение не подключено.
- Заметки без текста (только оценка) — **заводить всё равно** (rating-only).
- Запуск — **сначала пилот ~10 вин**, проверка в Merlotic, потом полный прогон.
- Спорные матчи погреба — собрать список, показать пользователю.
- Куда пишем: **dev-БД :5433** (контейнер `ai_wine_cellar_pg`), фото → `cellar_item.photo_path` (файлы `code/uploads/cellar/`), с проверкой магических байтов.

## Факты по Vivino (разведано)
- user_id `67775599`, seo_name `logun.lee`. Cellar id `2297289`.
- AWS WAF активен (`awswaf.com`) → риск 403, ходить с паузами теми же эндпоинтами.
- **Погреб:** `https://www.vivino.com/cellar` → `/en/cellars/2297289`; данные в `window.__PRELOADED_STATE__.cellarPageData.entries[]` (первый батч 16, всего 126 бутылок). Поля записи: `vintage_id`, `vintage.year`, `vintage.wine.{name,winery.name,region.name,region.country,type_id}`, `vintage.image.variations.{bottle_large=_pb_x960, label_large=_pl_375x500,...}`, `user_vintage.{review,personal_note,price,...}`. Чистый JSON.
- **Оценки:** `https://www.vivino.com/users/67775599/activities?limit=N&start_from_id=ID` — отдаёт **JS с HTML внутри** (`$('#main-content').append('<div class="user-activity-item">...')`). Пагинация курсором `start_from_id` (id активностей убывают). Всего RATINGS=417.
  - На запись: `data-id` (activity id), дата в `a[href^="/en/activities/"]` `title` (часто БЕЗ года → вычислять из «N ago» + month/day), рейтинг = сумма 5×`i.icon-N-pct`/100 (0.1 шаг; дублируется в share-тексте `- X.X★ -`), текст `p.tasting-note`, вино в `.activity-wine-card` (`data-year`, `data-vintage_id`, winery `/wineries/`, name `.wine-name a`, регион/страна по флагу), фото `a.wine-image-container` style `background-image:url(//images.vivino.com/thumbs/KEY_375x500.jpg|_pl_375x500.png)`, `review_id` в share-ссылках (`/reviews/{id}`).

## Состояние Merlotic dev БД (на старте)
- user `logun_lee@mail.ru` id `c6d748d4-961e-4bdf-a0f2-a0366d033dc9`; cellar `2f3f8612-226b-43bf-8a00-ef86465b2aa9`.
- Погреб: **103** IN_CELLAR (127 бутылок), фото у **0**, дегустационных заметок **0**.
- Матчинг Vivino→Merlotic: по winery+name+year (vivino_url в БД не хранится). Для оценённых не из погреба — новый `cellar_item` со статусом `CONSUMED` (список погреба фильтрует `IN_CELLAR`, не засорится).
- TastingNote: rating Decimal(2,1) 1.0–5.0 шаг 0.1; cellarItemId обязателен; дедуп по соответствию вина/`review_id`.

## Статус
- [x] Разведка Vivino (структуры погреба и оценок)
- [x] Пилот 6+6 (2026-06-28): фото погреба ✓, заметки ✓. Проверено: IN_CELLAR=103 (не засорён), 5 CONSUMED-якорей, 11 фото (магич.байты+визуально — реальные бутылки), 6 заметок; La Meulière корректно привязалась к IN_CELLAR через bridge по vintageId. Скрипты: `lib.js` (сбор/парсинг), `db.js` (БД+norm), `import.js` (импорт `--limit/--full`).
- [x] Полный прогон ЗАВЕРШЁН (2026-06-29). Сбор: `collect-all.js` (оценки 417 курсором start_from_id) + погреб через `/api/cellars/2297289?per_page=200` (102 записи; total_count=109 завышен на 7 фантомов). Импорт: `import.js --full` (идемпотентный: чекпойнт `imported-reviews.json` + дедуп по содержимому; фото не перезаписываются).
  - **Итог:** фото погреба **102/102** (1 IN_CELLAR без фото — Clos des Amandiers Pomerol 2016 — куплен 29.06, в Vivino не добавлялся, это норма). Заметки **417/417** (привязка к погребу 28, consumed-якорей 390, у каждой заметки есть фото). Рейтинги в диапазоне. Погреб не засорён: IN_CELLAR=103.
  - Баг по ходу: безвинтажные (N.V.) вина → `Number("N.V.")=NaN` ломал вставку года. Фикс `toYear()` (нечисло→null), догон 20 шт. без ошибок.
  - Доп.источник типа/hi-res фото для не-погребных оценок: `GET /api/vintages/{id}` (JSON: wine.type_id + image.variations).

## Эндпоинты (рабочие, проверено)
- `GET /api/vintages/{vintageId}` → `{vintage:{wine:{type_id,name,winery,region},image:{variations:{bottle_large,...}}}}`. Cookie-сессия.
- Vivino type_id→WineType: 1 RED, 2 WHITE, 3 SPARKLING, 4 ROSE, 7 SWEET, 24 FORTIFIED.

## Запуск скриптов
Из `code/`: `NODE_PATH=code/node_modules node <script>`. CDP на `http://localhost:9222`. Chrome запущен в фоне (профиль в scratchpad), Vivino залогинен.

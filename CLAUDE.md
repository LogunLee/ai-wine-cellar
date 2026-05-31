# AI Wine Cellar — Project Instructions

> Этот файл должен читаться при КАЖДОМ запросе пользователя. Сверяйся с ним перед выполнением любых действий.

## Структура проекта

```
AI-wine-cellar/
├── CLAUDE.md                  # Инструкции для Claude (этот файл)
├── TODO.md                    # Список задач
├── README.md                  # Документация проекта
├── docs/                      # Документация
├── .git/                      # Git репозиторий
├── .gitignore
└── code/                      # ВЕСЬ код проекта
    ├── src/                   # NestJS backend
    │   ├── modules/
    │   │   ├── discounts/     # Модуль скидок (основной активный)
    │   │   │   ├── scraper/   # Скрейперы магазинов
    │   │   │   ├── normalizer/# Нормализация данных
    │   │   │   ├── scheduler/ # Расписание (ОТКЛЮЧЁН)
    │   │   │   ├── stores/    # Управление магазинами
    │   │   │   └── discounts/ # API скидок
    │   │   ├── wine-cellar/   # Погреб пользователя
    │   │   ├── wine-search/   # Поиск вина (AI)
    │   │   ├── wine-research/ # Исследование вина (AI)
    │   │   ├── ai-models/     # Управление AI моделями
    │   │   └── auth/          # Аутентификация
    │   └── shared/
    │       └── database/      # Prisma service
    ├── frontend/              # Vite + React + TypeScript
    │   └── src/
    │       ├── app/MainLayout.tsx    # Основной layout с sidebar
    │       ├── pages/
    │       │   └── DiscountsPage.tsx # Страница скидок (infinite scroll)
    │       └── shared/api/   # API клиенты
    ├── prisma/
    │   └── schema.prisma     # Схема БД (PostgreSQL)
    └── package.json          # npm run dev:all — запуск всего
```

## Команды запуска

- **Все команды запускаются из папки `code/`**
- `cd code && npm run dev:all` — запускает бэкенд (:3000) и фронтенд (:5173) одновременно
- `cd code && npm run start:dev` — только бэкенд
- `cd code/frontend && npm run dev` — только фронтенд
- **После ЛЮБОЙ правки** — проверяй, что `http://localhost:5173/` открывается
- **Запускать бэкенд и фронтенд в фоне без окон** (через `Start-Process ... -WindowStyle Hidden`), если пользователь не попросил явно запустить с консолью
- **При Hidden-запуске** — всегда логировать вывод в файл: бэкенд → `C:\Users\LoGun\AppData\Local\Temp\opencode\backend.log`, фронтенд → `C:\Users\LoGun\AppData\Local\Temp\opencode\frontend.log`

## База данных

- **PostgreSQL** на `localhost:5432`, БД: `ai_wine_cellar`
- **Prisma 7.x** с адаптером `@prisma/adapter-pg`
- Подключение: `postgresql://postgres:postgres@localhost:5432/ai_wine_cellar`
- Основные таблицы: `store`, `scrape_job`, `raw_offer`, `discount_offer`

## Модуль скидок (Discounts)

### Скрейперы

| Магазин | Код | Файл | Особенности |
|---------|-----|------|-------------|
| SimpleWine | `simplewine` | `simplewine.scraper.ts` | API `platform/api/v1/catalog/vino` + `shampanskoe_i_igristoe_vino`, фильтр `filter[sale]=1` |
| Винлаб | `winelab` | `winelab.scraper.ts` | Sitemap + API `/productdata/populateProduct`, `volumePrices[0]`=old, `volumePrices[1]`=current. Игристые уже в sitemap |
| AMWine | `amwine` | `amwine.scraper.ts` | `window.products`, пагинация через клик `button.pagination__button-more`. Тихие: `/catalog/vino/`, игристые: `/catalog/igristoe_vino_i_shampanskoe/` |
| Отдохни | `coolclever` | `coolclever.scraper.ts` | Playwright, пагинация `?page=N`, 429 rate limit. Тихие: `/catalog/otdokhni/vino`, игристые: `/catalog/otdokhni/shampanskoe-igristoe` |
| Metro | `metro` | `metro.scraper.ts` | DOM парсинг. Тихие: `/category/alkogolnaya-produkciya/vino`, игристые: `/category/alkogolnaya-produkciya/shampanskoe-igristye-vina` |
| FortWine | `fortwine` | `fortwine.scraper.ts` | DOM парсинг, пагинация `?PAGEN_1=N`. Тихие: `/vino/`, игристые: `/igristye_vina/` |

### Ключевые правила скрейперов

- **30 секунд** пауза между запросами/страницами
- **НЕТ лимитов страниц в продакшне** — скрейпить до конца каталога
- **ПРИ ОТЛАДКЕ** — использовать ENV `SCRAPER_MAX_PAGES=3` для ограничения страниц/батчей. Это позволяет быстро проверить новую логику, не ожидая час полной загрузки. После подтверждения работоспособности — убрать лимит и запустить полный скрапинг.
- **НЕТ автозапуска** — скрейпинг ТОЛЬКО по ручной команде через `POST /admin/discount-stores/:id/run`
- WineLab определяет вино по regex: `^[\u0412\u0432]\u0438\u043d\u043e`, портвейн, вермут, игристое
- AMWine: `price=0` → нет скидки, `old_price` как текущая; discount < 1% → игнорировать

### Сортировка

- По умолчанию: `discountPercent DESC` с `COALESCE(discount_percent, 0)` — NULL = 0
- `discounts.service.ts` использует raw SQL для сортировки по скидке
- Вторичная сортировка: `oldPrice DESC, nulls: last`

### Фронтенд DiscountsPage

- **Infinite scroll** — подгрузка при скролле (limit=50)
- **Debounce 800ms** на всех фильтрах перед отправкой запроса
- Фильтры: поиск, тип вина, страна, скидка от %, цена от/до, в наличии
- Sidebar: collapsible, логотип + "Enolo", выравнивание по левому краю (`justifyContent: 'flex-start'`)

## Scheduler (ОТКЛЮЧЁН)

- `scheduler.service.ts` — **все @Cron декораторы удалены**
- Автозапуск скрейпинга **ЗАПРЕЩЁН**
- Только ручной запуск через API

## Нормализация

- `normalizer.service.ts` — создаёт/обновляет `discount_offer` из `raw_offer`
- `discountPercent` вычисляется: `Math.round(((oldPrice - currentPrice) / oldPrice) * 100)`
- Wine type mapping: red→RED, white→WHITE, rose→ROSE, sparkling→SPARKLING, dessert→SWEET, fortified→FORTIFIED

## Чего НЕ делать

1. **НЕ запускать скрейперы автоматически** — никаких cron, interval, auto-trigger
2. **НЕ запускать полный скраппинг на этапе отладки кода** — всегда использовать `SCRAPER_MAX_PAGES=3` для быстрой проверки. Полный скраппинг — ТОЛЬКО по явной команде человека
3. **НЕ хардкодить лимиты страниц** в скрейперах — использовать только ENV `SCRAPER_MAX_PAGES` для отладки, в продакшне лимитов нет
4. **НЕ менять порт** — бэкенд :3000, фронтенд :5173
5. **НЕ создавать документацию** без явного запроса
6. **НЕ коммитить изменения** без явного запроса
7. **НЕ использовать `||` в PowerShell** — PowerShell 5.1 не поддерживает `&&` и `||`
8. **НЕ фантазировать** имена пользователей, URL, данные
9. **НЕ трогать файлы проекта, пока скраперы работают** — `nest start --watch` перезапускает сервер при любом изменении файлов в `src/`, это убивает все активные скраперы. Правки кода — только когда скраперы остановлены.
10. **НЕ перезапускать сервер, пока скраперы работают** — `--watch` перезапускает NestJS → kills active jobs → `resumeAllStalled` при старте → возможен рестарт скрапинга с начала. Любые правки кода — только после завершения всех скраперов.
11. **НЕ запускать серверы с видимым окном** — всегда запускать бэкенд и фронтенд в фоне (`-WindowStyle Hidden`), если пользователь явно не попросил запустить с консолью
12. **НЕ править `.env`** без явного согласия пользователя

## После каждой правки

1. Проверить, что `http://localhost:5173/` открывается
2. Проверить, что `http://localhost:3000/` отвечает
3. Если серверы упали — перезапустить через `npm run dev:all`

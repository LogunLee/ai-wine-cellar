# Enolo Android — План реализации (архитектура для разработки)

> Документ самодостаточный. Его задача — позволить реализовать нативное Android‑приложение
> к существующему backend (NestJS, порт 3000) **без чтения кода backend/frontend**.
> Все контракты API, форматы JSON и нетривиальные алгоритмы приведены ниже дословно.
>
> Стек: **Kotlin + Jetpack Compose + Hilt + Retrofit/OkHttp + Coroutines/Flow**.
> Авторизация: **только email/пароль** (Google‑вход в v1 НЕ делаем).
> «Избранное»: **заглушка**, как в web (вкладка есть, внутри — текст «скоро появится»).

---

## 0. Что это за продукт (контекст)

Enolo — «винный погреб». Backend уже готов и не меняется. Web‑клиент умеет:
- авторизацию (email/пароль, JWT + refresh);
- «Найти вино»: распознать вино по фото (этикетка) или по тексту → получить список вин →
  отредактировать → добавить в погреб; по каждому вину — «исследование» (AI собирает карточку);
- «Погреб»: список своих вин, правка, удаление, заметка, фото;
- «Скидки»: большой список винных предложений со скидками (только просмотр, фильтры, поиск);
- «Избранное»: заглушка.

Скрейперы скидок — серверная фоновая задача, в мобильное приложение НЕ переносятся
(мобилка только читает готовый список через `GET /discounts/offers`).

### Карта экранов мобилки

Нижний навигационный бар (Bottom Navigation), 4 вкладки:

| Вкладка      | Назначение                                                                 |
|--------------|----------------------------------------------------------------------------|
| **Главная**  | Строка поиска + кнопка камеры → поток «Найти вино» (как web «Найти вино»).  |
| **Скидки**   | Список скидок с фильтрами и бесконечной прокруткой (read‑only).             |
| **Погреб**   | Список вин пользователя, правка/удаление/заметка/фото.                      |
| **Избранное**| Заглушка («Раздел появится позже»).                                         |

Вне нижнего бара:
- **Экран входа** (Login) — email, пароль, **поле «Сервер»** (адрес backend), кнопка «Войти»,
  ссылка на регистрацию.
- **Экран регистрации** (Register) — email, пароль, имя (опц.), «Сервер».
- Диалог/экран **«Исследование вина»** (research) — вызывается из результатов поиска.

---

## 1. Параметры backend, которые надо знать наизусть

- **Базовый адрес:** настраивается пользователем на экране входа (LAN‑адрес, напр. `http://192.168.1.100:3000`).
  Глобального префикса (`/api`) НЕТ — пути начинаются прямо от корня: `/auth/login`, `/wine-cellar/items`, …
- **Протокол:** обычный **HTTP** (не HTTPS) внутри Wi‑Fi → требуется разрешение cleartext (см. §4).
- **Аутентификация:** `Authorization: Bearer <access_token>` на всех защищённых эндпоинтах.
  - `access_token` — JWT, срок **7 дней**, payload `{ "sub": "<userId>" }`.
  - `refresh_token` — непрозрачная строка (UUID), срок **30 дней**. Обновление — `POST /auth/refresh`.
- **CORS** настроен только для web‑origin. Нативный Android **не отправляет** заголовок `Origin`,
  поэтому CORS его не блокирует — проблем нет (важно: не использовать WebView для API).
- **Лимит тела запроса:** 50 МБ (распознавание шлёт base64‑картинки — помещается).
- **Статика:** загруженные фото вин отдаются по `GET <server>/uploads/...` (без токена).
  `photoPath` в ответах приходит как **относительный путь** (`/uploads/cellar/xxx.jpg`) —
  для показа клеить с базовым адресом сервера: `"<server>" + photoPath`.

### Важные нюансы сериализации
- **Только в auth‑ответах** имена полей в snake_case: `access_token`, `refresh_token`.
  Во всех остальных DTO — camelCase (`wineName`, `discountPercent`, `vintageYear`, …).
  → в Kotlin использовать `@SerialName("access_token")` точечно.
- В `/wine-search/recognize` картинки передаются как **чистый base64 без префикса**
  `data:image/...;base64,` (префикс добавляет сам сервер).

---

## 2. Полная карта API (контракт)

Легенда: 🔒 — нужен `Authorization: Bearer`. Пути — относительно базового адреса сервера.

### Аутентификация
| Метод | Путь | Тело запроса | Ответ |
|------|------|--------------|-------|
| POST | `/auth/register` | `{ email, password, displayName? }` | `AuthResponse` |
| POST | `/auth/login` | `{ email, password }` | `AuthResponse` |
| POST | `/auth/refresh` | `{ refresh_token }` | `AuthResponse` |
| POST | `/auth/logout` 🔒 | `{ refresh_token }` | `{ message }` |
| GET  | `/auth/me` 🔒 | — | `User` |

`AuthResponse`:
```json
{
  "access_token": "jwt...",
  "refresh_token": "uuid...",
  "user": { "id": "...", "email": "...", "login": null, "displayName": "...", "avatarPath": null }
}
```
`User` = объект `user` выше. Ошибка логина → HTTP 401, тело `{ "message": "Invalid email or password", ... }`.
Регистрация существующего email → HTTP 409.

### Справочник стран
| Метод | Путь | Ответ |
|------|------|-------|
| GET | `/countries` (без токена) | `Country[]` |

`Country`: `{ "id": "...", "iso2": "FR", "iso3": "FRA", "name": "France" }`
Назначение: маппинг между `iso2` (его шлём на сервер в поле `country`) и человекочитаемым названием.

### Погреб
| Метод | Путь | Тело | Ответ |
|------|------|------|-------|
| GET | `/wine-cellar/items` 🔒 | — | `CellarItem[]` |
| POST | `/wine-cellar/add` 🔒 | `AddWineDto` | объект cellarItem (можно игнорировать, после — перечитать список) |
| PUT | `/wine-cellar/{id}` 🔒 | `Partial<AddWineDto>` | обновлённый `CellarItem` |
| DELETE | `/wine-cellar/{id}` 🔒 | — | `{ message }` |
| GET | `/wine-cellar/{id}/note` 🔒 | — | `{ id, text } | null` |
| POST | `/wine-cellar/{id}/note` 🔒 | `{ text }` | note или `null` (пустой текст удаляет заметку) |
| POST | `/wine-cellar/{id}/photo` 🔒 | multipart, поле `photo` (файл) | `{ photoPath }` |
| POST | `/wine-cellar/{id}/fetch-photo` 🔒 | `{ producer, name, vintageYear? }` | `{ photoPath: string | null }` |

`AddWineDto`:
```json
{ "producer": "...", "name": "...", "vintageYear": 2019, "region": "...",
  "country": "FR", "wineType": "RED", "quantity": 1 }
```
- `country` — **ISO2‑код** (не название!). `wineType` ∈ `RED|WHITE|ROSE|SPARKLING|SWEET|FORTIFIED|OTHER`.
- `vintageYear`, `region`, `country`, `wineType` — опциональны. `quantity` ≥ 1.

`CellarItem` (ответ списка):
```json
{ "id": "...", "producer": "...", "name": "...", "vintageYear": 2019,
  "region": "...", "country": "France", "countryIso2": "FR", "wineType": "RED",
  "grapes": ["Merlot"], "quantity": 2, "status": "IN_CELLAR",
  "photoPath": "/uploads/cellar/xxx.jpg", "createdAt": "2026-..." }
```
Замечания: в списке `country` приходит **названием** + есть `countryIso2`; `grapes` может быть `null`;
`photoPath` может отсутствовать/`null`.

### Поиск/распознавание вина
| Метод | Путь | Тело | Ответ |
|------|------|------|-------|
| POST | `/wine-search/recognize` 🔒 | `{ images: string[] }` (base64 без префикса) | `{ wines: WineRecognitionResult[] }` |
| POST | `/wine-search/text-search` 🔒 | `{ text }` | `{ wines: WineRecognitionResult[] }` |
| POST | `/wine-research/research` 🔒 | `WineResearchInput` | `WineResearchResult` |

`WineRecognitionResult`:
```json
{ "producer": "...", "name": "...", "vintageYear": 2019, "region": "...",
  "country": "FR", "wineType": "RED", "confidence": 0.92 }
```
(`confidence` — число 0..1. Поля кроме producer/name могут быть null.)

`WineResearchInput`: `{ "wineName": "...", "vintage": "2019", "producerHint": "...", "countryHint": "..." }`
(на вход в research передаём имя, винтаж строкой, producer как подсказку.)

`WineResearchResult`:
```json
{
  "wine": {
    "fullName": null, "producer": null, "country": null, "region": null,
    "appellation": null, "vintage": null, "wineType": null, "grapes": null,
    "alcohol": null, "sugar": null, "acidity": null, "aging": null, "style": null,
    "tastingProfile": null, "storagePotential": null, "servingTemperature": null,
    "foodPairing": null
  },
  "confidence": "high|medium|low",
  "missingFields": ["..."],
  "sources": [ { "title": "...", "url": "...", "sourceType": "producer|...|unknown",
                 "trustLevel": "high|medium|low", "used": true } ],
  "notes": ["..."]
}
```
Все строковые поля `wine.*` могут быть `null`; `grapes`/`foodPairing` — `string[]|null`.
**research работает медленно (до ~120 c)** — нужен большой таймаут на этот вызов и индикатор загрузки.

### Скидки (read‑only)
| Метод | Путь | Параметры (query) | Ответ |
|------|------|-------------------|-------|
| GET | `/discounts/offers` 🔒 | см. `DiscountFilters` | `{ items: DiscountOffer[], total, page, limit }` |
| GET | `/admin/discount-stores` 🔒 | — | `Store[]` (для фильтра «Продавец») |

`DiscountFilters` (все опциональны, передаются как query‑строки):
```
page, limit, sort, storeId, seller, country, region, wineType,
minDiscount, minPrice, maxPrice, vintage, availability, confidence,
status, search, grapes (через запятую), monosort (true/false)
```
- Дефолтная сортировка как в web: `sort = "discountPercent_desc"`.
- Пагинация: `limit = 50`, `page` инкрементируется; «есть ещё» = `items.length >= limit`.
- `grapes` — строка вида `"Merlot,Syrah"`. `monosort=true` — только моносортовые.

`DiscountOffer` (основные поля для UI):
```json
{ "id": "...", "sellerName": "SimpleWine", "producer": null, "wineName": "...",
  "wineNameRaw": "...", "fullName": null, "vintage": "2019", "country": "Италия",
  "region": null, "regionCanonical": null, "appellation": null, "sweetness": null,
  "alcohol": 13.5, "wineType": "RED", "volumeMl": 750,
  "currentPrice": 1290, "oldPrice": 1990, "discountPercent": 35, "discountAmount": 700,
  "currency": "RUB", "url": "https://...", "imageUrl": "https://...",
  "availability": null, "grapes": ["Sangiovese"], "grapeCount": 1,
  "confidence": "medium", "status": "active", "lastCheckedAt": "..." }
```
Отображать имя вина: `wineName ?: wineNameRaw`. Тип/страна/объём — вторая строка.
`imageUrl` — абсолютный URL картинки магазина (грузить через Coil). По тапу на оффер — открыть `url` во внешнем браузере.

`Store`: `{ id, name, code, baseUrl, active, parserType, currency, country, ... }` — для UI достаточно `id` и `name`.

---

## 3. Технологический стек и обоснование

| Слой | Выбор | Почему |
|------|-------|--------|
| Язык | Kotlin | стандарт Android |
| UI | Jetpack Compose (Material 3) | меньше boilerplate, проще для генерации кода |
| Навигация | Navigation‑Compose | штатная, простая интеграция с BottomBar |
| DI | Hilt | минимум ручной проводки зависимостей |
| Сеть | Retrofit + OkHttp | + logging‑interceptor, auth‑interceptor, authenticator |
| JSON | kotlinx.serialization (`retrofit2-kotlinx-serialization-converter`) | `@SerialName`, null‑safety |
| Асинхрон | Coroutines + Flow / StateFlow | стандарт |
| Хранилище настроек | DataStore (Preferences) | серверный URL, токены, флаги |
| Картинки | Coil (`coil-compose`) | загрузка `imageUrl`/`photoPath` |
| Камера/фото | System Intent (`ACTION_IMAGE_CAPTURE`) + Photo Picker | без CameraX — проще и надёжнее |
| Архитектура | MVVM (ViewModel + StateFlow) + Repository | предсказуемо, тестируемо |

**Однамодульный проект** (один Gradle‑модуль `app`) с разбиением по пакетам — намеренно,
чтобы упростить генерацию кода. Без многомодульности.

Версии (ориентир, можно поднять до актуальных на момент сборки):
- `compileSdk = 35`, `minSdk = 26`, `targetSdk = 35`
- Kotlin 2.x, AGP актуальный, Compose BOM актуальный
- Hilt 2.5x, Retrofit 2.11, OkHttp 4.12, kotlinx‑serialization 1.7, DataStore 1.1, Coil 2.7

---

## 4. AndroidManifest, сеть, разрешения

### Разрешения
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<!-- для ACTION_IMAGE_CAPTURE через FileProvider камера-разрешение формально не всегда нужно,
     но объявляем; запрашиваем в рантайме перед съёмкой -->
```

### Cleartext HTTP (обязательно — сервер по http в LAN)
`AndroidManifest.xml` → `<application android:networkSecurityConfig="@xml/network_security_config" ...>`

`res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Разрешаем http для приватных диапазонов LAN -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">192.168.0.0</domain>
        <!-- проще: разрешить весь cleartext, т.к. адрес сервера произвольный -->
    </domain-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
```
> Поскольку пользователь вводит произвольный адрес сервера, проще задать
> `base-config cleartextTrafficPermitted="true"`. Для релиза можно сузить.

### FileProvider (для фото с камеры)
В манифесте — `<provider>` `androidx.core.content.FileProvider` с `@xml/file_paths`,
authority `${applicationId}.fileprovider`.

### Дефолтный адрес сервера (плейсхолдер‑константа)
`app/build.gradle` → в `defaultConfig`:
```kotlin
buildConfigField("String", "DEFAULT_SERVER_URL", "\"http://192.168.1.100:3000\"")
// TODO разработчику: заменить на IP машины с backend в своей Wi-Fi сети перед сборкой
```
Включить `buildFeatures { buildConfig = true }`.
На экране входа поле «Сервер» инициализируется значением из DataStore, а если там пусто —
из `BuildConfig.DEFAULT_SERVER_URL`. Пользователь может отредактировать.

---

## 5. Структура пакетов

```
com.enolo.app
├── EnoloApp.kt                  // @HiltAndroidApp
├── MainActivity.kt              // setContent { EnoloRoot() }
├── core/
│   ├── config/
│   │   └── AppConfig.kt         // BuildConfig.DEFAULT_SERVER_URL, ключи DataStore
│   ├── storage/
│   │   ├── SettingsStore.kt     // DataStore: serverUrl, accessToken, refreshToken
│   │   └── SessionManager.kt    // обёртка над токенами + isLoggedIn Flow
│   ├── network/
│   │   ├── HostSelectionInterceptor.kt  // подмена baseUrl на текущий serverUrl
│   │   ├── AuthInterceptor.kt           // добавляет Bearer
│   │   ├── TokenAuthenticator.kt        // 401 → refresh → повтор
│   │   ├── ApiResult.kt                 // sealed класс успех/ошибка
│   │   └── ServerUrl.kt                 // нормализация адреса (схема, без хвостового /)
│   └── di/
│       ├── NetworkModule.kt
│       └── StorageModule.kt
├── data/
│   ├── api/
│   │   ├── AuthApi.kt
│   │   ├── CellarApi.kt
│   │   ├── WineSearchApi.kt
│   │   ├── DiscountsApi.kt
│   │   └── CountriesApi.kt
│   ├── dto/                     // все DTO из §2 (kotlinx.serialization)
│   └── repository/
│       ├── AuthRepository.kt
│       ├── CellarRepository.kt
│       ├── WineSearchRepository.kt
│       ├── DiscountsRepository.kt
│       └── CountriesRepository.kt
├── ui/
│   ├── theme/                   // Material3 тема, цвета (бренд #BE0212)
│   ├── root/
│   │   ├── EnoloRoot.kt         // навхост: gate login/main
│   │   └── BottomBar.kt
│   ├── auth/
│   │   ├── LoginScreen.kt  + LoginViewModel.kt
│   │   └── RegisterScreen.kt + RegisterViewModel.kt
│   ├── home/                    // «Главная» = поток «Найти вино»
│   │   ├── HomeScreen.kt
│   │   ├── HomeViewModel.kt
│   │   ├── SearchResultsSection.kt
│   │   └── ResearchDialog.kt
│   ├── discounts/
│   │   ├── DiscountsScreen.kt + DiscountsViewModel.kt
│   │   └── DiscountFiltersSheet.kt
│   ├── cellar/
│   │   ├── CellarScreen.kt + CellarViewModel.kt
│   │   ├── CellarItemRow.kt
│   │   ├── EditWineDialog.kt
│   │   └── NoteDialog.kt
│   └── favorites/
│       └── FavoritesScreen.kt   // заглушка
└── util/
    ├── ImageCompressor.kt       // bitmap → base64 (алгоритм web, §8)
    └── Formatters.kt            // цена ru-RU, литры и т.п.
```

---

## 6. Сеть: динамический baseUrl, токены, refresh

Поскольку адрес сервера задаётся в рантайме, **не пересоздаём Retrofit** — используем
`HostSelectionInterceptor`, который переписывает host/port/scheme запроса на текущий serverUrl.
Retrofit создаём с любым валидным placeholder‑baseUrl (напр. `http://localhost/`).

### ServerUrl.kt (нормализация)
```kotlin
object ServerUrl {
    /** Приводит ввод пользователя к http(s)://host:port без хвостового слэша. */
    fun normalize(raw: String): String {
        var s = raw.trim()
        if (s.isEmpty()) return s
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
        return s.trimEnd('/')
    }
    fun toHttpUrl(raw: String): okhttp3.HttpUrl? =
        normalize(raw).toHttpUrlOrNull()
}
```

### HostSelectionInterceptor.kt
```kotlin
class HostSelectionInterceptor @Inject constructor(
    private val settings: SettingsStore
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val base = settings.serverUrlBlocking()           // текущий адрес из DataStore
        val newBase = base.toHttpUrlOrNull() ?: return chain.proceed(req)
        val newUrl = req.url.newBuilder()
            .scheme(newBase.scheme)
            .host(newBase.host)
            .port(newBase.port)
            .build()
        return chain.proceed(req.newBuilder().url(newUrl).build())
    }
}
```

### AuthInterceptor.kt — добавляет токен (кроме auth‑эндпоинтов)
```kotlin
class AuthInterceptor @Inject constructor(
    private val session: SessionManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val path = req.url.encodedPath
        val skip = path.endsWith("/auth/login") || path.endsWith("/auth/register") ||
                   path.endsWith("/auth/refresh")
        val token = session.accessTokenBlocking()
        val out = if (!skip && !token.isNullOrEmpty())
            req.newBuilder().header("Authorization", "Bearer $token").build()
        else req
        return chain.proceed(out)
    }
}
```

### TokenAuthenticator.kt — 401 → refresh → повтор (один раз)
```kotlin
class TokenAuthenticator @Inject constructor(
    private val session: SessionManager,
    private val refreshApiProvider: Provider<AuthApi> // отдельный Retrofit без authenticator!
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null         // уже пробовали — стоп
        val refresh = session.refreshTokenBlocking() ?: return null
        val newTokens = runBlocking {
            runCatching { refreshApiProvider.get().refresh(RefreshRequest(refresh)) }.getOrNull()
        } ?: run { session.clearBlocking(); return null }       // refresh не сработал → разлогин
        session.saveTokensBlocking(newTokens.accessToken, newTokens.refreshToken)
        return response.request.newBuilder()
            .header("Authorization", "Bearer ${newTokens.accessToken}")
            .build()
    }
    private fun responseCount(r: Response): Int { var c=1; var p=r.priorResponse; while(p!=null){c++;p=p.priorResponse}; return c }
}
```
> Важно: для refresh использовать **отдельный** OkHttp/Retrofit без `TokenAuthenticator`
> (иначе рекурсия). Этот отдельный клиент всё равно проходит через `HostSelectionInterceptor`.

### Поведение при провале refresh
`session.clear()` → переключение навигации на Login (через Flow `isLoggedIn`).

### Таймауты
- Обычные вызовы: connect/read/write 30 c.
- **`/wine-research/research`:** read‑timeout 130 c (через отдельный `@Tag`/отдельный клиент,
  либо аннотация — проще выделить отдельный OkHttp‑клиент `longRunningClient`). Распознавание
  по фото тоже может быть долгим — read‑timeout 60 c.

---

## 7. Хранилище и сессия

`SettingsStore` (DataStore Preferences) ключи:
- `server_url: String` (если пусто → `BuildConfig.DEFAULT_SERVER_URL`)
- `access_token: String?`
- `refresh_token: String?`

`SessionManager`:
- `val isLoggedIn: Flow<Boolean>` (== есть access_token)
- `suspend fun saveTokens(...)`, `suspend fun clear()`
- блокирующие версии (`...Blocking()`) для интерсепторов/authenticator (через `runBlocking` над DataStore).

Логика старта приложения:
1. Прочитать токены. Если `access_token` есть → пробуем `GET /auth/me`.
   - 200 → сразу на главный экран (BottomBar, стартовая вкладка «Главная»).
   - 401 (после авто‑refresh) или сети нет → на Login.
2. Нет токена → Login.

---

## 8. Утилита сжатия изображения (точная копия web‑алгоритма)

Web сжимает каждое фото перед отправкой в `/wine-search/recognize`. Параметры (соблюсти 1:1):
- макс. сторона **1600 px** (масштабировать пропорционально, если больше);
- JPEG, начинать с quality **0.85**, шагом **−0.1** уменьшать, пока размер > **350 КБ**
  (нижняя граница quality 0.1);
- результат — **base64 без префикса** `data:image/jpeg;base64,` (только сами данные).

`ImageCompressor.kt` (псевдо‑реализация):
```kotlin
object ImageCompressor {
    private const val MAX_SIDE = 1600
    private const val MAX_BYTES = 350 * 1024

    suspend fun toBase64(context: Context, uri: Uri): String = withContext(Dispatchers.IO) {
        var bmp = decodeScaled(context, uri, MAX_SIDE)   // ExifInterface: учесть поворот!
        var quality = 85
        var bytes: ByteArray
        do {
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
            bytes = out.toByteArray()
            quality -= 10
        } while (bytes.size > MAX_BYTES && quality >= 10)
        Base64.encodeToString(bytes, Base64.NO_WRAP)     // NO_WRAP — без переводов строк!
    }
}
```
Не забыть **поворот по EXIF** (фото с камеры часто повёрнуты).

Источники изображения на «Главной»:
- кнопка камеры → `ACTION_IMAGE_CAPTURE` (через FileProvider Uri) → сжать → добавить в список;
- (доп., по желанию) выбор из галереи через Photo Picker → сжать → добавить.
Можно набирать несколько фото (как web). Для распознавания отправляем массив `images`.

---

## 9. Экран входа (Login) и регистрация

### LoginScreen — поля
1. **Сервер** — TextField,初始 = `serverUrl` из DataStore (или `DEFAULT_SERVER_URL`).
   Подпись/подсказка: «Адрес сервера в локальной сети, напр. http://192.168.1.100:3000».
2. **Email** — TextField (keyboardType Email).
3. **Пароль** — TextField (password, иконка показать/скрыть).
4. Кнопка **«Войти»** (loading‑состояние).
5. Ссылка **«Нет аккаунта? Зарегистрироваться»** → RegisterScreen.

Поведение «Войти»:
1. Нормализовать и **сохранить serverUrl в DataStore ДО запроса** (чтобы интерсептор увидел адрес).
2. `POST /auth/login {email,password}` → при успехе сохранить токены, перейти на главный экран.
3. Ошибки:
   - 401 → «Неверный email или пароль».
   - сетевые (timeout/connection refused) → «Не удаётся подключиться к серверу. Проверьте адрес и Wi‑Fi».
   - показывать в Snackbar/Alert.

RegisterScreen аналогично + поле «Имя» (опц.) + «Сервер»; `POST /auth/register`. 409 → «Email уже занят».

Бренд‑акцент: основной цвет кнопок `#BE0212` (как в web), логотип `logo.jpg` можно положить в `res/drawable` (или временный плейсхолдер).

---

## 10. «Главная» (поток «Найти вино»)

Полный функциональный аналог web‑модалки «Найти вино». Состояния экрана (одна ViewModel, sealed UI‑state):

### Состояние A — ввод
- Поле ввода текста: «Опишите вино или введите название».
- Кнопка **камеры** (и опц. «галерея»). Под полем — превью добавленных фото (с крестиком удаления).
- Кнопка **«Найти»** (disabled, если нет ни текста, ни фото).
- Правило (как web): **если есть фото — текст игнорируется** (показать подсказку).

По «Найти»:
- если есть фото → сжать все → `POST /wine-search/recognize {images}`;
- иначе → `POST /wine-search/text-search {text}`;
- результат `wines[]` → состояние B.
- ошибки → Snackbar, остаться в состоянии A.

### Состояние B — результаты (список карточек вин)
Каждая карточка (`WineRecognitionResult` + локальные поля):
- чекбокс «выбрано» (по умолчанию true);
- заголовок `producer + name`;
- чипы: `vintageYear`, `region`, `country`, `wineType` (цветной чип типа), `confidence` в % (цвет: >80 зелёный, >50 жёлтый, иначе красный);
- степпер «количество бутылок» (−/число/+, минимум 1);
- иконка **«редактировать»** → инлайн‑правка (producer, name, год, регион, страна‑Autocomplete по `/countries`);
- иконка **«исследование»** (Search) → открыть `ResearchDialog` (см. ниже).
- Кнопка снизу: **«Добавить в погреб (N)»**, где N — суммарное число бутылок выбранных вин.
  По нажатию: для каждого выбранного — `POST /wine-cellar/add` (можно параллельно).
  Успех → тост «Добавлено в погреб», очистить экран/вернуть в состояние A; уведомить «Погреб» обновиться.
- Кнопка «назад» → вернуться в состояние A (сохранив ввод).

> **Отличие от web (намеренно):** в web в результатах есть кнопка «найти фото», которая шлёт
> `fetch-photo` с **несуществующим** id вина (`wine-0`) — это латентный баг web (фото некуда сохранять,
> вино ещё не в погребе). На мобилке **не добавляем** «найти фото» в результаты поиска.
> Загрузка/поиск фото доступны в «Погребе», где у вина есть реальный `id`.

### Маппинг страны при добавлении
В `AddWineDto.country` нужен **ISO2**. Из распознавания `country` может прийти уже как ISO2
(`"FR"`) или как название. При правке используем Autocomplete из `/countries`, который отдаёт `iso2`.
Если пришло название — найти в справочнике по `name` (case‑insensitive) → взять `iso2`; если не нашли — слать как есть (бэкенд сам пытается сопоставить, иначе ставит дефолт).

### ResearchDialog
- На открытии сразу шлёт `POST /wine-research/research { wineName=name, vintage=year?, producerHint=producer }`.
- Показ: индикатор «Ищу информацию о вине…» (может занять до 2 минут).
- Результат: чип уверенности (Высокая/Средняя/Низкая), чип «Не найдено: …», грид полей карточки
  (только непустые поля `wine.*`), список источников (кликабельные ссылки, открывать во внешнем браузере),
  блок «Примечания».
- Кнопка «Повторить».

---

## 11. «Скидки» (read‑only список)

ViewModel хранит: `filters`, `items`, `page`, `total`, `hasMore`, `loading`, `loadingMore`.

- Первая загрузка: `GET /discounts/offers?sort=discountPercent_desc&limit=50&page=1`.
- **Бесконечная прокрутка**: при приближении к концу списка (LazyColumn, порог ~5 элементов до конца),
  если `hasMore && !loadingMore` → грузить `page+1`, добавлять в конец. `hasMore = items.size_last >= 50`.
- **Фильтры** (как web; вынести в нижний лист/BottomSheet):
  поиск (`search`), тип вина (`wineType`), страна (`country`), «скидка от %» (`minDiscount`),
  «цена от/до» (`minPrice/maxPrice`), продавец (`seller`, из `GET /admin/discount-stores`),
  сорта винограда (`grapes`, мультивыбор; собрать варианты из уже загруженных `items.grapes`),
  переключатель «моносортовые» (`monosort`).
- Любое изменение фильтра → сброс на `page=1`, перезагрузка. **Debounce 500–800 мс** на текстовых полях.

Карточка оффера (строка):
- картинка `imageUrl` (Coil, плейсхолдер);
- название `wineName ?: wineNameRaw`, второй строкой — тип (рус. лейбл) + объём (`volumeMl/1000 л`) + страна;
- продавец (`sellerName`); сорта (`grapes`, до 2 строк);
- цена `currentPrice` (формат ru‑RU, разделители тысяч), зачёркнутая `oldPrice`;
- бейдж скидки `-{discountPercent}%` (цвет: <30 зелёный, <45 жёлтый, иначе красный — как web);
- тап по карточке → открыть `url` во внешнем браузере (`Intent.ACTION_VIEW`).

Рус. лейблы типа: RED→Красное, WHITE→Белое, ROSE→Розовое, SPARKLING→Игристое, SWEET→Десертное,
FORTIFIED→Креплёное, OTHER→(пусто).

---

## 12. «Погреб»

- Загрузка: `GET /wine-cellar/items` → `CellarItem[]`.
- Список (LazyColumn). По каждому вину строка/карточка:
  фото (`<server>+photoPath` или плейсхолдер), `producer name`, год, страна, регион,
  чип типа, чипы сортов, количество.
- Поиск (по producer/name/год, локально) + фильтры тип/страна/регион/сорт (локально, как web).
- Действия по вину:
  - **Редактировать** → `EditWineDialog` (producer, name, год, страна, регион, тип, кол‑во) →
    `PUT /wine-cellar/{id}` → обновить элемент в списке.
  - **Удалить** → подтверждение → `DELETE /wine-cellar/{id}` → убрать из списка.
  - **Заметка** → `NoteDialog`: `GET /wine-cellar/{id}/note` → показать; сохранить `POST /wine-cellar/{id}/note {text}`
    (пустой текст удаляет заметку).
  - **Фото с устройства** → камера/галерея → `POST /wine-cellar/{id}/photo` (multipart `photo`) → обновить `photoPath`.
  - **Найти фото в сети** → `POST /wine-cellar/{id}/fetch-photo {producer,name,vintageYear}` → если вернулся `photoPath`, обновить.
  - **Копировать** название (в буфер обмена) — опц., как в web.
- После добавления вина с «Главной» — список должен обновиться (общий репозиторий/событие или
  перезагрузка при возврате на вкладку).

`EditWineDialog`: страна выбирается через выпадающий список из `/countries` (label=name, value=iso2);
`PUT` отправляет `country` как **iso2**.

---

## 13. «Избранное» (заглушка)

`FavoritesScreen` — по центру текст: «Раздел «Избранное» появится позже». Без сети. (Паритет с web.)

---

## 14. Навигация и гейтинг

```
EnoloRoot:
  collectAsState(session.isLoggedIn)
   ├─ false → AuthNavHost { Login, Register }
   └─ true  → MainScaffold {
         BottomBar(tabs = [Главная, Скидки, Погреб, Избранное])
         NavHost(startDestination = "home") {
            home, discounts, cellar, favorites
         }
      }
```
- ResearchDialog — диалог поверх «Главной» (или отдельный маршрут).
- Кнопка «Выход» (можно вынести в шапку или в «Избранное»/«Погреб» как меню) → `POST /auth/logout {refresh_token}` затем `session.clear()`.
- Стартовая вкладка после входа — «Главная».

---

## 15. Обработка ошибок и состояния (единые правила)

- Любой запрос оборачивать в `ApiResult<T>` = `Success(data)` | `Error(code, message)` | `NetworkError`.
- Сетевые ошибки (нет соединения, неверный адрес) → дружелюбный текст про проверку адреса/Wi‑Fi.
- 401 обрабатывается прозрачно в `TokenAuthenticator`; повторный 401 → разлогин.
- Экраны: показывать loading (CircularProgress), empty‑state, error‑state с кнопкой «Повторить».
- research/recognize: явный длительный прогресс.

---

## 16. Порядок реализации (вехи для исполнителя)

Каждая веха — самостоятельный, проверяемый кусок. Двигаться строго по порядку.

**M0. Каркас проекта.** Gradle, зависимости, `EnoloApp` (@HiltAndroidApp), `MainActivity`,
тема Material3, `BuildConfig.DEFAULT_SERVER_URL`, network_security_config, FileProvider.
*Проверка:* приложение запускается, пустой экран.

**M1. Хранилище + сеть.** `SettingsStore`, `SessionManager`, `ServerUrl`, три интерсептора,
`TokenAuthenticator`, два OkHttp‑клиента (обычный и long‑running), Retrofit, `NetworkModule`/`StorageModule`.
DTO для auth. `AuthApi`. *Проверка:* unit‑smoke — логин на тестовый сервер возвращает токены (можно временной кнопкой).

**M2. Аутентификация (UI).** Login/Register экраны + ViewModel, гейтинг `EnoloRoot`,
автологин через `/auth/me`, logout. *Проверка:* вход/выход/перезапуск с сохранением сессии,
смена адреса сервера в поле работает.

**M3. Скелет главного экрана.** BottomBar + 4 вкладки‑заглушки, навигация между ними.
«Избранное» — финальная заглушка. *Проверка:* переключение вкладок.

**M4. Погреб (чтение).** DTO `CellarItem`, `CellarApi.getItems`, репозиторий, список с фото/чипами,
локальные поиск/фильтры. *Проверка:* список своих вин виден.

**M5. Погреб (изменения).** Edit (`PUT`), Delete, Note (`GET/POST note`), фото upload (`multipart`)
и fetch‑photo. Справочник `/countries` (кэш). *Проверка:* правка/удаление/заметка/фото работают.

**M6. Главная — текстовый поиск.** Поле + «Найти» → `text-search` → карточки результатов →
выбор/кол‑во/правка → `add` → обновление погреба. *Проверка:* добавление вина по тексту.

**M7. Главная — фото.** Камера (+галерея) → `ImageCompressor` (1600px/350КБ/base64 NO_WRAP, EXIF) →
`recognize` → те же карточки. *Проверка:* распознавание по фото этикетки.

**M8. Исследование.** `ResearchDialog` → `wine-research/research` (long‑timeout), рендер карточки/источников/примечаний.

**M9. Скидки.** DTO `DiscountOffer`/`Store`, `getOffers` с пагинацией и фильтрами, бесконечная
прокрутка, debounce, картинки Coil, бейджи/цены, открытие `url`. *Проверка:* список грузится, фильтры/скролл работают.

**M10. Полировка.** Empty/error/loading состояния, обработка отвалившегося сервера, иконки/тема,
тексты ошибок, проверка на реальном устройстве в одной Wi‑Fi с backend.

---

## 17. Критерии приёмки (чек‑лист)

- [ ] На экране входа есть поле «Сервер», предзаполненное `DEFAULT_SERVER_URL`, редактируемое; адрес сохраняется между запусками.
- [ ] Телефон в одной Wi‑Fi с backend успешно логинится по email/паролю на LAN‑адрес (http).
- [ ] Сессия переживает перезапуск; протухший access‑token прозрачно обновляется по refresh; невалидный refresh → разлогин.
- [ ] Нижний бар: «Главная», «Скидки», «Погреб», «Избранное».
- [ ] «Главная»: текстовый поиск и съёмка фото → распознавание → выбор/правка/кол‑во → добавление в погреб; по вину доступно «исследование».
- [ ] «Погреб»: просмотр, правка, удаление, заметка, загрузка и автопоиск фото.
- [ ] «Скидки»: список с картинками, ценами, бейджами скидок, фильтрами, поиском, бесконечной прокруткой; тап открывает товар в браузере.
- [ ] «Избранное»: заглушка.
- [ ] Картинки фото вин из погреба показываются (склейка `server + photoPath`).
- [ ] Дружелюбные ошибки при недоступном сервере.

---

## 18. Явные НЕ‑цели v1 / открытые вопросы

- **Google‑вход** — не реализуется (отдельная задача: Custom Tabs + deep link + доработка redirect на backend под мобильную схему).
- **Избранное** как функциональность — отложено (в web тоже заглушка; при необходимости — отдельная фича с таблицей `favorite` и CRUD на backend).
- **Профиль/аватар, AI‑модели, админка магазинов/скрейперов** — не входят в скоуп мобилки.
- **Офлайн‑режим/кэш БД (Room)** — не требуется в v1 (всё онлайн к LAN‑серверу).
- **Push‑уведомления** — нет.
- Дефолтный `DEFAULT_SERVER_URL` — плейсхолдер; перед сборкой под конкретную сеть его правит разработчик (либо пользователь вводит вручную при входе).

---

## 19. Шпаргалка соответствия web → mobile (для контроля паритета)

| Web | Mobile |
|-----|--------|
| AppBar «Найти вино» (модалка) | Вкладка «Главная» |
| WineSearchModal: текст/фото → recognize/text-search | HomeScreen состояние A/B |
| WineResearchModal | ResearchDialog |
| CellarPage | Вкладка «Погреб» |
| DiscountsPage (infinite scroll, фильтры) | Вкладка «Скидки» |
| FavoritesPage (заглушка) | Вкладка «Избранное» (заглушка) |
| LoginPage (email/пароль, Google) | LoginScreen (email/пароль + поле Сервер; без Google) |
| `VITE_API_URL` (build‑time) | поле «Сервер» + DataStore (runtime) |
| localStorage токены + axios refresh‑interceptor | DataStore + OkHttp TokenAuthenticator |
```

# AI Wine Cellar — База знаний

## 1. Общее описание

Персональный AI-помощник для ведения винного погреба. Пользователь добавляет свои бутылки, ведёт заметки дегустаций, получает рекомендации от AI.

**Тип проекта:** личный (pet project), без клиентских запросов и оценок.

**Стек:**
- Backend: NestJS 11 + TypeScript
- ORM: Prisma 7
- БД: PostgreSQL

---

## 2. Структура данных

### 2.1 Пользователи и авторизация

#### User
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `email` | String (unique) | Email |
| `emailVerified` | Boolean | Подтверждён ли email |
| `login` | String? (unique) | Логин |
| `displayName` | String? | Отображаемое имя |
| `createdAt` | DateTime | Дата создания |
| `updatedAt` | DateTime | Дата обновления |
| `deletedAt` | DateTime? | Soft-delete |

#### UserCredential
| Поле | Тип | Описание |
|---|---|---|
| `userId` | UUID (PK, FK→User) | Ссылка на пользователя |
| `passwordHash` | String | Хэш пароля |
| `passwordUpdatedAt` | DateTime | Дата последней смены пароля |

#### OAuthIdentity
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `userId` | UUID (FK→User) | Ссылка на пользователя |
| `provider` | Enum (GOOGLE) | Провайдер OAuth |
| `providerUserId` | String | ID пользователя у провайдера |
| `providerEmail` | String? | Email от провайдера |
| `createdAt` | DateTime | Дата создания |

**Уникальность:** `[provider, providerUserId]`

#### RefreshToken
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `userId` | UUID (FK→User) | Ссылка на пользователя |
| `tokenHash` | String | Хэш токена |
| `expiresAt` | DateTime | Срок действия |
| `revokedAt` | DateTime? | Дата отзыва |
| `userAgent` | String? | Браузер/клиент |
| `ip` | String? | IP-адрес |
| `createdAt` | DateTime | Дата создания |

### 2.2 Винный каталог (справочники)

#### Country
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `iso2` | Char(2) (unique) | Двухбуквенный код ISO |
| `iso3` | Char(3)? (unique) | Трёхбуквенный код ISO |
| `name` | String | Название страны |
| `createdAt` | DateTime | Дата создания |
| `updatedAt` | DateTime | Дата обновления |

#### GrapeVariety
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `name` | String (unique) | Каноническое название сорта |
| `createdAt` | DateTime | Дата создания |
| `updatedAt` | DateTime | Дата обновления |

#### GrapeNameMapping
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `grapeId` | UUID (FK→GrapeVariety) | Ссылка на сорт |
| `inputText` | String | Оригинальный вариант написания |
| `inputTextNormalized` | String (unique) | Нормализованный вариант |
| `locale` | String? | Язык/локаль |
| `source` | String? | Источник данных |
| `createdAt` | DateTime | Дата создания |

#### WineSeries
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `producer` | String | Производитель |
| `name` | String | Название линейки |
| `countryId` | UUID (FK→Country) | Страна |
| `region` | String? | Регион |
| `appellation` | String? | Аппелласьон |
| `wineType` | Enum | Тип вина |
| `createdAt` | DateTime | Дата создания |
| `updatedAt` | DateTime | Дата обновления |

**wineType:** RED / WHITE / ROSE / SPARKLING / SWEET / FORTIFIED / OTHER

#### WineVintage
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `seriesId` | UUID (FK→WineSeries) | Ссылка на линейку |
| `vintageYear` | Int? | Год урожая (null = NV/unknown) |
| `alcoholAbv` | Decimal(4,2)? | Крепость % |
| `volumeMl` | Int? | Объём в мл |
| `composition` | JSONB? | Состав купажа |
| `createdAt` | DateTime | Дата создания |
| `updatedAt` | DateTime | Дата обновления |

**Уникальность:** `[seriesId, vintageYear]`

### 2.3 Погреба и доступ

#### WineCellar
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `ownerId` | UUID (FK→User) | Владелец погреба |
| `name` | String | Название погреба |
| `createdAt` | DateTime | Дата создания |
| `updatedAt` | DateTime | Дата обновления |

Каждый пользователь при регистрации получает один дефолтный погреб. В будущем — возможность создавать несколько погребов.

#### CellarMembership
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `cellarId` | UUID (FK→WineCellar) | Погреб |
| `userId` | UUID (FK→User) | Пользователь с доступом |
| `role` | Enum | Роль доступа |
| `invitedAt` | DateTime | Дата приглашения |
| `acceptedAt` | DateTime? | Дата принятия (пока null — нет доступа) |

**role:** OWNER / EDITOR / VIEWER

- **OWNER** — полный контроль, управление доступами, удаление погреба
- **EDITOR** — добавлять/удалять бутылки, писать заметки
- **VIEWER** — только просмотр

**Уникальность:** `[cellarId, userId]`

### 2.4 Погреб пользователя (контент)

#### CellarItem
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `cellarId` | UUID (FK→WineCellar) | Погреб (вместо ownerId) |
| `wineVintageId` | UUID (FK→WineVintage) | Ссылка на винтаж |
| `quantity` | Int (default: 1) | Количество бутылок |
| `status` | Enum (default: IN_CELLAR) | Статус |
| `acquiredAt` | DateTime? | Дата приобретения |
| `consumedAt` | DateTime? | Дата потребления |
| `purchasePrice` | Decimal(10,2)? | Цена покупки |
| `currency` | VarChar(3)? | Валюта (3 символа) |
| `photoPath` | String? | Путь к фото |
| `createdAt` | DateTime | Дата создания |
| `updatedAt` | DateTime | Дата обновления |
| `deletedAt` | DateTime? | Soft-delete |

**status:** IN_CELLAR / CONSUMED / GIFTED / LOST

#### Note
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Первичный ключ |
| `cellarId` | UUID (FK→WineCellar) | Погреб (вместо ownerId) |
| `cellarItemId` | UUID (FK→CellarItem) | Ссылка на бутылку |
| `noteType` | Enum | Тип заметки |
| `title` | String? | Заголовок |
| `text` | String | Текст заметки |
| `rating` | Decimal(3,1)? | Оценка (макс 99.9) |
| `tastedAt` | DateTime? | Дата дегустации |
| `createdAt` | DateTime | Дата создания |
| `updatedAt` | DateTime | Дата обновления |
| `deletedAt` | DateTime? | Soft-delete |

**noteType:** TASTING / AI_ANSWER / MANUAL / PURCHASE / OTHER

---

## 3. Схема связей

```
User ──1:1── UserCredential
 │
 ├──1:*── OAuthIdentity
 ├──1:*── RefreshToken
 ├──1:*── WineCellar ──1:*── CellarItem ──1:*── Note
 │       │                      │
 │       └──1:*── CellarMembership └──*→1── WineVintage ──*:1── WineSeries ──*:1── Country
 │
 └──1:*── CellarMembership (как приглашённый пользователь)

GrapeVariety ──1:*── GrapeNameMapping
```

---

## 4. Row-Level Security (RLS)

### Принцип

RLS в PostgreSQL обеспечивает изоляцию данных на уровне строк. Справочники (`country`, `grape_variety`, `grape_name_mapping`, `wine_series`, `wine_vintage`) — без RLS, они общие для всех.

### Таблицы под RLS

| Таблица | Политика |
|---|---|
| `wine_cellar` | Видит владелец + члены с acceptedAt IS NOT NULL |
| `cellar_item` | Видят члены погреба с acceptedAt IS NOT NULL |
| `note` | Видят члены погреба с acceptedAt IS NOT NULL |
| `cellar_membership` | Видит владелец + приглашённый пользователь |

### Пример policy для cellar_item

```sql
USING (
  cellar_id IN (
    SELECT id FROM wine_cellar WHERE owner_id = current_user_id()
    UNION
    SELECT cellar_id FROM cellar_membership
    WHERE user_id = current_user_id() AND accepted_at IS NOT NULL
  )
)
```

### Ролевые ограничения на запись

RLS-политики для INSERT/UPDATE/DELETE дополнительно проверяют роль:

- **OWNER** — все операции
- **EDITOR** — INSERT/UPDATE/DELETE на cellar_item и note
- **VIEWER** — только SELECT

---

## 5. Архитектура приложения

> Пока пустой NestJS-стартер. Единственный endpoint: `GET /` → `"Hello World!"`.

---

## 6. Журнал изменений

| Дата | Что добавлено |
|---|---|
| 2026-05-18 | Начальная структура данных из Prisma schema |
| 2026-05-18 | Добавлены WineCellar + CellarMembership, RLS-стратегия, CellarItem/Note привязаны к cellarId вместо ownerId |

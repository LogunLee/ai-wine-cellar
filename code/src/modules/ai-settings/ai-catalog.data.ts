/**
 * Справочник провайдеров, моделей и AI-задач.
 * Сидер upsert'ит эти данные при старте приложения — правки здесь
 * автоматически попадают в БД при следующем деплое.
 *
 * baseUrl — всегда OpenAI-совместимый эндпоинт: пользовательские вызовы
 * идут единым кодом через POST {baseUrl}/chat/completions с Bearer-ключом.
 */

export interface ProviderSeed {
  code: string
  name: string
  baseUrl: string
  keyConsoleUrl: string
  freeTierNote: string | null
  keyInstructions: string
  sortOrder: number
  models: {
    code: string
    name: string
    capabilities: string[]
    note?: string
  }[]
}

export interface TaskSeed {
  code: string
  name: string
  description: string
  scope: 'USER' | 'SYSTEM'
  requiredCapability: 'text' | 'vision'
  defaultPrompt: string
  promptVersion: number
  promptEditable: boolean
  requiresModel?: boolean // false = задаче не нужна модель (промпт-шаблон для внешней LLM)
  recommendedModel: string | null // "providerCode/modelCode"
  trialLimit: number
  sortOrder: number
}

export const PROVIDER_SEEDS: ProviderSeed[] = [
  {
    code: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyConsoleUrl: 'https://aistudio.google.com/apikey',
    freeTierNote: 'Бесплатно: до 1500 запросов в день на Flash-моделях — хватит с запасом.',
    sortOrder: 1,
    keyInstructions: `### Как получить ключ Google Gemini (бесплатно, ~2 минуты)

1. Откройте [Google AI Studio](https://aistudio.google.com/apikey) и войдите с любым Google-аккаунтом.
2. Нажмите **«Create API key»** (Создать API-ключ).
3. Выберите проект (или создайте новый — кнопка предложит).
4. Скопируйте ключ — строка вида \`AIza...\` — и вставьте его в поле ниже.

Карта не нужна. Бесплатного лимита достаточно для повседневного использования приложения.`,
    models: [
      { code: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', capabilities: ['text', 'vision'], note: 'Быстрая, щедрый бесплатный лимит — рекомендуем' },
      { code: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', capabilities: ['text', 'vision'], note: 'Новее и умнее, лимиты чуть меньше' },
      { code: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', capabilities: ['text', 'vision'], note: 'Самая мощная, медленнее' },
    ],
  },
  {
    code: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    keyConsoleUrl: 'https://console.mistral.ai/api-keys',
    freeTierNote: 'Есть бесплатный тариф (Experiment) с ограничением по частоте запросов.',
    sortOrder: 2,
    keyInstructions: `### Как получить ключ Mistral (бесплатно, ~3 минуты)

1. Зарегистрируйтесь на [console.mistral.ai](https://console.mistral.ai).
2. В меню слева откройте **«API Keys»**.
3. Если попросят выбрать тариф — выберите бесплатный **«Experiment»** (карта не нужна).
4. Нажмите **«Create new key»**, скопируйте ключ и вставьте его в поле ниже.

Ключ показывается только один раз — если потеряли, просто создайте новый.`,
    models: [
      { code: 'mistral-small-latest', name: 'Mistral Small', capabilities: ['text'], note: 'Быстрая и дешёвая' },
      { code: 'pixtral-12b-2409', name: 'Pixtral 12B', capabilities: ['text', 'vision'], note: 'Распознаёт изображения' },
      { code: 'mistral-large-latest', name: 'Mistral Large', capabilities: ['text'], note: 'Мощнее, медленнее' },
    ],
  },
  {
    code: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyConsoleUrl: 'https://openrouter.ai/settings/keys',
    freeTierNote: 'Один ключ — сотни моделей разных вендоров. Есть бесплатные модели; платные — по предоплате.',
    sortOrder: 3,
    keyInstructions: `### Как получить ключ OpenRouter (~3 минуты)

OpenRouter — агрегатор: один ключ открывает доступ к моделям OpenAI, Anthropic, Google, Meta и другим.

1. Зарегистрируйтесь на [openrouter.ai](https://openrouter.ai) (можно через Google).
2. Откройте **Settings → [Keys](https://openrouter.ai/settings/keys)**.
3. Нажмите **«Create Key»**, задайте имя, скопируйте ключ \`sk-or-...\` и вставьте в поле ниже.
4. Для платных моделей пополните баланс на пару долларов в **Settings → Credits**; у бесплатных моделей хватит и пустого баланса.`,
    models: [
      { code: 'openai/gpt-4o-mini', name: 'GPT-4o mini', capabilities: ['text', 'vision'], note: 'Недорогая и качественная' },
      { code: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (via OpenRouter)', capabilities: ['text', 'vision'] },
      { code: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', capabilities: ['text'], note: 'Есть бесплатный вариант' },
    ],
  },
  {
    // Voyage — провайдер ЭМБЕДДИНГОВ для семантического поиска (не чат-модель).
    // Моделей в каталоге нет специально: модель эмбеддингов фиксирована на сервере
    // (VOYAGE_MODEL) и пользователем не выбирается — иначе вектора станут несравнимы
    // с книжным корпусом. Пользователь приносит только КЛЮЧ. Карточка ключа в
    // настройках появляется автоматически; в пикерах чат-задач Voyage не всплывает
    // (нет моделей с capability text/vision).
    code: 'voyage',
    name: 'Voyage AI (поиск)',
    baseUrl: 'https://api.voyageai.com/v1',
    keyConsoleUrl: 'https://dashboard.voyageai.com',
    freeTierNote: 'Бесплатно: 200 млн токенов, без карты. Нужен для «Подбора вина из погреба». Без своего ключа — 10 пробных поисков.',
    sortOrder: 4,
    keyInstructions: `### Как получить ключ Voyage AI (бесплатно, ~2 минуты)

Voyage используется для **семантического поиска** — «Подбор вина из погреба» и поиск по винным книгам. Это не чат-модель: вы добавляете только ключ, модель уже выбрана.

1. Зарегистрируйтесь на [dashboard.voyageai.com](https://dashboard.voyageai.com).
2. Откройте раздел **API Keys**.
3. Нажмите **Create Key**, скопируйте ключ \`pa-...\` и вставьте в поле ниже.

Карта не нужна — бесплатно доступно 200 млн токенов. Со своим ключом поиск работает без общих лимитов (никаких чужих «слишком много запросов»).`,
    models: [],
  },
]

// ── Промпты задач (1:1 с текущими в коде — поведение не меняется) ───────────

const LABEL_RECOGNITION_PROMPT = `Ты — эксперт по распознаванию вин по этикеткам. Проанализируй изображение и определи все вина, которые на нём видны.

Правила:
- country — ОБЯЗАТЕЛЬНО двухбуквенный код ISO 3166-1 alpha-2 (например: FR, IT, ES, RU, US, DE, AR, CL, AU, ZA, PT, GE, AM). Никаких полных названий стран — только код.
- Если поле неизвестно — верни null.
- Confidence — от 0 до 1.

Верни результат в формате JSON:
{
  "wines": [
    {
      "producer": "Название производителя",
      "name": "Название вина",
      "vintageYear": 2020,
      "region": "Регион",
      "country": "FR",
      "wineType": "RED|WHITE|ROSE|SPARKLING|SWEET|FORTIFIED|OTHER",
      "confidence": 0.95
    }
  ]
}`

const TEXT_SEARCH_PROMPT = `You are a wine name normalizer and entity extractor.

Task:
Given a list of user-entered wine names (one per line), possibly with typos, transliteration, missing accents, mixed Russian/English/French/Italian/Spanish spelling, extract the most likely wine identity for each name.

Rules:
1. Return only valid JSON.
2. Do not invent rare facts.
3. If a field is uncertain, return null and add the field name to uncertainFields.
4. If the wine is well-known and the correction is obvious, normalize it.
5. Preserve the vintage only if it is explicitly present in the input.
6. Do not use web search.
7. Do not return tasting notes.
8. Do not return prices.
9. The goal is not a full wine card, only normalized identity.
10. If several wines are possible, set confidence="low" and add alternatives.

Return JSON with this schema:
{
  "wines": [
    {
      "producer": string | null,
      "wineName": string | null,
      "fullName": string | null,
      "vintage": string | null,
      "country": string | null,
      "region": string | null,
      "originZone": string | null,
      "grapeVarieties": string[],
      "wineType": "red" | "white" | "rose" | "sparkling" | "dessert" | "fortified" | "unknown",
      "normalizedSearchQuery": string,
      "alternativeQueries": string[],
      "confidence": "high" | "medium" | "low",
      "needsVerification": boolean,
      "uncertainFields": string[]
    }
  ]
}

Process each wine name separately and return all of them in the "wines" array.`

export const TASK_SEEDS: TaskSeed[] = [
  {
    code: 'label_recognition',
    name: 'Распознавание этикетки',
    description: 'Определение вина по фотографии этикетки',
    scope: 'USER',
    requiredCapability: 'vision',
    defaultPrompt: LABEL_RECOGNITION_PROMPT,
    promptVersion: 1,
    promptEditable: false,
    recommendedModel: 'gemini/gemini-2.0-flash',
    trialLimit: 10,
    sortOrder: 1,
  },
  {
    code: 'text_search',
    name: 'Поиск вина по тексту',
    description: 'Нормализация введённого названия вина',
    scope: 'USER',
    requiredCapability: 'text',
    defaultPrompt: TEXT_SEARCH_PROMPT,
    promptVersion: 1,
    promptEditable: false,
    recommendedModel: 'gemini/gemini-2.0-flash',
    trialLimit: 10,
    sortOrder: 2,
  },
  {
    code: 'wine_research',
    name: 'Исследование вина',
    description: 'Подробная карточка вина: профиль, выдержка, гастрономия',
    scope: 'USER',
    requiredCapability: 'text',
    defaultPrompt: 'Ты эксперт по винам. Отвечай только валидным JSON.',
    promptVersion: 1,
    promptEditable: false,
    recommendedModel: 'gemini/gemini-2.0-flash',
    trialLimit: 10,
    sortOrder: 3,
  },
  {
    code: 'external_research',
    name: 'Внешнее исследование',
    description: 'Готовый запрос для любой внешней LLM (ChatGPT, Claude, Gemini): копируется в буфер обмена вместе с данными вина',
    scope: 'USER',
    requiredCapability: 'text',
    defaultPrompt: `Расскажи подробно об этом вине: производитель, регион и апелласьон, сорта винограда, стиль и дегустационный профиль, потенциал хранения и окно употребления, температура подачи, гастрономические сочетания, оценки критиков, удачные и неудачные винтажи, интересные факты. Отвечай на русском, структурированно.

Вино:`,
    promptVersion: 1,
    promptEditable: true,
    requiresModel: false,
    recommendedModel: null,
    trialLimit: 0,
    sortOrder: 4,
  },
  {
    code: 'cellar_ai_search',
    name: 'Подбор вина из погреба',
    description: 'Умный подбор вина из погреба по свободному запросу (RAG по винным книгам + погреб)',
    scope: 'USER',
    requiredCapability: 'text',
    defaultPrompt:
      'Ты — внимательный сомелье. Подбираешь вино ИЗ ПОГРЕБА пользователя под его запрос. ' +
      'Опирайся только на предоставленный контекст (знания из винных книг, описания вин, список бутылок). ' +
      'Не выдумывай фактов о конкретных бутылках, которых нет в данных. ' +
      'Отсутствие сведений считай за «неизвестно», а не за «нет». ' +
      'Если запрос нестандартный (рейтинг критика, «удиви меня», экзотический критерий) — рассуждай от общих знаний о вкусах, ' +
      'но честно: подбирай среди того, что реально есть. Если идеального нет — так и скажи и предложи лучший компромисс.',
    promptVersion: 1,
    promptEditable: true,
    recommendedModel: 'gemini/gemini-2.0-flash',
    trialLimit: 10,
    sortOrder: 5,
  },
  {
    code: 'vivino_note',
    name: 'Заметка для Vivino',
    description: 'Преобразование черновой дегустационной заметки в аккуратный текст для публикации в Vivino',
    scope: 'USER',
    requiredCapability: 'text',
    defaultPrompt:
      'Ты помогаешь винолюбителю превратить его черновую дегустационную заметку в аккуратный, ' +
      'читаемый отзыв для Vivino. Пиши от первого лица, по-русски, опирайся только на исходную ' +
      'заметку и данные о вине, ничего не выдумывай. Верни только готовый текст заметки.',
    promptVersion: 1,
    promptEditable: false,
    recommendedModel: 'gemini/gemini-2.0-flash',
    trialLimit: 10,
    sortOrder: 6,
  },
  // Системные задачи: в пользовательском UI не показываются, работают на ключах разработчика.
  {
    code: 'discount_normalization',
    name: 'Нормализация скидок',
    description: 'Фоновая обработка каталога скидок',
    scope: 'SYSTEM',
    requiredCapability: 'text',
    defaultPrompt: '',
    promptVersion: 1,
    promptEditable: false,
    recommendedModel: null,
    trialLimit: 0,
    sortOrder: 100,
  },
  {
    code: 'region_resolve',
    name: 'Определение регионов',
    description: 'Фоновый парсинг стран и регионов вин',
    scope: 'SYSTEM',
    requiredCapability: 'text',
    defaultPrompt: '',
    promptVersion: 1,
    promptEditable: false,
    recommendedModel: null,
    trialLimit: 0,
    sortOrder: 101,
  },
  {
    code: 'grape_resolve',
    name: 'Определение сортов',
    description: 'Фоновый парсинг сортов винограда',
    scope: 'SYSTEM',
    requiredCapability: 'text',
    defaultPrompt: '',
    promptVersion: 1,
    promptEditable: false,
    recommendedModel: null,
    trialLimit: 0,
    sortOrder: 102,
  },
]

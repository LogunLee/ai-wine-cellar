/** DTO-интерфейсы раздела дегустационных заметок (валидация — в сервисе, как в остальном коде). */

/** Вино, введённое вручную (когда его нет в погребе). Все поля опциональны. */
export interface ManualWineInput {
  producer?: string | null
  name?: string | null
  vintageYear?: number | null
  country?: string | null
  region?: string | null
  wineType?: string | null
}

export interface CreateTastingNoteDto {
  /** Бутылка/карточка вина в погребе. Опционально: можно создать заметку без вина или с ручным вводом. */
  cellarItemId?: string | null
  /** Вручную введённое вино (если cellarItemId не задан). */
  manualWine?: ManualWineInput | null
  /** Дата дегустации, ISO-строка (YYYY-MM-DD или полный ISO). */
  tastingDate: string
  /** Личная оценка 1.0–5.0 с шагом 0.5. */
  rating: number
  vintage?: number | null
  noteText?: string | null
  place?: string | null
  price?: number | null
  wouldBuyAgain?: boolean | null
}

/** Поля, доступные для обновления (PATCH). Вино можно дозаполнить позже (привязать или ввести вручную). */
export interface UpdateTastingNoteDto {
  cellarItemId?: string | null
  manualWine?: ManualWineInput | null
  tastingDate?: string
  rating?: number
  vintage?: number | null
  noteText?: string | null
  place?: string | null
  price?: number | null
  wouldBuyAgain?: boolean | null
}

/** Параметры списка GET /tasting-notes. */
export interface ListTastingNotesQuery {
  search?: string
  rating_min?: string
  rating_max?: string
  wine_type?: string
  country?: string
  region?: string
  /** Календарный год создания заметки (быстрый фильтр «последние 3 года»). */
  created_year?: string
  page?: string
  limit?: string
  sort?: string
}

/** Сохранить/обновить Vivino-версию (сценарий «в дополнение»). */
export interface SaveVivinoNoteDto {
  vivinoNoteText: string
}

/** Краткая инфо о вине: из карточки погреба, из ручного ввода, либо пусто (вино не указано). */
export interface TastingNoteWine {
  cellarItemId: string | null
  producer: string | null
  name: string | null
  wineType: string | null
  country: string | null
  countryIso2: string | null
  region: string | null
  appellation: string | null
  vintageYear: number | null
  grapes: string[] | null
  photoPath: string | null
}

/** Результат инкрементальной синхронизации заметок. */
export interface SyncTastingNotesResult {
  /** Текущее СЕРВЕРНОЕ время — клиент сохраняет его и шлёт как `since` в следующий раз. */
  serverTime: string
  /** Заметки, созданные/изменённые после `since` (для upsert в локальный кэш). */
  changed: TastingNoteView[]
  /** id заметок, удалённых после `since` (для удаления из локального кэша). */
  deletedIds: string[]
}

/** Форма заметки, отдаваемая клиентам. */
export interface TastingNoteView {
  id: string
  wine: TastingNoteWine
  vintage: number | null
  tastingDate: string
  rating: number
  noteText: string | null
  noteExcerpt: string | null
  vivinoNoteText: string | null
  hasVivinoNote: boolean
  vivinoNoteCreatedAt: string | null
  vivinoNoteUpdatedAt: string | null
  place: string | null
  price: number | null
  wouldBuyAgain: boolean | null
  createdAt: string
  updatedAt: string
}

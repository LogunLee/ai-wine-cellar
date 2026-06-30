/** DTO раздела «AI-сомелье» (разговорный чат поверх погреба и винной базы знаний). */

export interface SendMessageDto {
  /** Текст пользователя. Может начинаться со слэш-команды: «/погреб …» или «/консультация …». */
  text: string
}

/** Карточка вина из погреба (для режима /погреб). */
export interface ChatWinePick {
  cellarItemId: string
  title: string
  reason: string
}

/** Цитата-источник из винной литературы. */
export interface ChatSource {
  book: string
  page: number | null
  heading: string | null
}

export interface ChatMessageView {
  id: string
  role: 'user' | 'assistant'
  mode: 'pogreb' | 'consult' | 'chat' | null
  content: string
  picks: ChatWinePick[]
  sources: ChatSource[]
  createdAt: string
}

export interface ChatSessionView {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatSessionWithMessages extends ChatSessionView {
  messages: ChatMessageView[]
}

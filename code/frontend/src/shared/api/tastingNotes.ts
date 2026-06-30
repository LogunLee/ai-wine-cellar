import { api } from './client'

export interface TastingNoteWine {
  cellarItemId: string
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

export interface TastingNote {
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

export interface TastingNotesPage {
  items: TastingNote[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface CreateTastingNoteInput {
  cellarItemId: string
  tastingDate: string
  rating: number
  vintage?: number | null
  noteText?: string | null
  place?: string | null
  price?: number | null
  wouldBuyAgain?: boolean | null
}

export type UpdateTastingNoteInput = Partial<Omit<CreateTastingNoteInput, 'cellarItemId'>>

export interface ListTastingNotesParams {
  search?: string
  rating_min?: number
  rating_max?: number
  wine_type?: string
  country?: string
  region?: string
  page?: number
  limit?: number
  sort?: string
}

export const tastingNotesApi = {
  list: (params: ListTastingNotesParams) => api.get<TastingNotesPage>('/tasting-notes', { params }),
  get: (id: string) => api.get<TastingNote>(`/tasting-notes/${id}`),
  create: (data: CreateTastingNoteInput) => api.post<TastingNote>('/tasting-notes', data),
  update: (id: string, data: UpdateTastingNoteInput) => api.patch<TastingNote>(`/tasting-notes/${id}`, data),
  remove: (id: string) => api.delete(`/tasting-notes/${id}`),
  generateVivino: (id: string) =>
    api.post<{ vivinoNoteText: string }>(`/tasting-notes/${id}/generate-vivino-note`),
  saveVivino: (id: string, vivinoNoteText: string) =>
    api.patch<TastingNote>(`/tasting-notes/${id}/vivino-note`, { vivinoNoteText }),
  deleteVivino: (id: string) => api.delete<TastingNote>(`/tasting-notes/${id}/vivino-note`),
}

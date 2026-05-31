import { api } from './client'

export interface WineRecognitionResult {
  producer: string
  name: string
  vintageYear?: number
  region?: string
  country?: string
  wineType?: string
  confidence: number
}

export interface WineResearchInput {
  wineName: string
  vintage?: string
  producerHint?: string
  countryHint?: string
}

export interface WineInfo {
  fullName: string | null
  producer: string | null
  country: string | null
  region: string | null
  appellation: string | null
  vintage: string | null
  wineType: string | null
  grapes: string[] | null
  alcohol: string | null
  sugar: string | null
  acidity: string | null
  aging: string | null
  style: string | null
  tastingProfile: string | null
  storagePotential: string | null
  servingTemperature: string | null
  foodPairing: string[] | null
}

export interface ResearchSource {
  title?: string
  url: string
  sourceType: 'producer' | 'producer_pdf' | 'importer' | 'official_region' | 'wine_database' | 'shop' | 'blog' | 'unknown'
  trustLevel: 'high' | 'medium' | 'low'
  used: boolean
}

export interface WineResearchResult {
  wine: WineInfo
  confidence: 'high' | 'medium' | 'low'
  missingFields: string[]
  sources: ResearchSource[]
  notes: string[]
}

export interface AiModel {
  id: string
  name: string
  provider: string
  purpose: string
  apiKey: string
  baseUrl?: string
  promptConfig?: Record<string, unknown>
  isDefault: boolean
  isActive: boolean
}

export const wineSearchApi = {
  recognize: (images: string[]) =>
    api.post<{ wines: WineRecognitionResult[] }>('/wine-search/recognize', { images }),

  textSearch: (text: string) =>
    api.post<{ wines: WineRecognitionResult[] }>('/wine-search/text-search', { text }),

  research: (input: WineResearchInput) =>
    api.post<WineResearchResult>('/wine-research/research', input),
}

export interface AddWineToCellarDto {
  producer: string
  name: string
  vintageYear?: number
  region?: string
  country?: string
  wineType?: string
  quantity: number
}

export interface CellarItem {
  id: string
  producer: string
  name: string
  vintageYear?: number
  region?: string
  country?: string
  countryIso2?: string
  wineType?: string
  grapes?: string[]
  quantity: number
  status: string
  photoPath?: string
  createdAt: string
}

export interface Country {
  id: string
  iso2: string
  iso3?: string
  name: string
}

export const wineCellarApi = {
  list: () => api.get<CellarItem[]>('/wine-cellar/items'),
  add: (data: AddWineToCellarDto) =>
    api.post('/wine-cellar/add', data),
  update: (id: string, data: Partial<AddWineToCellarDto>) =>
    api.put<CellarItem>(`/wine-cellar/${id}`, data),
  remove: (id: string) =>
    api.delete(`/wine-cellar/${id}`),
  getNote: (id: string) =>
    api.get<{ id: string; text: string } | null>(`/wine-cellar/${id}/note`),
  saveNote: (id: string, text: string) =>
    api.post(`/wine-cellar/${id}/note`, { text }),
  uploadPhoto: (id: string, file: File) => {
    const formData = new FormData()
    formData.append('photo', file)
    return api.post<{ photoPath: string }>(`/wine-cellar/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  fetchPhoto: (id: string, wine: { producer: string; name: string; vintageYear?: number }) =>
    api.post<{ photoPath: string | null }>(`/wine-cellar/${id}/fetch-photo`, wine),
}

export const countriesApi = {
  list: () => api.get<Country[]>('/countries'),
}

export const aiModelsApi = {
  list: () => api.get<AiModel[]>('/ai-models'),
  get: (id: string) => api.get<AiModel>(`/ai-models/${id}`),
  create: (data: Omit<AiModel, 'id'>) => api.post<AiModel>('/ai-models', data),
  update: (id: string, data: Partial<AiModel>) => api.put<AiModel>(`/ai-models/${id}`, data),
  remove: (id: string) => api.delete(`/ai-models/${id}`),
  setDefault: (id: string) => api.post(`/ai-models/${id}/set-default`),
}

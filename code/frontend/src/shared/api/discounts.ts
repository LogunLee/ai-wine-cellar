import { api } from './client'

export interface DiscountOffer {
  id: string
  sellerName: string
  producer: string | null
  wineName: string | null
  wineNameRaw: string | null
  fullName: string | null
  vintage: string | null
  country: string | null
  region: string | null
  regionCanonical: string | null
  appellation: string | null
  originZone: string | null
  sweetness: string | null
  alcohol: number | null
  ageingVessel: string | null
  storagePotential: string | null
  description: string | null
  wineType: string | null
  volumeMl: number | null
  currentPrice: number
  oldPrice: number | null
  discountPercent: number | null
  discountAmount: number | null
  currency: string
  url: string
  imageUrl: string | null
  availability: string | null
  grapes: string[]
  grapeCount: number
  confidence: 'high' | 'medium' | 'low'
  status: 'active' | 'out_of_stock' | 'expired' | 'error' | 'hidden'
  lastCheckedAt: string
}

export interface DiscountOffersResponse {
  items: DiscountOffer[]
  total: number
  page: number
  limit: number
}

export interface DiscountFilters {
  storeId?: string
  seller?: string
  country?: string
  region?: string
  wineType?: string
  minDiscount?: number
  minPrice?: number
  maxPrice?: number
  vintage?: string
  availability?: string
  confidence?: string
  status?: string
  search?: string
  grapes?: string
  monosort?: boolean
  page?: number
  limit?: number
  sort?: string
}

export interface Store {
  id: string
  name: string
  code: string
  baseUrl: string
  active: boolean
  parserType: string
  scrapePeriodMinutes: number
  currency: string
  country: string | null
  configJson: Record<string, unknown> | null
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastErrorMessage: string | null
  createdAt: string
  updatedAt: string
}

export const discountsApi = {
  getOffers: (filters: DiscountFilters = {}) =>
    api.get<DiscountOffersResponse>('/discounts/offers', { params: filters }),
}

export const storesApi = {
  list: () => api.get<Store[]>('/admin/discount-stores'),
  get: (id: string) => api.get<Store>(`/admin/discount-stores/${id}`),
  create: (data: Omit<Store, 'id' | 'createdAt' | 'updatedAt' | 'lastSuccessAt' | 'lastErrorAt' | 'lastErrorMessage'>) =>
    api.post<Store>('/admin/discount-stores', data),
  update: (id: string, data: Partial<Store>) =>
    api.patch<Store>(`/admin/discount-stores/${id}`, data),
  remove: (id: string) =>
    api.delete(`/admin/discount-stores/${id}`),
  toggleActive: (id: string) =>
    api.post<Store>(`/admin/discount-stores/${id}/toggle-active`),
  run: (id: string) =>
    api.post(`/admin/discount-stores/${id}/run`),
}

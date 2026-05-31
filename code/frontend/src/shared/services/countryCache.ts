import { countriesApi, type Country } from '../api/wineSearch'

const STORAGE_KEY = 'enolo_countries'
const CACHE_TTL = 24 * 60 * 60 * 1000

export async function loadCountries(): Promise<Country[]> {
  const cached = localStorage.getItem(STORAGE_KEY)
  if (cached) {
    try {
      const { data, ts } = JSON.parse(cached)
      if (Date.now() - ts < CACHE_TTL) return data
    } catch { /* ignore */ }
  }

  try {
    const { data } = await countriesApi.list()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, ts: Date.now() }))
    return data
  } catch {
    return cached ? JSON.parse(cached).data : []
  }
}

export function getCachedCountries(): Country[] {
  const cached = localStorage.getItem(STORAGE_KEY)
  if (cached) {
    try {
      return JSON.parse(cached).data
    } catch { /* ignore */ }
  }
  return []
}

const rawUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const apiUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`

export const env = {
  API_URL: apiUrl,
} as const

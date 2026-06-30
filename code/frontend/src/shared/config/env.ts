// Без VITE_API_URL используем хост, с которого открыт фронтенд,
// чтобы страница работала и с других устройств в локальной сети (не только localhost)
const rawUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`
const apiUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`

export const env = {
  API_URL: apiUrl,
} as const

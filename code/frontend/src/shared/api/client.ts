import axios from 'axios'
import { env } from '../config/env'
import { tokenStorage } from './tokenStorage'

export const api = axios.create({
  baseURL: env.API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = tokenStorage.access
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const { data } = await axios.post(`${env.API_URL}/auth/refresh`, {
          refresh_token: tokenStorage.refresh,
        })
        tokenStorage.save(data.access_token, data.refresh_token)
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`
        return api(originalRequest)
      } catch {
        tokenStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

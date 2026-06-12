import { create } from 'zustand'
import { authApi } from '../../shared/api/auth'
import { tokenStorage } from '../../shared/api/tokenStorage'

interface User {
  id: string
  email: string
  login?: string
  displayName?: string
  avatarPath?: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isChecking: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName?: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,
  isChecking: true,

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const { data } = await authApi.login({ email, password })
      tokenStorage.save(data.access_token, data.refresh_token)
      set({ user: data.user, isAuthenticated: true, isLoading: false, isChecking: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  register: async (email: string, password: string, displayName?: string) => {
    set({ isLoading: true })
    try {
      const { data } = await authApi.register({ email, password, displayName })
      tokenStorage.save(data.access_token, data.refresh_token)
      set({ user: data.user, isAuthenticated: true, isLoading: false, isChecking: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  logout: async () => {
    try {
      const refreshToken = tokenStorage.refresh
      if (refreshToken) {
        await authApi.logout(refreshToken)
      }
    } finally {
      tokenStorage.clear()
      set({ user: null, isAuthenticated: false, isChecking: false })
    }
  },

  checkAuth: async () => {
    if (!tokenStorage.access) {
      set({ isAuthenticated: false, user: null, isChecking: false })
      return
    }
    try {
      const { data } = await authApi.me()
      set({ user: data, isAuthenticated: true, isChecking: false })
    } catch {
      tokenStorage.clear()
      set({ isAuthenticated: false, user: null, isChecking: false })
    }
  },
}))

/** Единая точка работы с JWT-токенами в localStorage. */

const ACCESS_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'

export const tokenStorage = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY)
  },
  save(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

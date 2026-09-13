import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

// The access token is kept in a variable, so it is gone when the tab closes.
// The refresh token is saved in localStorage so the user stays logged in
// after reloading the page.
let accessToken: string | null = null
const REFRESH_KEY = 'inv.refresh'

export const tokens = {
  get access() {
    return accessToken
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh?: string) {
    accessToken = access
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    accessToken = null
    localStorage.removeItem(REFRESH_KEY)
  },
}

export const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokens.refresh
  if (!refresh) return null
  try {
    const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh })
    tokens.set(data.access, data.refresh)
    return data.access
  } catch {
    tokens.clear()
    return null
  }
}

// AuthProvider gives us its logout function, so we can log the user out
// when the refresh token has stopped working.
let onSessionExpired = () => {}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

// When a request fails with 401 (access token expired), get a new access
// token and send the same request again.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as (InternalAxiosRequestConfig & { retried?: boolean }) | undefined
    if (!request) return Promise.reject(error)

    const isLoginOrRefresh = request.url?.includes('/auth/token')
    if (error.response?.status !== 401 || request.retried || isLoginOrRefresh) {
      return Promise.reject(error)
    }

    // Only retry a request once, so a refresh that keeps failing can't loop.
    request.retried = true

    const newToken = await refreshAccessToken()
    if (!newToken) {
      onSessionExpired()
      return Promise.reject(error)
    }

    request.headers.Authorization = `Bearer ${newToken}`
    return api(request)
  },
)

/** Pull a readable message out of a DRF error body. */
export function apiError(error: unknown): string {
  const err = error as AxiosError<Record<string, unknown>>
  const data = err.response?.data
  if (!data) return err.message || 'Network error'
  if (typeof data === 'string') return data
  if (typeof data.detail === 'string') return data.detail
  const first = Object.entries(data)[0]
  if (!first) return 'Request failed'
  const [field, value] = first
  const text = Array.isArray(value) ? value[0] : value
  return `${field}: ${text}`
}

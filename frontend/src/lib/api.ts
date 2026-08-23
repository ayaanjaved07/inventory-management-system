import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

// Access token lives in memory only -- it dies with the tab, which limits the
// blast radius of an XSS. The refresh token has to survive a reload, so it sits
// in localStorage: the pragmatic tradeoff for a project without a backend
// session cookie. Noted rather than hidden.
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

// Single-flight refresh: if several requests 401 at once, they all await the
// same refresh call instead of racing and burning the rotated token.
let refreshing: Promise<string | null> | null = null

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

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean }
    const isAuthCall = original?.url?.includes('/auth/token')

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null
      })
      const newToken = await refreshing
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    return Promise.reject(error)
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

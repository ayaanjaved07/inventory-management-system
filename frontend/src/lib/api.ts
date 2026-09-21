// All requests to the backend go through the functions in this file.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

// The access token is kept in a variable, so it is gone when the tab closes.
// The refresh token is saved in localStorage so the user stays logged in
// after reloading the page.
let accessToken = ''
const REFRESH_KEY = 'inv.refresh'

export function saveTokens(access: string, refresh?: string) {
  accessToken = access
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  accessToken = ''
  localStorage.removeItem(REFRESH_KEY)
}

export function hasRefreshToken() {
  return localStorage.getItem(REFRESH_KEY) !== null
}

// AuthProvider gives us its logout function, so we can log the user out
// when the refresh token has stopped working.
let onSessionExpired = () => {}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

// Ask the backend for a new access token. Returns false if it refused.
async function refreshAccessToken() {
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) return false

  const response = await fetch(BASE_URL + '/auth/token/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!response.ok) return false

  const data = await response.json()
  saveTokens(data.access, data.refresh)
  return true
}

// Send one request. Objects are sent as JSON; FormData (file uploads) is sent
// as it is, and the browser sets the Content-Type for it.
function sendOnce(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken

  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  return fetch(BASE_URL + path, { method, headers, body: payload })
}

// Send a request. If it fails with 401 (the access token has expired), get a
// new access token and send the same request once more.
export async function send(method: string, path: string, body?: unknown) {
  let response = await sendOnce(method, path, body)

  const isLogin = path.startsWith('/auth/token')
  if (response.status === 401 && !isLogin) {
    const refreshed = await refreshAccessToken()
    if (!refreshed) {
      clearTokens()
      onSessionExpired()
      throw new Error('Your session has expired. Please sign in again.')
    }
    response = await sendOnce(method, path, body)
  }

  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response
}

// Turn a Django REST Framework error into one readable line, for example
// {"sku": ["This field is required."]} becomes "sku: This field is required."
async function readError(response: Response) {
  let data
  try {
    data = await response.json()
  } catch {
    return 'Request failed (' + response.status + ')'
  }
  if (typeof data === 'string') return data
  if (typeof data.detail === 'string') return data.detail

  const fields = Object.keys(data)
  if (fields.length === 0) return 'Request failed (' + response.status + ')'
  const value = data[fields[0]]
  const text = Array.isArray(value) ? value[0] : value
  return fields[0] + ': ' + text
}

// Read the JSON from a response. DELETE returns an empty body (204).
async function readJson(response: Response) {
  if (response.status === 204) return null
  return response.json()
}

export async function apiGet<T>(path: string): Promise<T> {
  return readJson(await send('GET', path))
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return readJson(await send('POST', path, body))
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return readJson(await send('PATCH', path, body))
}

export async function apiDelete(path: string) {
  await send('DELETE', path)
}

// The message to show for an error caught in a try/catch.
export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

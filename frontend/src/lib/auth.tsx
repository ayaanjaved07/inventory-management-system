import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiGet, apiPost, clearTokens, hasRefreshToken, saveTokens, setSessionExpiredHandler } from './api'
import type { Role, User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string, asAdmin: boolean) => Promise<void>
  logout: () => void
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  function logout() {
    clearTokens()
    setUser(null)
  }

  useEffect(() => {
    // Let api.ts log the user out when their session can't be refreshed.
    setSessionExpiredHandler(logout)

    // On reload the access token is gone, but the refresh token may still
    // work. Asking for /auth/me/ makes api.ts refresh it if it can.
    if (!hasRefreshToken()) {
      setLoading(false)
      return
    }
    apiGet<User>('/auth/me/')
      .then((me) => setUser(me))
      .catch(() => clearTokens())
      .finally(() => setLoading(false))
  }, [])

  async function login(username: string, password: string, asAdmin: boolean) {
    const data = await apiPost<{ access: string; refresh: string; user: User }>(
      '/auth/token/',
      { username, password },
    )
    const isAdmin = data.user.is_superuser || data.user.roles.includes('Admin')
    // Check the login tab before saving the tokens, so a wrong tab doesn't
    // leave the user half logged in.
    if (asAdmin && !isAdmin) {
      throw new Error('That account does not have the Administrator role.')
    }
    if (!asAdmin && isAdmin) {
      throw new Error('That is an administrator account. Use the administrator sign-in.')
    }
    saveTokens(data.access, data.refresh)
    setUser(data.user)
  }

  // A superuser can do everything; everyone else needs one of the roles.
  function hasRole(...roles: Role[]) {
    if (!user) return false
    if (user.is_superuser) return true
    return roles.some((role) => user.roles.includes(role))
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}

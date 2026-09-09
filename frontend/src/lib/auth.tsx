import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, tokens } from './api'
import { WrongDoorError } from './errors'
import type { Role, User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string, opts?: { mode?: 'staff' | 'admin' }) => Promise<void>
  logout: () => void
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On reload the access token is gone (it was in memory), but the refresh
  // token may still be valid -- so try to restore the session before deciding
  // the user is logged out.
  useEffect(() => {
    let cancelled = false
    async function restore() {
      if (!tokens.refresh) {
        setLoading(false)
        return
      }
      try {
        const { data } = await api.get<User>('/auth/me/')
        if (!cancelled) setUser(data)
      } catch {
        tokens.clear()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    restore()
    return () => {
      cancelled = true
    }
  }, [])

  const logout = useCallback(() => {
    tokens.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    const onExpired = () => logout()
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [logout])

  const login = useCallback(
    async (username: string, password: string, opts?: { mode?: 'staff' | 'admin' }) => {
      const { data } = await api.post('/auth/token/', { username, password })
      const account = data.user as User
      const isAdmin = account.is_superuser || account.roles.includes('Admin')
      // Checked before the tokens are stored, so a refused sign-in never
      // half-creates a session the page then has to tear down. Omitting `mode`
      // skips the check entirely, so this only applies to the sign-in screen.
      if (opts?.mode === 'admin' && !isAdmin) throw new WrongDoorError('staff')
      if (opts?.mode === 'staff' && isAdmin) throw new WrongDoorError('admin')
      tokens.set(data.access, data.refresh)
      setUser(account)
    },
    [],
  )

  const hasRole = useCallback(
    (...roles: Role[]) => {
      if (!user) return false
      if (user.is_superuser) return true
      return roles.some((r) => user.roles.includes(r))
    },
    [user],
  )

  const value = useMemo(
    () => ({ user, loading, login, logout, hasRole }),
    [user, loading, login, logout, hasRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

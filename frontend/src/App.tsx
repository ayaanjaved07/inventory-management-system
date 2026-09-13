import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { AuthProvider, useAuth } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import { Spinner } from '@/components/ui'
import type { Role } from '@/lib/types'

import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Items from '@/pages/Items'
import ItemDetail from '@/pages/ItemDetail'
import Stock from '@/pages/Stock'
import Projects from '@/pages/Projects'
import Sales from '@/pages/Sales'
import Activity from '@/pages/Activity'
import Settings from '@/pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
})

function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Mirrors the backend role check. Convenience only -- the API is the authority. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth()
  if (!hasRole(...roles)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        You do not have permission to view this page.
      </div>
    )
  }
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* HashRouter, not BrowserRouter: GitHub Pages has no SPA fallback, so
          BrowserRouter deep links would 404 on refresh. */}
      <HashRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="items" element={<Items />} />
              <Route path="items/:id" element={<ItemDetail />} />
              <Route path="stock" element={<Stock />} />
              <Route path="projects" element={<Projects />} />
              <Route path="sales" element={<Sales />} />
              <Route path="activity" element={<Activity />} />
              <Route
                path="settings"
                element={
                  <RequireRole roles={['Admin']}>
                    <Settings />
                  </RequireRole>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  )
}

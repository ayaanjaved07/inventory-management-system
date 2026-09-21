import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'

import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Items from './pages/Items'
import ItemDetail from './pages/ItemDetail'
import Stock from './pages/Stock'
import Projects from './pages/Projects'
import Sales from './pages/Sales'
import Activity from './pages/Activity'
import Settings from './pages/Settings'

// Sends the user to the login page if they are not logged in.
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p style={{ padding: 20 }}>Loading...</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Only admins may open Settings. This is for convenience only: the backend
// checks the role again on every request.
function RequireAdmin({ children }: { children: ReactNode }) {
  const { hasRole } = useAuth()
  if (!hasRole('Admin')) return <p>You do not have permission to view this page.</p>
  return children
}

export default function App() {
  return (
    // HashRouter, not BrowserRouter: GitHub Pages has no SPA fallback, so
    // BrowserRouter deep links would 404 on refresh.
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
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
                <RequireAdmin>
                  <Settings />
                </RequireAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}

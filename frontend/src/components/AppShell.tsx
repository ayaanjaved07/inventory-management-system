import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Boxes, LayoutDashboard, Package, ClipboardList, FolderKanban,
  ReceiptText, History, Settings, LogOut, Menu, X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import type { Role } from '@/lib/types'

interface NavItem {
  to: string
  label: string
  icon: typeof Package
  roles?: Role[]
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/stock', label: 'Stock', icon: ClipboardList },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/sales', label: 'Sales', icon: ReceiptText },
  { to: '/activity', label: 'Activity', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['Admin'] },
]

export default function AppShell() {
  const { user, logout, hasRole } = useAuth()
  const [open, setOpen] = useState(false)

  const visible = NAV.filter((item) => !item.roles || hasRole(...item.roles))

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-slate-200 bg-white',
          'transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <Boxes className="h-6 w-6 text-indigo-700" />
          <span className="font-display text-lg text-slate-900">Lekha-Jokha</span>
        </div>

        <nav className="py-3 pr-3">
          {visible.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 border-l-2 px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'border-indigo-700 bg-indigo-50 font-semibold text-indigo-800'
                    : 'border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              <Icon className="h-4.5 w-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-slate-900">{user?.username}</div>
              <div className="text-xs text-slate-500">{user?.roles.join(', ')}</div>
            </div>

            <button
              onClick={logout}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

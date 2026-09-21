import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// The bar at the top of every page after logging in. <Outlet /> is where
// React Router puts the current page.
export default function Layout() {
  const { user, logout, hasRole } = useAuth()

  return (
    <>
      <header className="topbar">
        <span className="app-name">Lekha-Jokha</span>

        <nav>
          {/* `end` stops "/" from matching every page. */}
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/items">Items</NavLink>
          <NavLink to="/stock">Stock</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/sales">Sales</NavLink>
          <NavLink to="/activity">Activity</NavLink>
          {hasRole('Admin') && <NavLink to="/settings">Settings</NavLink>}
        </nav>

        <div className="user row">
          <span>
            {user?.username} ({user?.roles.join(', ')})
          </span>
          <button className="secondary small" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </>
  )
}

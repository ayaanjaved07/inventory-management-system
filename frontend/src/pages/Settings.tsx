import { useState } from 'react'

import { apiPatch, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { ROLES } from '../lib/types'
import type { Paginated, Role, User } from '../lib/types'
import { NewUserForm } from '../components/NewUserForm'

// What each role may change. This copies WRITE_ROLES in
// backend/accounts/permissions.py by hand, so update both together.
const PERMISSIONS: { area: string; roles: Role[] }[] = [
  { area: 'Items & categories', roles: ['Admin', 'Manager'] },
  { area: 'Stock movements', roles: ['Admin', 'Manager', 'Storekeeper'] },
  { area: 'Projects & allocations', roles: ['Admin', 'Manager'] },
  { area: 'Sales', roles: ['Admin', 'Manager'] },
  { area: 'Users & roles', roles: ['Admin'] },
]

export default function Settings() {
  const { user: currentUser } = useAuth()
  const users = useApi<Paginated<User>>('/auth/users/')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  async function changeRole(id: number, role: string) {
    try {
      await apiPatch(`/auth/users/${id}/`, { roles: [role] })
      setError('')
      users.reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <button onClick={() => setShowForm(!showForm)}>New user</button>
      </div>

      {error && <p className="error">{error}</p>}

      {showForm && (
        <NewUserForm
          onSaved={() => {
            setShowForm(false)
            users.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="card">
        <h2>Users</h2>
        {users.error && <p className="error">{users.error}</p>}
        {!users.data && users.loading && <p>Loading...</p>}
        {users.data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {users.data.results.map((u) => {
                  const isSelf = currentUser !== null && u.id === currentUser.id
                  return (
                    <tr key={u.id}>
                      <td>
                        {u.username} {isSelf && <span className="muted">(you)</span>}
                      </td>
                      <td>
                        {u.first_name} {u.last_name}
                      </td>
                      <td>{u.email || '-'}</td>
                      <td>
                        {/* You can't change your own role, so an admin can't
                            lock themselves out by mistake. */}
                        {isSelf ? (
                          u.roles.join(', ')
                        ) : (
                          <select
                            style={{ marginTop: 0 }}
                            value={u.roles[0] || ''}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>{u.is_active ? 'Yes' : 'No'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>What each role can change</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Area</th>
                {ROLES.map((r) => (
                  <th key={r}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.area}>
                  <td>{p.area}</td>
                  {ROLES.map((r) => (
                    <td key={r}>{p.roles.includes(r) ? 'Yes' : '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

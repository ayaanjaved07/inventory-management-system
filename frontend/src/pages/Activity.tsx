import { useState } from 'react'

import { useApi } from '../lib/useApi'
import { formatDateTime } from '../lib/utils'
import type { ActivityLogEntry, Paginated } from '../lib/types'
import { Pagination } from '../components/Pagination'

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'IMPORT', 'EXPORT']

// Show a changed value. Empty values are shown as "-".
function show(value: unknown) {
  if (value === null || value === '') return '-'
  return String(value)
}

export default function Activity() {
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)

  const filters = new URLSearchParams()
  if (search) filters.set('search', search)
  if (action) filters.set('action', action)

  const activity = useApi<Paginated<ActivityLogEntry>>(`/activity/?${filters}&page=${page}`)

  return (
    <>
      <h1>Activity</h1>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            style={{ maxWidth: 320, marginTop: 0 }}
            placeholder="Search by record or model..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          <select
            style={{ width: 160, marginTop: 0 }}
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {activity.error && <p className="error">{activity.error}</p>}
        {!activity.data && activity.loading && <p>Loading...</p>}
        {activity.data && activity.data.results.length === 0 && (
          <p className="muted">No activity recorded yet.</p>
        )}
        {activity.data && activity.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {activity.data.results.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.timestamp)}</td>
                    <td>{entry.user_name || 'System'}</td>
                    <td>
                      <span className="badge">{entry.action_display}</span>
                    </td>
                    <td>
                      {entry.model_name} {entry.object_repr}
                    </td>
                    <td>
                      {Object.entries(entry.changes || {}).map(([field, [from, to]]) => (
                        <div key={field}>
                          {field}: {show(from)} &rarr; {show(to)}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={activity.data ? activity.data.count : 0} onChange={setPage} />
      </div>
    </>
  )
}

import { useState } from 'react'

import { useApi } from '../lib/useApi'
import { formatDateTime } from '../lib/utils'
import type { ActivityFilterValues, ActivityLogEntry, Paginated } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { ActivityFilters } from '../components/ActivityFilters'

// The backend's model names, as the page shows them.
const TYPE_NAMES: Record<string, string> = {
  Sale: 'Sale',
  Purchase: 'Purchase',
  Customer: 'Client',
  Supplier: 'Supplier',
}

// Show a changed value. Empty values are shown as "-".
function show(value: unknown) {
  if (value === null || value === '') return '-'
  return String(value)
}

// A log of buying and selling: sales, purchases, and changes to clients and
// suppliers. Logins and item edits are not shown here.
export default function Activity() {
  const [filters, setFilters] = useState<ActivityFilterValues>({
    search: '',
    model_name: '',
    action: '',
    date_from: '',
    date_to: '',
  })
  const [page, setPage] = useState(1)

  // Copy the filters that have a value into the URL.
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value)
  }

  const activity = useApi<Paginated<ActivityLogEntry>>(`/activity/?${query}&page=${page}`)

  return (
    <>
      <h1>Activity</h1>

      <div className="card">
        <ActivityFilters
          filters={filters}
          onChange={(next) => {
            setFilters(next)
            setPage(1)
          }}
        />
      </div>

      <div className="card">
        {activity.error && <p className="error">{activity.error}</p>}
        {!activity.data && activity.loading && <p>Loading...</p>}
        {activity.data && activity.data.results.length === 0 && (
          <p className="muted">No activity for these filters.</p>
        )}
        {activity.data && activity.data.results.length > 0 && (
          <div className="table-wrap">
            <p className="muted">{activity.data.count} entries.</p>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
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
                      <span className="badge">
                        {TYPE_NAMES[entry.model_name] || entry.model_name} {entry.action_display.toLowerCase()}
                      </span>
                    </td>
                    <td>{entry.object_repr}</td>
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

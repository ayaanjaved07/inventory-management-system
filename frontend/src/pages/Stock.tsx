import { useState } from 'react'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { formatDateTime } from '../lib/utils'
import type { Paginated, StockMovement } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { NewMovementForm } from '../components/NewMovementForm'

export default function Stock() {
  const { hasRole } = useAuth()
  const canRecord = hasRole('Admin', 'Manager', 'Storekeeper')

  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const movements = useApi<Paginated<StockMovement>>(`/stock/movements/?page=${page}`)

  return (
    <>
      <div className="page-header">
        <h1>Stock</h1>
        {canRecord && <button onClick={() => setShowForm(!showForm)}>Record movement</button>}
      </div>

      <p className="muted">
        Movements can't be edited or deleted. To correct a mistake, record an adjustment.
      </p>

      {showForm && canRecord && (
        <NewMovementForm
          onSaved={() => {
            setShowForm(false)
            movements.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="card">
        <h2>Movements</h2>
        {movements.error && <p className="error">{movements.error}</p>}
        {!movements.data && movements.loading && <p>Loading...</p>}
        {movements.data && movements.data.results.length === 0 && (
          <p className="muted">No stock movements yet.</p>
        )}
        {movements.data && movements.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th className="num">Quantity</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {movements.data.results.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.created_at)}</td>
                    <td>
                      {m.item_name} <span className="muted mono">{m.item_sku}</span>
                    </td>
                    <td>{m.movement_type_display}</td>
                    <td>{m.location_code}</td>
                    <td className="num">
                      <span className={m.quantity > 0 ? 'badge green' : 'badge red'}>
                        {m.quantity > 0 ? '+' + m.quantity : m.quantity}
                      </span>
                    </td>
                    <td>{m.created_by_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={movements.data ? movements.data.count : 0} onChange={setPage} />
      </div>
    </>
  )
}

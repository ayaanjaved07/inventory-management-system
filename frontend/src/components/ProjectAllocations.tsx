import { useState } from 'react'

import { apiPost, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { Allocation, Paginated } from '../lib/types'
import { NewAllocationForm } from './NewAllocationForm'

// The parts allocated to one project, with Issue / Return / Cancel buttons.
// onChange tells the Projects page to reload its allocation counts.
export function ProjectAllocations({
  projectId,
  canEdit,
  onChange,
}: {
  projectId: number
  canEdit: boolean
  onChange: () => void
}) {
  const allocations = useApi<Paginated<Allocation>>(`/allocations/?project=${projectId}`)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Runs the issue, return or cancel action on one allocation.
  // Issue and return use the full remaining amount.
  async function act(id: number, action: 'issue' | 'return' | 'cancel', quantity?: number) {
    setBusy(true)
    try {
      await apiPost(`/allocations/${id}/${action}/`, action === 'cancel' ? {} : { quantity })
      setError('')
      allocations.reload()
      onChange()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  const rows = allocations.data ? allocations.data.results : []

  return (
    <>
      {error && <p className="error">{error}</p>}

      {canEdit && !showForm && (
        <button className="secondary small" onClick={() => setShowForm(true)}>
          Allocate parts
        </button>
      )}

      {showForm && canEdit && (
        <NewAllocationForm
          projectId={projectId}
          onSaved={() => {
            setShowForm(false)
            allocations.reload()
            onChange()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {allocations.loading && !allocations.data && <p>Loading...</p>}
      {allocations.data && rows.length === 0 && (
        <p className="muted">Nothing allocated to this project yet.</p>
      )}

      {rows.length > 0 && (
        <table style={{ marginTop: 8, background: 'white' }}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Location</th>
              <th className="num">Allocated</th>
              <th className="num">Issued</th>
              <th className="num">Returned</th>
              <th>Status</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.item_name} <span className="muted mono">{a.item_sku}</span>
                </td>
                <td className="mono">{a.location_code}</td>
                <td className="num">{a.quantity_allocated}</td>
                <td className="num">{a.quantity_issued}</td>
                <td className="num">{a.quantity_returned}</td>
                <td>
                  <span className="badge">{a.status_display}</span>
                </td>
                {canEdit && (
                  <td>
                    <div className="row">
                      {a.outstanding_reservation > 0 && (
                        <button
                          className="secondary small"
                          disabled={busy}
                          onClick={() => act(a.id, 'issue', a.outstanding_reservation)}
                        >
                          Issue
                        </button>
                      )}
                      {a.quantity_outstanding > 0 && (
                        <button
                          className="secondary small"
                          disabled={busy}
                          onClick={() => act(a.id, 'return', a.quantity_outstanding)}
                        >
                          Return
                        </button>
                      )}
                      {/* Only a reservation with nothing issued yet can be cancelled. */}
                      {a.quantity_issued === 0 && a.status !== 'CANCELLED' && (
                        <button
                          className="secondary small"
                          disabled={busy}
                          onClick={() => act(a.id, 'cancel')}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

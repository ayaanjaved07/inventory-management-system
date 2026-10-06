import { useState } from 'react'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import type { Paginated, Purchase } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { NewPurchaseForm } from '../components/NewPurchaseForm'
import { PurchaseRow } from '../components/PurchaseRow'

// Everything we have bought from suppliers.
export default function Purchases() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  // The purchase whose lines are open. Only one at a time.
  const [openId, setOpenId] = useState<number | null>(null)

  const filters = new URLSearchParams()
  if (search) filters.set('search', search)
  const purchases = useApi<Paginated<Purchase>>(`/purchases/?${filters}&page=${page}`)

  return (
    <>
      <div className="page-header">
        <h1>Purchases</h1>
        {canEdit && <button onClick={() => setShowForm(!showForm)}>Record purchase</button>}
      </div>

      {showForm && canEdit && (
        <NewPurchaseForm
          onSaved={() => {
            setShowForm(false)
            purchases.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="card">
        <input
          style={{ maxWidth: 320, marginTop: 0, marginBottom: 12 }}
          placeholder="Search by reference or supplier..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />

        {purchases.error && <p className="error">{purchases.error}</p>}
        {!purchases.data && purchases.loading && <p>Loading...</p>}
        {purchases.data && purchases.data.results.length === 0 && (
          <p className="muted">No purchases recorded yet.</p>
        )}
        {purchases.data && purchases.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Location</th>
                  <th className="num">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {purchases.data.results.map((purchase) => (
                  <PurchaseRow
                    key={purchase.id}
                    purchase={purchase}
                    isOpen={openId === purchase.id}
                    onToggle={() => setOpenId(openId === purchase.id ? null : purchase.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={purchases.data ? purchases.data.count : 0} onChange={setPage} />
      </div>
    </>
  )
}

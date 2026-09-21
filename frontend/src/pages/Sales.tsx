import { useState } from 'react'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import type { Paginated, Sale, SalesStats } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { SalesSummary } from '../components/SalesSummary'
import { NewSaleForm } from '../components/NewSaleForm'
import { SaleRow } from '../components/SaleRow'

export default function Sales() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  // The sale whose lines are open. Only one at a time.
  const [openId, setOpenId] = useState<number | null>(null)

  const filters = new URLSearchParams()
  if (search) filters.set('search', search)
  const sales = useApi<Paginated<Sale>>(`/sales/?${filters}&page=${page}`)
  const stats = useApi<SalesStats>('/stats/sales/')

  const currency = stats.data ? stats.data.base_currency : 'INR'

  return (
    <>
      <div className="page-header">
        <h1>Sales</h1>
        {canEdit && <button onClick={() => setShowForm(!showForm)}>Record sale</button>}
      </div>

      {stats.data && <SalesSummary stats={stats.data} />}

      {showForm && canEdit && (
        <NewSaleForm
          currency={currency}
          onSaved={() => {
            setShowForm(false)
            sales.reload()
            stats.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="card">
        <input
          style={{ maxWidth: 320, marginTop: 0, marginBottom: 12 }}
          placeholder="Search by invoice or customer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />

        {sales.error && <p className="error">{sales.error}</p>}
        {!sales.data && sales.loading && <p>Loading...</p>}
        {sales.data && sales.data.results.length === 0 && <p className="muted">No sales recorded yet.</p>}
        {sales.data && sales.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th className="num">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sales.data.results.map((sale) => (
                  <SaleRow
                    key={sale.id}
                    sale={sale}
                    baseCurrency={currency}
                    isOpen={openId === sale.id}
                    onToggle={() => setOpenId(openId === sale.id ? null : sale.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={sales.data ? sales.data.count : 0} onChange={setPage} />
      </div>
    </>
  )
}

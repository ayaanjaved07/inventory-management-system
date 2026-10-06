import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { formatCurrency } from '../lib/utils'
import type { Paginated, Purchase, Supplier } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { ContactCard } from '../components/ContactCard'
import { NewPurchaseForm } from '../components/NewPurchaseForm'
import { PurchaseRow } from '../components/PurchaseRow'

// One supplier: their details and everything we have bought from them.
export default function SupplierDetail() {
  const { id } = useParams()
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const supplier = useApi<Supplier>(`/suppliers/${id}/`)
  const purchases = useApi<Paginated<Purchase>>(`/purchases/?supplier=${id}&page=${page}`)

  if (supplier.error) return <p className="error">{supplier.error}</p>
  if (!supplier.data) return <p>Loading...</p>

  const data = supplier.data

  return (
    <>
      <Link to="/suppliers">&larr; Back to suppliers</Link>

      <div className="page-header" style={{ marginTop: 12 }}>
        <h1>{data.name}</h1>
        {canEdit && <button onClick={() => setShowForm(!showForm)}>Record purchase</button>}
      </div>
      <p className="muted">
        {data.purchase_count} purchases, {formatCurrency(data.total_purchased || 0)} in total.
      </p>

      {showForm && canEdit && (
        <NewPurchaseForm
          supplierId={data.id}
          onSaved={() => {
            setShowForm(false)
            purchases.reload()
            supplier.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ContactCard contact={data} path="/suppliers/" canEdit={canEdit} onSaved={supplier.reload} />

      <div className="card">
        <h2>Purchase history</h2>
        {purchases.data && purchases.data.results.length === 0 && (
          <p className="muted">Nothing bought from this supplier yet.</p>
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

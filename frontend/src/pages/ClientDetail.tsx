import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { formatCurrency } from '../lib/utils'
import type { Customer, Paginated, Sale } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { ContactCard } from '../components/ContactCard'
import { NewSaleForm } from '../components/NewSaleForm'
import { SaleRow } from '../components/SaleRow'

// The currency the backend reports totals in. Same default as the Sales page.
const BASE_CURRENCY = 'INR'

// One client: their details and everything we have sold to them.
export default function ClientDetail() {
  const { id } = useParams()
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const client = useApi<Customer>(`/customers/${id}/`)
  const sales = useApi<Paginated<Sale>>(`/sales/?customer=${id}&page=${page}`)

  if (client.error) return <p className="error">{client.error}</p>
  if (!client.data) return <p>Loading...</p>

  const data = client.data

  return (
    <>
      <Link to="/clients">&larr; Back to clients</Link>

      <div className="page-header" style={{ marginTop: 12 }}>
        <h1>{data.name}</h1>
        {canEdit && <button onClick={() => setShowForm(!showForm)}>Record sale</button>}
      </div>
      <p className="muted">
        {data.sale_count} sales, {formatCurrency(data.total_sold || 0, BASE_CURRENCY)} in total.
      </p>

      {showForm && canEdit && (
        <NewSaleForm
          currency={BASE_CURRENCY}
          customerId={data.id}
          onSaved={() => {
            setShowForm(false)
            sales.reload()
            client.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ContactCard contact={data} path="/customers/" canEdit={canEdit} onSaved={client.reload} />

      <div className="card">
        <h2>Sales history</h2>
        {sales.data && sales.data.results.length === 0 && <p className="muted">Nothing sold to this client yet.</p>}
        {sales.data && sales.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
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
                    baseCurrency={BASE_CURRENCY}
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

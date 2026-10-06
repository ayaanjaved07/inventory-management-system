import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { formatCurrency } from '../lib/utils'
import type { Paginated, Supplier } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { ContactForm } from '../components/ContactForm'

// The stores and vendors we buy from.
export default function Suppliers() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)

  const filters = new URLSearchParams()
  if (search) filters.set('search', search)
  const suppliers = useApi<Paginated<Supplier>>(`/suppliers/?${filters}&page=${page}`)

  return (
    <>
      <div className="page-header">
        <h1>Suppliers</h1>
        {canEdit && <button onClick={() => setShowForm(!showForm)}>New supplier</button>}
      </div>

      {showForm && canEdit && (
        <ContactForm
          title="New supplier"
          path="/suppliers/"
          onSaved={() => {
            setShowForm(false)
            suppliers.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="card">
        <input
          style={{ maxWidth: 320, marginTop: 0, marginBottom: 12 }}
          placeholder="Search by name, phone or address..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />

        {suppliers.error && <p className="error">{suppliers.error}</p>}
        {!suppliers.data && suppliers.loading && <p>Loading...</p>}
        {suppliers.data && suppliers.data.results.length === 0 && <p className="muted">No suppliers yet.</p>}
        {suppliers.data && suppliers.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact person</th>
                  <th>Phone</th>
                  <th className="num">Purchases</th>
                  <th className="num">Total bought</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.data.results.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/suppliers/${s.id}`}>{s.name}</Link>
                    </td>
                    <td>{s.contact_person || '-'}</td>
                    <td>{s.phone || '-'}</td>
                    <td className="num">{s.purchase_count}</td>
                    <td className="num">{formatCurrency(s.total_purchased || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={suppliers.data ? suppliers.data.count : 0} onChange={setPage} />
      </div>
    </>
  )
}

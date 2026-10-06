import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { formatCurrency } from '../lib/utils'
import type { Customer, Paginated } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { ContactForm } from '../components/ContactForm'

// The stores and businesses we sell to. The backend calls them customers.
export default function Clients() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)

  const filters = new URLSearchParams()
  if (search) filters.set('search', search)
  const clients = useApi<Paginated<Customer>>(`/customers/?${filters}&page=${page}`)

  return (
    <>
      <div className="page-header">
        <h1>Clients</h1>
        {canEdit && <button onClick={() => setShowForm(!showForm)}>New client</button>}
      </div>

      {showForm && canEdit && (
        <ContactForm
          title="New client"
          path="/customers/"
          onSaved={() => {
            setShowForm(false)
            clients.reload()
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

        {clients.error && <p className="error">{clients.error}</p>}
        {!clients.data && clients.loading && <p>Loading...</p>}
        {clients.data && clients.data.results.length === 0 && <p className="muted">No clients yet.</p>}
        {clients.data && clients.data.results.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact person</th>
                  <th>Phone</th>
                  <th className="num">Sales</th>
                  <th className="num">Total sold</th>
                </tr>
              </thead>
              <tbody>
                {clients.data.results.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/clients/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>{c.contact_person || '-'}</td>
                    <td>{c.phone || '-'}</td>
                    <td className="num">{c.sale_count}</td>
                    <td className="num">{formatCurrency(c.total_sold || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={clients.data ? clients.data.count : 0} onChange={setPage} />
      </div>
    </>
  )
}

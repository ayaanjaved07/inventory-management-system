import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { errorMessage, send } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import { NO_ITEM_FILTERS } from '../lib/types'
import type { Item, Paginated } from '../lib/types'
import { Pagination } from '../components/Pagination'
import { ItemsTable } from '../components/ItemsTable'
import { NewItemForm } from '../components/NewItemForm'
import { ItemsCsvImport } from '../components/ItemsCsvImport'
import { ItemFilters } from '../components/ItemFilters'

export default function Items() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  // The dashboard links here with ?stock=low or ?expiry=soon already set.
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState({
    ...NO_ITEM_FILTERS,
    stock: searchParams.get('stock') || '',
    expiry: searchParams.get('expiry') || '',
  })
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [exportError, setExportError] = useState('')

  // The filters go into the URL, skipping empty ones. When they change,
  // useApi loads again.
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value)
  }

  const items = useApi<Paginated<Item>>(`/items/?${query}&page=${page}`)

  // The export needs the login token, so a plain <a href> link would get a
  // 401. Instead we download the file ourselves and then save it.
  async function exportCsv() {
    setExportError('')
    try {
      const response = await send('GET', `/items/export/?${query}`)
      const blob = await response.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `items-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      // Free the file's memory once the download has started.
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch (err) {
      setExportError(errorMessage(err))
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Items</h1>
        <div className="row">
          <button className="secondary" onClick={exportCsv}>
            Export CSV
          </button>
          {canEdit && (
            <button className="secondary" onClick={() => setShowImport(!showImport)}>
              Import CSV
            </button>
          )}
          {canEdit && <button onClick={() => setShowForm(!showForm)}>New item</button>}
        </div>
      </div>

      {exportError && <p className="error">{exportError}</p>}

      {showImport && canEdit && <ItemsCsvImport onImported={items.reload} />}

      {showForm && canEdit && (
        <NewItemForm
          onSaved={() => {
            setShowForm(false)
            items.reload()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="card">
        <ItemFilters
          filters={filters}
          onChange={(next) => {
            setFilters(next)
            setPage(1)
          }}
        />
      </div>

      <div className="card">
        {items.data && items.data.count > 0 && <p className="muted">{items.data.count} items found.</p>}
        {items.error && <p className="error">{items.error}</p>}
        {!items.data && items.loading && <p>Loading...</p>}
        {items.data && items.data.results.length === 0 && <p className="muted">No items found.</p>}
        {items.data && items.data.results.length > 0 && <ItemsTable items={items.data.results} />}

        <Pagination page={page} total={items.data ? items.data.count : 0} onChange={setPage} />
      </div>
    </>
  )
}

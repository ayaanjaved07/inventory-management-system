import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Plus, Search, Upload } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Item, Paginated } from '@/lib/types'
import { Button, Card, EmptyState, ErrorNote, Input, Spinner } from '@/components/ui'
import { Pagination } from '@/components/Pagination'
import { ItemsTable } from '@/components/ItemsTable'
import { NewItemForm } from '@/components/NewItemForm'
import { ItemsCsvImport } from '@/components/ItemsCsvImport'

export default function Items() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [exportError, setExportError] = useState('')

  const items = useQuery({
    queryKey: ['items', search, lowOnly, page],
    queryFn: async () =>
      (await api.get<Paginated<Item>>('/items/', {
        params: {
          search: search || undefined,
          low_stock: lowOnly ? 'true' : undefined,
          page,
        },
      })).data,
  })

  // The export endpoint needs the Authorization header, so a plain <a href>
  // would 401. Fetch it as a blob and hand the browser an object URL instead.
  const exportCsv = useMutation({
    mutationFn: async () => {
      const { data } = await api.get('/items/export/', {
        params: { search: search || undefined, low_stock: lowOnly ? 'true' : undefined },
        responseType: 'blob',
      })
      return data as Blob
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `items-${new Date().toISOString().slice(0, 10)}.csv`
      // Some browsers (Firefox) only download if the link is on the page.
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Free the file's memory after the download has started.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportError('')
    },
    onError: (err) => setExportError(apiError(err)),
  })

  const results = items.data?.results ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Items</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          {canEdit && (
            <Button variant="secondary" onClick={() => setShowImport((v) => !v)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" />
              New item
            </Button>
          )}
        </div>
      </div>

      {exportError && <ErrorNote message={exportError} />}

      {showImport && canEdit && <ItemsCsvImport />}

      {showForm && canEdit && (
        <NewItemForm onSaved={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search by SKU or name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-indigo-700"
              checked={lowOnly}
              onChange={(e) => {
                setLowOnly(e.target.checked)
                setPage(1)
              }}
            />
            Low stock only
          </label>
        </div>

        {items.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : items.isError ? (
          <div className="p-4">
            <ErrorNote message="Something went wrong." />
          </div>
        ) : results.length === 0 ? (
          <EmptyState title="No items found." />
        ) : (
          <ItemsTable items={results} />
        )}

        <Pagination page={page} total={items.data?.count ?? 0} onChange={setPage} />
      </Card>
    </div>
  )
}

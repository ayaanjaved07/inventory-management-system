import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Paginated, Sale, SalesStats } from '@/lib/types'
import { Button, Card, EmptyState, ErrorNote, Input, Spinner } from '@/components/ui'
import { Pagination } from '@/components/Pagination'
import { SalesSummary } from '@/components/SalesSummary'
import { NewSaleForm } from '@/components/NewSaleForm'
import { SaleRow } from '@/components/SaleRow'

export default function Sales() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)

  const sales = useQuery({
    queryKey: ['sales', search, page],
    queryFn: async () =>
      (await api.get<Paginated<Sale>>('/sales/', {
        params: { search: search || undefined, page },
      })).data,
  })

  const stats = useQuery({
    queryKey: ['sales-stats'],
    queryFn: async () => (await api.get<SalesStats>('/stats/sales/')).data,
  })

  const rows = sales.data?.results ?? []
  const currency = stats.data?.base_currency ?? 'INR'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Sales</h1>
        {canEdit && (
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            Record sale
          </Button>
        )}
      </div>

      <SalesSummary stats={stats.data} currency={currency} />

      {showForm && canEdit && (
        <NewSaleForm
          currency={currency}
          onSaved={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search by invoice or customer..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </div>

        {sales.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : sales.isError ? (
          <div className="p-4">
            <ErrorNote message="Something went wrong." />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No sales recorded yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((sale) => (
              <SaleRow
                key={sale.id}
                sale={sale}
                baseCurrency={currency}
                isOpen={openId === sale.id}
                onToggle={() => setOpenId(openId === sale.id ? null : sale.id)}
              />
            ))}
          </ul>
        )}

        <Pagination page={page} total={sales.data?.count ?? 0} onChange={setPage} />
      </Card>
    </div>
  )
}

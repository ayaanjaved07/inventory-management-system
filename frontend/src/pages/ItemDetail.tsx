import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { Item, Paginated, StockMovement } from '@/lib/types'
import { Badge, Card, CardHeader, EmptyState, ErrorNote, Spinner } from '@/components/ui'
import { ImageUploader } from '@/components/ImageUploader'

interface LocationLevel {
  location_id: number
  location_code: string
  location_name: string
  quantity: number
}


export default function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const { hasRole } = useAuth()
  const canEdit = hasRole('Admin', 'Manager')

  const item = useQuery({
    queryKey: ['item', id],
    queryFn: async () => (await api.get<Item>(`/items/${id}/`)).data,
    enabled: Boolean(id),
  })

  const levels = useQuery({
    queryKey: ['item', id, 'stock'],
    queryFn: async () => (await api.get<LocationLevel[]>(`/items/${id}/stock/`)).data,
    enabled: Boolean(id),
  })

  const movements = useQuery({
    queryKey: ['movements', 'item', id],
    queryFn: async () =>
      (await api.get<Paginated<StockMovement>>('/stock/movements/', {
        params: { item: id },
      })).data,
    enabled: Boolean(id),
  })

  if (item.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  if (item.isError || !item.data) return <ErrorNote message="Something went wrong." />

  const data = item.data

  const facts: Array<[string, string]> = [
    ['Category', data.category_name ?? '—'],
    ['Unit', data.unit],
    ['Unit cost', formatCurrency(data.unit_cost, data.currency_code ?? 'INR')],
    ['Reorder point', String(data.reorder_point)],
    ['On hand', String(data.on_hand)],
    ['Active', data.is_active ? 'Yes' : 'No'],
  ]

  return (
    <div className="space-y-5">
      <Link
        to="/items"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Items
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{data.name}</h1>
          <p className="mt-0.5 font-mono text-sm text-slate-500">{data.sku}</p>
        </div>
        <div className="flex items-center gap-3">
          {data.is_low_stock && <Badge tone="amber">Low stock</Badge>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <dl className="divide-y divide-slate-100 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-5 py-3">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Stock by location" />
          {levels.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : levels.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {levels.data.map((l) => (
                <li key={l.location_id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{l.location_name}</div>
                    <div className="font-mono text-xs text-slate-500">{l.location_code}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{l.quantity}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No stock at any location." />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Images" />
        <div className="p-5 pt-0">
          <ImageUploader itemId={data.id} canEdit={canEdit} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Movements" />
        {movements.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : movements.data?.results.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="ledger-head bg-slate-50 text-left">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3 text-right">Quantity</th>
                  <th className="px-5 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.data.results.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                      {formatDateTime(m.created_at)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{m.movement_type_display}</td>
                    <td className="px-5 py-3 text-slate-600">{m.location_code}</td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={m.quantity > 0 ? 'green' : 'red'}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{m.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No movements for this item yet." />
        )}
      </Card>
    </div>
  )
}

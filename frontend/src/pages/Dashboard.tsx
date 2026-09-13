import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { api } from '@/lib/api'
import { cn, formatCurrency, formatDateTime, formatNumber } from '@/lib/utils'
import type { DashboardStats, Paginated, StockMovement } from '@/lib/types'
import { Badge, Card, CardHeader, EmptyState, ErrorNote, Spinner } from '@/components/ui'

/* One number in the stats grid at the top of the dashboard.

   Each cell draws a line on its left and top, then moves itself 1px left
   and 1px up (-ml-px -mt-px). That puts its line on top of the line of the
   cell next to it, so the lines between cells are 1px instead of 2px.
   Lines on the outside edge end up under the card's own border, and the
   card's overflow-hidden cuts them off. */
function Stat({
  label, value, tone = 'normal',
}: {
  label: string
  value: string
  tone?: 'normal' | 'warning'
}) {
  return (
    <div className="-ml-px -mt-px border-l border-t border-slate-200 px-5 py-4">
      <p className="truncate text-sm text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          tone === 'warning' ? 'text-amber-700' : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export default function Dashboard() {

  const stats = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardStats>('/stats/dashboard/')).data,
  })

  const movements = useQuery({
    queryKey: ['movements', 'recent'],
    queryFn: async () =>
      (await api.get<Paginated<StockMovement>>('/stock/movements/', {
        params: { page_size: 8 },
      })).data,
  })

  if (stats.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  if (stats.isError) return <ErrorNote message="Something went wrong." />

  const data = stats.data!
  const chartData = data.low_stock_items.map((i) => ({
    name: i.sku,
    onHand: i.on_hand,
    reorderPoint: i.reorder_point,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>

      <Card className="grid grid-cols-1 overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Items tracked" value={formatNumber(data.total_items)} />
        <Stat label="Units on hand" value={formatNumber(data.total_units)} />
        <Stat label="Stock value" value={formatCurrency(data.stock_value)} />
        <Stat
          label="Low stock"
          value={formatNumber(data.low_stock_count)}
          tone={data.low_stock_count > 0 ? 'warning' : 'normal'}
        />
        <Stat
          label="Revenue (30 days)"
          value={formatCurrency(data.revenue_30d, data.base_currency)}
        />
        <Stat label="Invoices" value={formatNumber(data.invoice_count)} />
        <Stat label="Active projects" value={formatNumber(data.active_projects)} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Items at or below reorder point" />
          {data.low_stock_items.length === 0 ? (
            <EmptyState title="Everything is above its reorder point." />
          ) : (
            <div className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 4,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="onHand" name="On hand" fill="#4338ca" radius={[1, 1, 0, 0]} />
                  <Bar dataKey="reorderPoint" name="Reorder point" fill="#fbbf24" radius={[1, 1, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent stock movements" />
          {movements.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : movements.data?.results.length ? (
            <ul className="divide-y divide-slate-100">
              {movements.data.results.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <Badge tone={m.quantity > 0 ? 'green' : 'red'}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/items/${m.item}`}
                      className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-700"
                    >
                      {m.item_name}
                    </Link>
                    <p className="flex gap-2.5 truncate text-xs text-slate-500">
                      <span>{m.movement_type_display}</span>
                      <span className="font-mono">{m.location_code}</span>
                      {m.created_by_name && <span>{m.created_by_name}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatDateTime(m.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No stock movements yet." />
          )}
        </Card>
      </div>
    </div>
  )
}

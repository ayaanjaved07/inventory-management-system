import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { api } from '@/lib/api'
import { cn, formatCurrency, formatDateTime, formatNumber } from '@/lib/utils'
import type { DashboardStats, Paginated, StockMovement } from '@/lib/types'
import { Badge, Card, CardHeader, EmptyState, ErrorNote, Spinner } from '@/components/ui'

/* The figures read as the summary block at the foot of a folio: one ruled
   grid, labels above, totals in ink. Not six floating cards. */
function Stat({
  label, value, tone = 'ink',
}: {
  label: string
  value: string
  tone?: 'ink' | 'reserved'
}) {
  return (
    <div className="-ml-px -mt-px border-l border-t border-slate-200 px-5 py-4">
      <p className="truncate text-sm text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          tone === 'reserved' ? 'text-amber-700' : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export default function Dashboard() {
  const { t } = useTranslation()

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
  if (stats.isError) return <ErrorNote message={t('common.error')} />

  const data = stats.data!
  const chartData = data.low_stock_items.map((i) => ({
    name: i.sku,
    [t('items.onHand')]: i.on_hand,
    [t('items.reorderPoint')]: i.reorder_point,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{t('dashboard.title')}</h1>

      <Card className="grid grid-cols-1 overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t('dashboard.totalItems')} value={formatNumber(data.total_items)} />
        <Stat label={t('dashboard.totalUnits')} value={formatNumber(data.total_units)} />
        <Stat label={t('dashboard.stockValue')} value={formatCurrency(data.stock_value)} />
        <Stat
          label={t('dashboard.lowStock')}
          value={formatNumber(data.low_stock_count)}
          tone={data.low_stock_count > 0 ? 'reserved' : 'ink'}
        />
        <Stat
          label={t('dashboard.revenue30d')}
          value={formatCurrency(data.revenue_30d, data.base_currency)}
        />
        <Stat label={t('dashboard.invoices')} value={formatNumber(data.invoice_count)} />
        <Stat label={t('dashboard.activeProjects')} value={formatNumber(data.active_projects)} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.lowStockTitle')} />
          {data.low_stock_items.length === 0 ? (
            <EmptyState title={t('dashboard.allStocked')} />
          ) : (
            <div className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d8" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6f6a5e' }} stroke="#d0cabd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6f6a5e' }} stroke="#d0cabd" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 4,
                      border: '1px solid #e5e1d8',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey={t('items.onHand')} fill="#2e4374" radius={[1, 1, 0, 0]} />
                  <Bar dataKey={t('items.reorderPoint')} fill="#d3a63f" radius={[1, 1, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title={t('dashboard.recentMovements')} />
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
                      className="block truncate text-sm font-medium text-slate-900 hover:text-teal-700"
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
                    {formatDateTime(m.created_at, 'en-IN')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t('items.empty')} />
          )}
        </Card>
      </div>
    </div>
  )
}

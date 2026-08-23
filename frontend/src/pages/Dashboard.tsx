import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, FileText, FolderKanban, IndianRupee, Layers, Package, Receipt,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils'
import type { DashboardStats, Paginated, StockMovement } from '@/lib/types'
import { Badge, Card, CardHeader, EmptyState, ErrorNote, Spinner } from '@/components/ui'

function StatCard({
  label, value, icon: Icon, tone = 'teal',
}: {
  label: string
  value: string
  icon: typeof Package
  tone?: 'teal' | 'amber' | 'slate'
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className={`rounded-lg p-2.5 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.totalItems')}
          value={formatNumber(data.total_items)}
          icon={Package}
        />
        <StatCard
          label={t('dashboard.totalUnits')}
          value={formatNumber(data.total_units)}
          icon={Layers}
        />
        <StatCard
          label={t('dashboard.stockValue')}
          value={formatCurrency(data.stock_value)}
          icon={IndianRupee}
        />
        <StatCard
          label={t('dashboard.lowStock')}
          value={formatNumber(data.low_stock_count)}
          icon={AlertTriangle}
          tone={data.low_stock_count > 0 ? 'amber' : 'slate'}
        />
        <StatCard
          label={t('dashboard.revenue30d')}
          value={formatCurrency(data.revenue_30d, data.base_currency)}
          icon={Receipt}
        />
        <StatCard
          label={t('dashboard.invoices')}
          value={formatNumber(data.invoice_count)}
          icon={FileText}
          tone="slate"
        />
        <StatCard
          label={t('dashboard.activeProjects')}
          value={formatNumber(data.active_projects)}
          icon={FolderKanban}
          tone="slate"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.lowStockTitle')} />
          {data.low_stock_items.length === 0 ? (
            <EmptyState title={t('dashboard.allStocked')} />
          ) : (
            <div className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey={t('items.onHand')} fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={t('items.reorderPoint')} fill="#fbbf24" radius={[4, 4, 0, 0]} />
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
                    <p className="truncate text-xs text-slate-500">
                      {m.movement_type_display} &middot; {m.location_code}
                      {m.created_by_name ? ` · ${m.created_by_name}` : ''}
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

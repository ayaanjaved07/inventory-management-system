import { IndianRupee, Receipt } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { formatCurrency, formatNumber } from '@/lib/utils'
import type { SalesStats } from '@/lib/types'
import { Card, CardHeader, EmptyState } from '@/components/ui'

/* The totals, revenue chart and best sellers at the top of the Sales page.
   It only displays the stats it is given. */
export function SalesSummary({ stats, currency }: { stats: SalesStats | undefined; currency: string }) {
  const chartData =
    stats?.revenue_by_month.map((row) => ({
      month: row.month,
      revenue: Number(row.revenue),
    })) ?? []

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Revenue</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900">
                {formatCurrency(stats?.revenue_total ?? 0, currency)}
              </p>
            </div>
            <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-700">
              <IndianRupee className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Invoices</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900">
                {formatNumber(stats?.invoice_count ?? 0)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
              <Receipt className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue by month" />
          <div className="p-5">
            {chartData.length === 0 ? (
              <EmptyState title="No sales in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                  <Tooltip formatter={(v) => formatCurrency(Number(v), currency)} />
                  <Bar dataKey="revenue" name="Revenue" fill="#4338ca" radius={[1, 1, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Best sellers" />
          {stats?.top_items.length ? (
            <ul className="divide-y divide-slate-100">
              {stats.top_items.map((row) => (
                <li key={row.sku} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{row.name}</div>
                    <div className="font-mono text-xs text-slate-500">{row.sku}</div>
                  </div>
                  <div className="pl-3 text-right">
                    <div className="text-sm font-semibold text-slate-900">
                      {formatCurrency(row.revenue, currency)}
                    </div>
                    <div className="text-xs text-slate-500">{row.quantity}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No sales in this period." />
          )}
        </Card>
      </div>
    </>
  )
}

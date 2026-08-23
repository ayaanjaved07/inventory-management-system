import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IndianRupee, Plus, Receipt, Search, Trash2 } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { api, apiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import type { Customer, Item, Location, Paginated, Sale, SalesStats } from '@/lib/types'
import {
  Button, Card, CardHeader, EmptyState, ErrorNote, Field, Input, Select, Spinner,
} from '@/components/ui'
import { Pagination } from '@/components/Pagination'

interface LineForm {
  item: string
  quantity: string
  unit_price: string
}

const EMPTY_LINE: LineForm = { item: '', quantity: '1', unit_price: '' }

export default function Sales() {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')

  const [invoiceNo, setInvoiceNo] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<LineForm[]>([{ ...EMPTY_LINE }])

  const canEdit = hasRole('Admin', 'Manager')

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

  const items = useQuery({
    queryKey: ['items', 'all'],
    queryFn: async () =>
      (await api.get<Paginated<Item>>('/items/', { params: { page_size: 200 } })).data,
  })

  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Paginated<Customer>>('/customers/')).data,
  })

  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<Paginated<Location>>('/locations/')).data,
  })

  const createSale = useMutation({
    mutationFn: async () =>
      (await api.post<Sale>('/sales/', {
        // Blank means "generate one" -- the backend owns the numbering.
        invoice_no: invoiceNo || undefined,
        customer: customerId ? Number(customerId) : null,
        location: Number(locationId),
        sale_date: saleDate,
        note,
        lines: lines
          .filter((l) => l.item)
          .map((l) => ({
            item: Number(l.item),
            quantity: Number(l.quantity),
            unit_price: l.unit_price || undefined,
          })),
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-stats'] })
      // A sale writes SALE movements, so every stock view is stale.
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setShowForm(false)
      setInvoiceNo('')
      setNote('')
      setLines([{ ...EMPTY_LINE }])
      setFormError('')
    },
    onError: (err) => setFormError(apiError(err)),
  })

  const updateLine = (index: number, patch: Partial<LineForm>) =>
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  const draftTotal = lines.reduce((sum, line) => {
    const item = items.data?.results.find((i) => String(i.id) === line.item)
    const price = Number(line.unit_price || item?.unit_cost || 0)
    return sum + price * Number(line.quantity || 0)
  }, 0)

  const rows = sales.data?.results ?? []
  const currency = stats.data?.base_currency ?? 'INR'
  const chartData =
    stats.data?.revenue_by_month.map((row) => ({
      month: row.month,
      [t('sales.revenue')]: Number(row.revenue),
    })) ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{t('sales.title')}</h1>
        {canEdit && (
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t('sales.new')}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('sales.revenue')}</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900">
                {formatCurrency(stats.data?.revenue_total ?? 0, currency)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{t('sales.frozenRate')}</p>
            </div>
            <div className="rounded-lg bg-teal-50 p-2.5 text-teal-700">
              <IndianRupee className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">{t('sales.invoices')}</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900">
                {formatNumber(stats.data?.invoice_count ?? 0)}
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
          <CardHeader title={t('sales.revenueByMonth')} />
          <div className="p-5">
            {chartData.length === 0 ? (
              <EmptyState title={t('sales.noRevenue')} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip formatter={(v) => formatCurrency(Number(v), currency)} />
                  <Bar dataKey={t('sales.revenue')} fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('sales.topItems')} />
          {stats.data?.top_items.length ? (
            <ul className="divide-y divide-slate-100">
              {stats.data.top_items.map((row) => (
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
            <EmptyState title={t('sales.noRevenue')} />
          )}
        </Card>
      </div>

      {showForm && canEdit && (
        <Card className="p-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              createSale.mutate()
            }}
          >
            {formError && <ErrorNote message={formError} />}
            <p className="text-sm text-slate-500">{t('sales.stockWarning')}</p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('sales.invoice')} hint={t('sales.invoiceHint')}>
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </Field>
              <Field label={t('sales.customer')}>
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">—</option>
                  {customers.data?.results.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('sales.location')}>
                <Select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  required
                >
                  <option value="">—</option>
                  {locations.data?.results.map((l) => (
                    <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('sales.date')}>
                <Input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">{t('sales.lines')}</div>
              {lines.map((line, index) => (
                <div key={index} className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <Field label={t('sales.item')}>
                    <Select
                      value={line.item}
                      onChange={(e) => updateLine(index, { item: e.target.value })}
                      required
                    >
                      <option value="">—</option>
                      {items.data?.results.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.sku} — {i.name} ({i.on_hand})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('sales.quantity')}>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label={t('sales.unitPrice')}>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={
                        items.data?.results.find((i) => String(i.id) === line.item)?.unit_cost
                      }
                      value={line.unit_price}
                      onChange={(e) => updateLine(index, { unit_price: e.target.value })}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={lines.length === 1}
                    aria-label={t('sales.removeLine')}
                    onClick={() => setLines((c) => c.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setLines((c) => [...c, { ...EMPTY_LINE }])}
              >
                <Plus className="h-4 w-4" />
                {t('sales.addLine')}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="text-sm text-slate-600">
                {t('sales.total')}:{' '}
                <span className="font-semibold text-slate-900">
                  {formatCurrency(draftTotal, currency)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={createSale.isPending}>
                  {createSale.isPending ? t('common.loading') : t('common.save')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder={t('sales.search')}
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
            <ErrorNote message={t('common.error')} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('sales.empty')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((sale) => (
              <li key={sale.id}>
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
                  onClick={() => setOpenId(openId === sale.id ? null : sale.id)}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-medium text-teal-700">
                      {sale.invoice_no}
                    </div>
                    <div className="mt-1 text-sm text-slate-900">
                      {sale.customer_name ?? '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-sm">
                    <span className="text-slate-500">{formatDate(sale.sale_date)}</span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(sale.total_amount, sale.currency)}
                    </span>
                  </div>
                </button>

                {openId === sale.id && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="pb-2">{t('sales.item')}</th>
                          <th className="pb-2 text-right">{t('sales.quantity')}</th>
                          <th className="pb-2 text-right">{t('sales.unitPrice')}</th>
                          <th className="pb-2 text-right">{t('sales.lineTotal')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sale.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="py-2">
                              <span className="font-mono text-xs text-slate-500">
                                {line.item_sku}
                              </span>{' '}
                              {line.item_name}
                            </td>
                            <td className="py-2 text-right">{line.quantity}</td>
                            <td className="py-2 text-right">
                              {formatCurrency(line.unit_price, sale.currency)}
                            </td>
                            <td className="py-2 text-right font-medium">
                              {formatCurrency(line.line_total, sale.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sale.currency !== currency && (
                      <p className="mt-3 text-xs text-slate-500">
                        {formatCurrency(sale.total_in_base_currency, currency)} @{' '}
                        {sale.exchange_rate_used} — {t('sales.frozenRate')}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <Pagination page={page} total={sales.data?.count ?? 0} onChange={setPage} />
      </Card>
    </div>
  )
}

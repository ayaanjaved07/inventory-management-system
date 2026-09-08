import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, ImageOff, Plus, Search, Upload } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatCurrency } from '@/lib/utils'
import type { Category, ImportReport, Item, Paginated } from '@/lib/types'
import {
  Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Select, Spinner,
} from '@/components/ui'
import { Pagination } from '@/components/Pagination'

interface ItemForm {
  sku: string
  name: string
  category: string
  unit: string
  unit_cost: string
  reorder_point: string
}

const EMPTY_FORM: ItemForm = {
  sku: '', name: '', category: '',
  unit: 'pc', unit_cost: '0', reorder_point: '0',
}

export default function Items() {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const [showImport, setShowImport] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [ioError, setIoError] = useState('')

  const canEdit = hasRole('Admin', 'Manager')

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

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Paginated<Category>>('/categories/')).data,
  })

  const createItem = useMutation({
    mutationFn: async (payload: ItemForm) =>
      (await api.post<Item>('/items/', {
        ...payload,
        category: payload.category || null,
        unit_cost: payload.unit_cost || '0',
        reorder_point: Number(payload.reorder_point) || 0,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setShowForm(false)
      setForm(EMPTY_FORM)
      setFormError('')
    },
    onError: (err) => setFormError(apiError(err)),
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
      link.click()
      URL.revokeObjectURL(url)
      setIoError('')
    },
    onError: (err) => setIoError(apiError(err)),
  })

  const runImport = useMutation({
    mutationFn: async ({ selected, commit }: { selected: File; commit: boolean }) => {
      const body = new FormData()
      body.append('file', selected)
      // Content-Type is left unset on purpose: axios omits it for FormData so
      // the browser can generate the multipart boundary.
      const { data } = await api.post<ImportReport>('/items/import/', body, {
        params: { commit: commit ? 'true' : 'false' },
      })
      return data
    },
    onSuccess: (data) => {
      setReport(data)
      setIoError('')
      if (data.committed) {
        queryClient.invalidateQueries({ queryKey: ['items'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        setFile(null)
      }
    },
    onError: (err) => {
      setIoError(apiError(err))
      setReport(null)
    },
  })

  const results = items.data?.results ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{t('items.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending}
          >
            <Download className="h-4 w-4" />
            {t('items.export')}
          </Button>
          {canEdit && (
            <Button variant="secondary" onClick={() => setShowImport((v) => !v)}>
              <Upload className="h-4 w-4" />
              {t('items.import')}
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" />
              {t('items.new')}
            </Button>
          )}
        </div>
      </div>

      {ioError && <ErrorNote message={ioError} />}

      {showImport && canEdit && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">{t('items.importTitle')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('items.importHint')}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label={t('items.chooseFile')}
              className="text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-700"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setReport(null)
              }}
            />
            <Button
              variant="secondary"
              disabled={!file || runImport.isPending}
              onClick={() => file && runImport.mutate({ selected: file, commit: false })}
            >
              {t('items.checkFile')}
            </Button>
          </div>

          {report && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="slate">{t('items.willCreate', { count: report.created })}</Badge>
                <Badge tone="slate">{t('items.willUpdate', { count: report.updated })}</Badge>
                {report.errors.length === 0 && (
                  <Badge tone="teal">{t('items.importClean')}</Badge>
                )}
              </div>

              {report.errors.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="ledger-head bg-slate-50 text-left text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-2">{t('items.row')}</th>
                        <th className="px-4 py-2">{t('items.sku')}</th>
                        <th className="px-4 py-2">{t('items.problem')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.errors.map((row) => (
                        <tr key={`${row.row}-${row.sku}`}>
                          <td className="px-4 py-2 text-slate-500">{row.row}</td>
                          <td className="px-4 py-2 font-mono text-xs">{row.sku || '—'}</td>
                          <td className="px-4 py-2 text-rose-700">{row.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {report.committed ? (
                <p className="text-sm text-teal-700">
                  {t('items.importDone', { created: report.created, updated: report.updated })}
                </p>
              ) : (
                /* Nothing has been written yet -- the check above was a dry run. */
                <Button
                  disabled={!file || report.errors.length > 0 || runImport.isPending}
                  onClick={() => file && runImport.mutate({ selected: file, commit: true })}
                >
                  {t('items.applyImport', { count: report.created + report.updated })}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {showForm && canEdit && (
        <Card className="p-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              createItem.mutate(form)
            }}
          >
            {formError && <ErrorNote message={formError} />}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('items.sku')}>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  required
                />
              </Field>
              <Field label={t('items.name')}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </Field>
              <Field label={t('items.category')}>
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">—</option>
                  {categories.data?.results.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('items.unit')}>
                <Select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                >
                  <option value="pc">Piece</option>
                  <option value="box">Box</option>
                  <option value="kg">Kilogram</option>
                  <option value="l">Litre</option>
                  <option value="m">Metre</option>
                  <option value="set">Set</option>
                </Select>
              </Field>
              <Field label={t('items.unitCost')}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unit_cost}
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                />
              </Field>
              <Field
                label={t('items.reorderPoint')}
                hint={t('dashboard.lowStockTitle')}
              >
                <Input
                  type="number"
                  min="0"
                  value={form.reorder_point}
                  onChange={(e) => setForm({ ...form, reorder_point: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createItem.isPending}>
                {createItem.isPending ? t('common.loading') : t('common.save')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                {t('common.cancel')}
              </Button>
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
              placeholder={t('items.search')}
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
              className="h-4 w-4 rounded border-slate-300 accent-teal-700"
              checked={lowOnly}
              onChange={(e) => {
                setLowOnly(e.target.checked)
                setPage(1)
              }}
            />
            {t('items.lowStockOnly')}
          </label>
        </div>

        {items.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : items.isError ? (
          <div className="p-4">
            <ErrorNote message={t('common.error')} />
          </div>
        ) : results.length === 0 ? (
          <EmptyState title={t('items.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="ledger-head bg-slate-50 text-left">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="w-14 px-5 py-3">
                    <span className="sr-only">{t('items.images')}</span>
                  </th>
                  <th className="px-5 py-3">{t('items.sku')}</th>
                  <th className="px-5 py-3">{t('items.name')}</th>
                  <th className="px-5 py-3">{t('items.category')}</th>
                  <th className="px-5 py-3 text-right">{t('items.unitCost')}</th>
                  <th className="px-5 py-3 text-right">{t('items.onHand')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-3 pl-5 pr-0">
                      {item.primary_image ? (
                        <img
                          src={item.primary_image}
                          alt=""
                          className="h-9 w-9 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded bg-slate-100">
                          <ImageOff className="h-4 w-4 text-slate-300" />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/items/${item.id}`}
                        className="font-mono text-xs font-medium text-teal-700 hover:underline"
                      >
                        {item.sku}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{item.name}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{item.category_name ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-600">
                      {formatCurrency(item.unit_cost, item.currency_code ?? 'INR')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="mr-2 font-medium text-slate-900">{item.on_hand}</span>
                      {item.is_low_stock && <Badge tone="amber">{t('dashboard.lowStock')}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={items.data?.count ?? 0} onChange={setPage} />
      </Card>
    </div>
  )
}

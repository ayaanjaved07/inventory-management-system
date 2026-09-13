import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Plus } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatDateTime } from '@/lib/utils'
import type { Item, Location, MovementType, Paginated, StockMovement } from '@/lib/types'
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Field, Input, Select, Spinner,
} from '@/components/ui'

// Movement types a user can record on this page. Sales, transfers and project
// movements are created by their own pages.
const MANUAL_TYPES: MovementType[] = ['RECEIPT', 'ISSUE', 'ADJUSTMENT']

export default function Stock() {
  const { hasRole } = useAuth()
  const queryClient = useQueryClient()

  const canRecord = hasRole('Admin', 'Manager', 'Storekeeper')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    item: '', location: '', movement_type: 'RECEIPT' as MovementType,
    quantity: '1', note: '',
  })

  const movements = useQuery({
    queryKey: ['movements'],
    queryFn: async () =>
      (await api.get<Paginated<StockMovement>>('/stock/movements/')).data,
  })

  const items = useQuery({
    queryKey: ['items', 'all'],
    queryFn: async () =>
      (await api.get<Paginated<Item>>('/items/', { params: { page_size: 200 } })).data,
  })

  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get<Paginated<Location>>('/locations/')).data,
  })

  const record = useMutation({
    mutationFn: async () =>
      (await api.post('/stock/movements/', {
        item: Number(form.item),
        location: Number(form.location),
        movement_type: form.movement_type,
        quantity: Number(form.quantity),
        note: form.note,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setShowForm(false)
      setForm({ ...form, quantity: '1', note: '' })
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const rows = movements.data?.results ?? []
  const isAdjustment = form.movement_type === 'ADJUSTMENT'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Stock</h1>
        {canRecord && (
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            Record movement
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>The ledger is append-only. To correct a mistake, record an adjustment.</p>
      </div>

      {showForm && canRecord && (
        <Card className="p-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              record.mutate()
            }}
          >
            {error && <ErrorNote message={error} />}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Item">
                <Select
                  value={form.item}
                  onChange={(e) => setForm({ ...form, item: e.target.value })}
                  required
                >
                  <option value="">—</option>
                  {items.data?.results.map((i) => (
                    <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Location">
                <Select
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  required
                >
                  <option value="">—</option>
                  {locations.data?.results.map((l) => (
                    <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Type">
                <Select
                  value={form.movement_type}
                  onChange={(e) =>
                    setForm({ ...form, movement_type: e.target.value as MovementType })
                  }
                >
                  {MANUAL_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Quantity"
                hint={isAdjustment ? 'Negative values allowed' : undefined}
              >
                <Input
                  type="number"
                  step="1"
                  // Only ADJUSTMENT is signed; the others take a magnitude and
                  // the backend applies direction.
                  min={isAdjustment ? undefined : 1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  required
                />
              </Field>
            </div>

            <Field label="Note">
              <Input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>

            <div className="flex gap-2">
              <Button type="submit" disabled={record.isPending}>
                {record.isPending ? 'Loading...' : 'Save'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title="Movements" />
        {movements.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No stock movements yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="ledger-head bg-slate-50 text-left">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3 text-right">Quantity</th>
                  <th className="px-5 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                      {formatDateTime(m.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{m.item_name}</div>
                      <div className="font-mono text-xs text-slate-500">{m.item_sku}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{m.movement_type_display}</td>
                    <td className="px-5 py-3 text-slate-600">{m.location_code}</td>
                    <td className="px-5 py-3 text-right">
                      <Badge tone={m.quantity > 0 ? 'green' : 'red'}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{m.created_by_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

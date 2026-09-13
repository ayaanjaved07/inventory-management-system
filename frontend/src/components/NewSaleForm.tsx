import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { Customer, Item, Location, Paginated, Sale } from '@/lib/types'
import { Button, Card, ErrorNote, Field, Input, Select } from '@/components/ui'

interface LineForm {
  id: number
  item: string
  quantity: string
  unit_price: string
}

// Each line gets its own id so React keeps the right inputs together when a
// line in the middle is removed.
let nextLineId = 1

function newLine(): LineForm {
  return { id: nextLineId++, item: '', quantity: '1', unit_price: '' }
}

/* The "Record sale" form: invoice details plus one row per item sold. */
export function NewSaleForm({
  currency, onSaved, onCancel,
}: {
  currency: string
  onSaved: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const [invoiceNo, setInvoiceNo] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<LineForm[]>(() => [newLine()])

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
      onSaved()
    },
    onError: (err) => setError(apiError(err)),
  })

  const updateLine = (id: number, patch: Partial<LineForm>) =>
    setLines((current) => current.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const draftTotal = lines.reduce((sum, line) => {
    const item = items.data?.results.find((i) => String(i.id) === line.item)
    const price = Number(line.unit_price || item?.unit_cost || 0)
    return sum + price * Number(line.quantity || 0)
  }, 0)

  return (
    <Card className="p-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          createSale.mutate()
        }}
      >
        {error && <ErrorNote message={error} />}
        <p className="text-sm text-slate-500">Recording a sale removes the stock from the ledger.</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Invoice" hint="Leave blank to generate one">
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </Field>
          <Field label="Customer">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">—</option>
              {customers.data?.results.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Location">
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
          <Field label="Date">
            <Input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700">Lines</div>
          {lines.map((line) => (
            <div key={line.id} className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Field label="Item">
                <Select
                  value={line.item}
                  onChange={(e) => updateLine(line.id, { item: e.target.value })}
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
              <Field label="Quantity">
                <Input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                  required
                />
              </Field>
              <Field label="Unit price">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={
                    items.data?.results.find((i) => String(i.id) === line.item)?.unit_cost
                  }
                  value={line.unit_price}
                  onChange={(e) => updateLine(line.id, { unit_price: e.target.value })}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                disabled={lines.length === 1}
                aria-label="Remove line"
                onClick={() => setLines((c) => c.filter((l) => l.id !== line.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setLines((c) => [...c, newLine()])}
          >
            <Plus className="h-4 w-4" />
            Add line
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="text-sm text-slate-600">
            Total:{' '}
            <span className="font-semibold text-slate-900">
              {formatCurrency(draftTotal, currency)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={createSale.isPending}>
              {createSale.isPending ? 'Loading...' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </Card>
  )
}

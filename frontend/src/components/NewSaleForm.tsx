import { useState } from 'react'
import type { FormEvent } from 'react'

import { apiPost, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import { formatCurrency } from '../lib/utils'
import type { Customer, Item, Location, Paginated } from '../lib/types'

interface Line {
  id: number
  item: string
  quantity: string
  unit_price: string
}

// Each line gets its own id, so React keeps the right inputs together when a
// line in the middle is removed.
let nextLineId = 1

function newLine(): Line {
  return { id: nextLineId++, item: '', quantity: '1', unit_price: '' }
}

// The "Record sale" form: invoice details plus one row per item sold.
export function NewSaleForm({
  currency,
  onSaved,
  onCancel,
}: {
  currency: string
  onSaved: () => void
  onCancel: () => void
}) {
  const items = useApi<Paginated<Item>>('/items/?page_size=200')
  const customers = useApi<Paginated<Customer>>('/customers/')
  const locations = useApi<Paginated<Location>>('/locations/')

  const [invoiceNo, setInvoiceNo] = useState('')
  const [customer, setCustomer] = useState('')
  const [location, setLocation] = useState('')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const itemList = items.data ? items.data.results : []

  function findItem(id: string) {
    return itemList.find((i) => String(i.id) === id)
  }

  // Change one field of one line and leave the other lines as they are.
  function updateLine(id: number, field: keyof Line, value: string) {
    setLines(lines.map((line) => (line.id === id ? { ...line, [field]: value } : line)))
  }

  // Total shown under the form. An empty price means the item's unit cost.
  let total = 0
  for (const line of lines) {
    const item = findItem(line.item)
    const price = Number(line.unit_price || (item ? item.unit_cost : 0))
    total += price * Number(line.quantity || 0)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiPost('/sales/', {
        // Blank means the backend makes up the invoice number.
        invoice_no: invoiceNo || undefined,
        customer: customer ? Number(customer) : null,
        location: Number(location),
        sale_date: saleDate,
        lines: lines
          .filter((line) => line.item)
          .map((line) => ({
            item: Number(line.item),
            quantity: Number(line.quantity),
            unit_price: line.unit_price || undefined,
          })),
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>Record sale</h2>
      <p className="muted">Recording a sale takes the stock out of the ledger.</p>
      {error && <p className="error">{error}</p>}

      <div className="form-grid">
        <label>
          Invoice
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          <span className="hint">Leave blank to generate one.</span>
        </label>
        <label>
          Customer
          <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">-</option>
            {customers.data?.results.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location
          <select value={location} onChange={(e) => setLocation(e.target.value)} required>
            <option value="">-</option>
            {locations.data?.results.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} - {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
        </label>
      </div>

      <h2>Lines</h2>
      <table style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Item (on hand)</th>
            <th>Quantity</th>
            <th>Unit price</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const item = findItem(line.item)
            return (
              <tr key={line.id}>
                <td>
                  <select value={line.item} onChange={(e) => updateLine(line.id, 'item', e.target.value)} required>
                    <option value="">-</option>
                    {itemList.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.sku} - {i.name} ({i.on_hand})
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={item ? item.unit_cost : ''}
                    value={line.unit_price}
                    onChange={(e) => updateLine(line.id, 'unit_price', e.target.value)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary small"
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((l) => l.id !== line.id))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="page-header">
        <button type="button" className="secondary small" onClick={() => setLines([...lines, newLine()])}>
          Add line
        </button>
        <strong>Total: {formatCurrency(total, currency)}</strong>
      </div>

      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

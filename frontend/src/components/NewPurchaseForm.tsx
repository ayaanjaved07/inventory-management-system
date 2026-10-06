import { useState } from 'react'
import type { FormEvent } from 'react'

import { apiPost, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import { formatCurrency } from '../lib/utils'
import type { Item, Location, Paginated, Supplier } from '../lib/types'

interface Line {
  id: number
  item: string
  quantity: string
  unit_cost: string
}

// Each line gets its own id, so React keeps the right inputs together when a
// line in the middle is removed.
let nextLineId = 1

function newLine(): Line {
  return { id: nextLineId++, item: '', quantity: '1', unit_cost: '' }
}

// The "Record purchase" form: who we bought from plus one row per item.
// Saving it adds the stock to the chosen location.
// `supplierId` picks the supplier in advance (used on a supplier's page).
export function NewPurchaseForm({
  supplierId,
  onSaved,
  onCancel,
}: {
  supplierId?: number
  onSaved: () => void
  onCancel: () => void
}) {
  const items = useApi<Paginated<Item>>('/items/?page_size=500&is_active=true')
  const suppliers = useApi<Paginated<Supplier>>('/suppliers/?page_size=500')
  const locations = useApi<Paginated<Location>>('/locations/')

  const [referenceNo, setReferenceNo] = useState('')
  const [supplier, setSupplier] = useState(supplierId ? String(supplierId) : '')
  const [location, setLocation] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
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

  // Total shown under the form. An empty cost means the item's unit cost.
  let total = 0
  for (const line of lines) {
    const item = findItem(line.item)
    const cost = Number(line.unit_cost || (item ? item.unit_cost : 0))
    total += cost * Number(line.quantity || 0)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiPost('/purchases/', {
        // Blank means the backend makes up the reference number.
        reference_no: referenceNo || undefined,
        supplier: Number(supplier),
        location: Number(location),
        purchase_date: purchaseDate,
        note,
        lines: lines
          .filter((line) => line.item)
          .map((line) => ({
            item: Number(line.item),
            quantity: Number(line.quantity),
            unit_cost: line.unit_cost || undefined,
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
      <h2>Record purchase</h2>
      <p className="muted">Recording a purchase adds the stock to the chosen location.</p>
      {error && <p className="error">{error}</p>}

      <div className="form-grid">
        <label>
          Reference
          <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
          <span className="hint">Leave blank to generate one.</span>
        </label>
        <label>
          Supplier
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} required>
            <option value="">-</option>
            {suppliers.data?.results.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deliver to
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
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
        </label>
        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <h2>Lines</h2>
      <table style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Item (on hand)</th>
            <th>Quantity</th>
            <th>Unit cost</th>
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
                    value={line.unit_cost}
                    onChange={(e) => updateLine(line.id, 'unit_cost', e.target.value)}
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
        <strong>Total: {formatCurrency(total)}</strong>
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

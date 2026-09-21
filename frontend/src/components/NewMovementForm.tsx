import { useState } from 'react'
import type { FormEvent } from 'react'

import { apiPost, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { Item, Location, Paginated } from '../lib/types'

// The "Record movement" form on the Stock page. Only these three types can
// be recorded by hand; sales and projects record their own movements.
export function NewMovementForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const items = useApi<Paginated<Item>>('/items/?page_size=200')
  const locations = useApi<Paginated<Location>>('/locations/')

  const [item, setItem] = useState('')
  const [location, setLocation] = useState('')
  const [type, setType] = useState('RECEIPT')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Only an adjustment can be negative. For the other types the backend
  // decides the direction (a receipt adds, an issue removes).
  const isAdjustment = type === 'ADJUSTMENT'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiPost('/stock/movements/', {
        item: Number(item),
        location: Number(location),
        movement_type: type,
        quantity: Number(quantity),
        note,
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>Record movement</h2>
      {error && <p className="error">{error}</p>}

      <div className="form-grid">
        <label>
          Item
          <select value={item} onChange={(e) => setItem(e.target.value)} required>
            <option value="">-</option>
            {items.data?.results.map((i) => (
              <option key={i.id} value={i.id}>
                {i.sku} - {i.name}
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
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="RECEIPT">Receipt (stock in)</option>
            <option value="ISSUE">Issue (stock out)</option>
            <option value="ADJUSTMENT">Adjustment</option>
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            step="1"
            min={isAdjustment ? undefined : 1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          {isAdjustment && <span className="hint">Negative numbers are allowed.</span>}
        </label>
        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
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

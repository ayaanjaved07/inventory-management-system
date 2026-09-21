import { useState } from 'react'
import type { FormEvent } from 'react'

import { apiPost, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { Availability, Item, Location, Paginated } from '../lib/types'

// The "Allocate parts" form inside an open project. Allocating only reserves
// the parts; the stock does not move until they are issued.
export function NewAllocationForm({
  projectId,
  onSaved,
  onCancel,
}: {
  projectId: number
  onSaved: () => void
  onCancel: () => void
}) {
  const items = useApi<Paginated<Item>>('/items/?page_size=200')
  const locations = useApi<Paginated<Location>>('/locations/')

  const [item, setItem] = useState('')
  const [location, setLocation] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // How many can still be promised. We show `available`, never `on_hand`,
  // because on_hand includes parts already reserved for other projects.
  let availabilityPath: string | null = null
  if (item) {
    availabilityPath = `/allocations/availability/?item=${item}`
    if (location) availabilityPath += `&location=${location}`
  }
  const availability = useApi<Availability>(availabilityPath)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiPost('/allocations/', {
        project: projectId,
        item: Number(item),
        location: Number(location),
        quantity: Number(quantity),
        note,
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
    setSaving(false)
  }

  const numbers = availability.data

  return (
    <form className="card" onSubmit={onSubmit} style={{ marginTop: 8 }}>
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
          Quantity
          <input
            type="number"
            min="1"
            max={numbers ? numbers.available : undefined}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          {numbers && (
            <span className="hint">
              {numbers.available} available of {numbers.on_hand} on hand ({numbers.reserved} reserved)
            </span>
          )}
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

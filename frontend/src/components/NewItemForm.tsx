import { useState } from 'react'
import type { FormEvent } from 'react'

import { apiPost, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { Category, Paginated } from '../lib/types'

const EMPTY_FORM = {
  sku: '',
  name: '',
  category: '',
  unit: 'pc',
  unit_cost: '0',
  reorder_point: '0',
  expiry_date: '',
}

// The "New item" form on the Items page.
export function NewItemForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const categories = useApi<Paginated<Category>>('/categories/')
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiPost('/items/', {
        ...form,
        category: form.category || null,
        unit_cost: form.unit_cost || '0',
        reorder_point: Number(form.reorder_point) || 0,
        // Blank means the item does not expire.
        expiry_date: form.expiry_date || null,
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>New item</h2>
      {error && <p className="error">{error}</p>}

      <div className="form-grid">
        <label>
          SKU
          <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
        </label>
        <label>
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">-</option>
            {categories.data?.results.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unit
          <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            <option value="pc">Piece</option>
            <option value="box">Box</option>
            <option value="kg">Kilogram</option>
            <option value="l">Litre</option>
            <option value="m">Metre</option>
            <option value="set">Set</option>
          </select>
        </label>
        <label>
          Unit cost
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.unit_cost}
            onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
          />
        </label>
        <label>
          Reorder point
          <input
            type="number"
            min="0"
            value={form.reorder_point}
            onChange={(e) => setForm({ ...form, reorder_point: e.target.value })}
          />
          <span className="hint">Shows as low stock at or below this number.</span>
        </label>
        <label>
          Expiry date
          <input
            type="date"
            value={form.expiry_date}
            onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
          />
          <span className="hint">Leave blank if it does not expire.</span>
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

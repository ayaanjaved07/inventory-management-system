import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiPost, errorMessage } from '../lib/api'

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  status: 'PLANNING',
  start_date: '',
  end_date: '',
}

// The "New project" form on the Projects page.
export function NewProjectForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiPost('/projects/', {
        ...form,
        // Django wants null, not '', for an empty date.
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>New project</h2>
      {error && <p className="error">{error}</p>}

      <div className="form-grid">
        <label>
          Code
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        </label>
        <label>
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="PLANNING">Planning</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label>
          Start date
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </label>
        <label>
          Description
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
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

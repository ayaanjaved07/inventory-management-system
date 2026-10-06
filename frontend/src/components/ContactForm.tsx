import { useState } from 'react'
import type { FormEvent } from 'react'

import { apiPatch, apiPost, errorMessage } from '../lib/api'
import type { Contact } from '../lib/types'

// The form for adding or editing a supplier or a client. Both have the same
// fields. `path` is '/suppliers/' or '/customers/'. Pass `contact` to edit an
// existing one; leave it out to add a new one.
export function ContactForm({
  title,
  path,
  contact,
  onSaved,
  onCancel,
}: {
  title: string
  path: string
  contact?: Contact
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: contact ? contact.name : '',
    contact_person: contact ? contact.contact_person : '',
    phone: contact ? contact.phone : '',
    email: contact ? contact.email : '',
    address: contact ? contact.address : '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      if (contact) {
        await apiPatch(`${path}${contact.id}/`, form)
      } else {
        await apiPost(path, form)
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
    setSaving(false)
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>{title}</h2>
      {error && <p className="error">{error}</p>}

      <div className="form-grid">
        <label>
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Contact person
          <input
            value={form.contact_person}
            onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
          />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
      </div>

      <label style={{ marginBottom: 12 }}>
        Address
        <textarea
          rows={2}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          style={{ display: 'block', width: '100%', marginTop: 4, font: 'inherit', padding: 8 }}
        />
      </label>

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

import { useState } from 'react'

import { apiPatch, errorMessage } from '../lib/api'
import { formatDate } from '../lib/utils'
import type { Item } from '../lib/types'
import { ExpiryBadge } from './ExpiryBadge'

// The expiry date on the item page. Admins and managers can change it.
export function ExpiryEditor({ item, canEdit, onSaved }: { item: Item; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.expiry_date || '')
  const [error, setError] = useState('')

  async function save() {
    try {
      // An empty box clears the date.
      await apiPatch(`/items/${item.id}/`, { expiry_date: value || null })
      setEditing(false)
      setError('')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!editing) {
    return (
      <div className="row">
        <span>{item.expiry_date ? formatDate(item.expiry_date) : 'Does not expire'}</span>
        <ExpiryBadge status={item.expiry_status} />
        {canEdit && (
          <button className="link" onClick={() => setEditing(true)}>
            Change
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <input type="date" style={{ width: 170, marginTop: 0 }} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="small" onClick={save}>
          Save
        </button>
        <button className="secondary small" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </>
  )
}

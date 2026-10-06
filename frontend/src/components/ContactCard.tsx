import { useState } from 'react'

import type { Contact } from '../lib/types'
import { ContactForm } from './ContactForm'

// The "Details" card on a supplier or client page, with an Edit button.
// `path` is '/suppliers/' or '/customers/'.
export function ContactCard({
  contact,
  path,
  canEdit,
  onSaved,
}: {
  contact: Contact
  path: string
  canEdit: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <ContactForm
        title="Edit details"
        path={path}
        contact={contact}
        onSaved={() => {
          setEditing(false)
          onSaved()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="card">
      <div className="page-header">
        <h2>Details</h2>
        {canEdit && (
          <button className="secondary small" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      <table>
        <tbody>
          <tr>
            <th>Contact person</th>
            <td>{contact.contact_person || '-'}</td>
          </tr>
          <tr>
            <th>Phone</th>
            <td>{contact.phone || '-'}</td>
          </tr>
          <tr>
            <th>Email</th>
            <td>{contact.email || '-'}</td>
          </tr>
          <tr>
            <th>Address</th>
            {/* pre-line keeps the line breaks people type into the address. */}
            <td style={{ whiteSpace: 'pre-line' }}>{contact.address || '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

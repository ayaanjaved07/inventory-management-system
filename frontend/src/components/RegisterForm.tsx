import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiPost, errorMessage } from '../lib/api'

// The sign-up form on the login page. The backend always gives a new account
// the Viewer role, so there is nothing here to choose a role with.
export default function RegisterForm({ onDone }: { onDone: (username: string) => void }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    // The backend checks this too; checking here saves a request.
    if (password !== password2) {
      setError('The two passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/auth/register/', { username, email, password, password2 })
      onDone(username)
    } catch (err) {
      setError(errorMessage(err))
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <p className="error">{error}</p>}

      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
      </label>

      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <span className="hint">At least 8 characters.</span>
      </label>

      <label>
        Confirm password
        <input
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          required
        />
      </label>

      <button type="submit" disabled={submitting} style={{ width: '100%' }}>
        {submitting ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  )
}

import { useState, type FormEvent } from 'react'

import { api, apiError } from '@/lib/api'
import { Button, ErrorNote, Field, Input } from '@/components/ui'

// The sign-up form shown on the login page. The backend always gives a new
// account the Viewer role, so there is nothing here to choose a role with.
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
    // The backend checks this as well; doing it here saves a round trip.
    if (password !== password2) {
      setError('The two passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/auth/register/', { username, email, password, password2 })
      onDone(username)
    } catch (err) {
      // A taken username or a too-short password comes back as 400 with a
      // message naming the field, which apiError() turns into readable text.
      setError(apiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <ErrorNote message={error} />}

      <Field label="Username">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </Field>

      <Field label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>

      <Field label="Password" hint="At least 8 characters.">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Field label="Confirm password">
        <Input
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Creating account...' : 'Create account'}
      </Button>
    </form>
  )
}

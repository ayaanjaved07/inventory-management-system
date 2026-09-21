import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/api'
import RegisterForm from '../components/RegisterForm'

export default function Login() {
  const { user, login, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Staff or administrator sign-in. The backend still checks what each user
  // is allowed to do.
  const [asAdmin, setAsAdmin] = useState(false)
  // Shows the register form instead of the sign-in form.
  const [showRegister, setShowRegister] = useState(false)

  if (loading) return <p style={{ padding: 20 }}>Loading...</p>
  if (user) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username, password, asAdmin)
    } catch (err) {
      setError(errorMessage(err))
    }
    setSubmitting(false)
  }

  // Registering does not sign anyone in. It goes back to the sign-in form
  // with the new username filled in.
  function onRegistered(newUsername: string) {
    setShowRegister(false)
    setUsername(newUsername)
    setPassword('')
    setError('')
    setNotice('Account created. You can sign in now.')
  }

  function switchTab() {
    setAsAdmin(!asAdmin)
    setError('')
    setNotice('')
  }

  if (showRegister) {
    return (
      <div className="card login-box">
        <h1>Create an account</h1>
        <p className="muted">
          New accounts get the Viewer role: you can look at everything, but not change anything.
        </p>
        <RegisterForm onDone={onRegistered} />
        <button className="link" onClick={() => setShowRegister(false)}>
          Back to sign-in
        </button>
      </div>
    )
  }

  return (
    <div className="card login-box">
      <h1>Lekha-Jokha</h1>
      <h2>{asAdmin ? 'Administrator sign-in' : 'Staff sign-in'}</h2>

      <form onSubmit={onSubmit}>
        {notice && <p className="success">{notice}</p>}
        {error && <p className="error">{error}</p>}

        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="row">
        <button className="link" onClick={switchTab}>
          {asAdmin ? 'Back to staff sign-in' : 'Sign in as an administrator'}
        </button>
        {!asAdmin && (
          <button
            className="link"
            onClick={() => {
              setShowRegister(true)
              setError('')
              setNotice('')
            }}
          >
            Create account
          </button>
        )}
      </div>
    </div>
  )
}

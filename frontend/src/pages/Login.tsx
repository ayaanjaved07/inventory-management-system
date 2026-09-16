import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { isAxiosError } from 'axios'

import { useAuth } from '@/lib/auth'
import { WrongLoginTabError } from '@/lib/errors'
import { apiError } from '@/lib/api'
import { Button, ErrorNote, Field, Input, Spinner, SuccessNote } from '@/components/ui'
import RegisterForm from '@/components/RegisterForm'

export default function Login() {
  const { user, login, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Staff / admin tab. Only decides which form is shown; the backend still
  // checks what each user is allowed to do.
  const [asAdmin, setAsAdmin] = useState(false)
  // Swaps the sign-in form for the register form on the same card.
  const [showRegister, setShowRegister] = useState(false)
  const [notice, setNotice] = useState('')

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  if (user) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username, password, { mode: asAdmin ? 'admin' : 'staff' })
    } catch (err) {
      if (err instanceof WrongLoginTabError) {
        setError(err.tab === 'admin' ? 'That is an administrator account. Use the administrator sign-in.' : 'That account does not have the Administrator role.')
        return
      }
      // A wrong username or password comes back as 401. Anything else (e.g. the
      // server is down) shows the actual error.
      if (isAxiosError(err) && err.response?.status === 401) {
        setError('Sign in failed. Check your username and password.')
      } else {
        setError(apiError(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Registering does not sign anyone in -- it sends them back to the sign-in
  // form with their new username already filled in.
  function onRegistered(newUsername: string) {
    setShowRegister(false)
    setUsername(newUsername)
    setPassword('')
    setError('')
    setNotice('Account created. You can sign in now.')
  }

  return (
    <div className="ruled-paper flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      <div className="grid w-full max-w-3xl border border-l-[3px] border-slate-200 border-l-red-700 bg-white md:grid-cols-[1fr_1.15fr]">
        <div className="hidden flex-col justify-center bg-indigo-900 p-8 text-white md:flex">
          <h1 className="font-display text-3xl">Lekha-Jokha</h1>
        </div>

        {showRegister ? (
          <div className="space-y-4 p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Create an account</h2>
              <p className="mt-1 text-sm text-slate-500">
                New accounts get the Viewer role: you can look at everything, but not
                change anything.
              </p>

              <button
                type="button"
                onClick={() => setShowRegister(false)}
                className="mt-1.5 text-sm font-medium text-indigo-700 underline-offset-2 hover:underline"
              >
                Back to sign-in
              </button>

              <h1 className="font-display mt-6 text-base text-slate-900 md:hidden">Lekha-Jokha</h1>
            </div>

            <RegisterForm onDone={onRegistered} />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 p-6 sm:p-8">
            <div className="mb-6">
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
                <span className="text-sm font-medium text-slate-500">
                  {asAdmin ? 'Administrator' : 'Staff'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAsAdmin((v) => !v)
                  setError('')
                  setNotice('')
                }}
                className="mt-1.5 text-sm font-medium text-indigo-700 underline-offset-2 hover:underline"
              >
                {asAdmin ? 'Back to staff sign-in' : 'Sign in as an administrator'}
              </button>

              <h1 className="font-display mt-6 text-base text-slate-900 md:hidden">Lekha-Jokha</h1>
            </div>

            {notice && <SuccessNote message={notice} />}
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

            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>

            {!asAdmin && (
              <p className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setShowRegister(true)
                    setError('')
                    setNotice('')
                  }}
                  className="font-medium text-indigo-700 underline-offset-2 hover:underline"
                >
                  Create account
                </button>
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

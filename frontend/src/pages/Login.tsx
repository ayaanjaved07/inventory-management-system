import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/lib/auth'
import { WrongDoorError } from '@/lib/errors'
import { apiError } from '@/lib/api'
import { Button, ErrorNote, Field, Input, Spinner } from '@/components/ui'

export default function Login() {
  const { t } = useTranslation()
  const { user, login, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Two doors into the same API. This is a wayfinding device, not a security
  // boundary -- the backend role map is the authority on what an account may do.
  const [asAdmin, setAsAdmin] = useState(false)

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
      if (err instanceof WrongDoorError) {
        setError(err.door === 'admin' ? t('auth.useAdminSignIn') : t('auth.notAdmin'))
        return
      }
      // Show the server's message when it is useful, otherwise a generic one --
      // never leak whether the username exists.
      const detail = apiError(err)
      setError(detail.includes('detail:') ? t('auth.failed') : detail || t('auth.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ruled-paper flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      {/* Cover on the left, page on the right, bound down the lac-red edge --
          the same book the rest of the app is styled as. */}
      <div className="grid w-full max-w-3xl border border-l-[3px] border-slate-200 border-l-red-700 bg-white md:grid-cols-[1fr_1.15fr]">
        <div className="hidden flex-col justify-center bg-teal-900 p-8 text-white md:flex">
          <h1 className="font-display text-3xl">{t('app.name')}</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-6 sm:p-8">
          <div className="mb-6">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <h2 className="text-xl font-semibold text-slate-900">{t('auth.signIn')}</h2>
              <span className="text-sm font-medium text-slate-500">
                {asAdmin ? t('auth.admin') : t('auth.staff')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setAsAdmin((v) => !v)
                setError('')
              }}
              className="mt-1.5 text-sm font-medium text-teal-700 underline-offset-2 hover:underline"
            >
              {asAdmin ? t('auth.toStaff') : t('auth.toAdmin')}
            </button>

            <h1 className="font-display mt-6 text-base text-slate-900 md:hidden">{t('app.name')}</h1>
          </div>

          {error && <ErrorNote message={error} />}

          <Field label={t('auth.username')}>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>

          <Field label={t('auth.password')}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </form>
      </div>
    </div>
  )
}

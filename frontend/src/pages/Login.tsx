import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/lib/auth'
import { apiError } from '@/lib/api'
import { Button, ErrorNote, Field, Input, Spinner } from '@/components/ui'

export default function Login() {
  const { t } = useTranslation()
  const { user, login, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      await login(username, password)
    } catch (err) {
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
      <div className="w-full max-w-sm">
        {/* The lac-red margin rule down the binding edge is the one flourish on
            this screen; everything else stays quiet. */}
        <form
          onSubmit={onSubmit}
          className="space-y-4 border border-l-[3px] border-slate-200 border-l-red-700 bg-white p-6"
        >
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-slate-900">{t('app.name')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('auth.tagline')}</p>
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

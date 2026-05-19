import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { authenticateAdmin, isAdminAuthenticated } from '../lib/auth'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAdminAuthenticated()) {
    return <Navigate to="/admin" replace />
  }

  const redirectPath = location.state?.from?.pathname ?? '/admin'

  function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)

    const isValid = authenticateAdmin(password)

    if (!isValid) {
      setError('Incorrect password. Please try again.')
      setIsSubmitting(false)
      return
    }

    setError('')
    navigate(redirectPath, { replace: true })
  }

  return (
    <div className="shell py-8 sm:py-10">
      <section className="login-shell relative overflow-hidden rounded-[32px] border border-brand-ink/10 px-6 py-8 sm:px-8 sm:py-10 lg:px-12">
        <div className="login-orb login-orb-left" />
        <div className="login-orb login-orb-right" />

        <div className="relative grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex rounded-full border border-white/60 bg-white/75 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-brand-accent">
              Admin
            </div>
            <div>
              <p className="text-kicker">Dashboard</p>
              <h1 className="mt-4 max-w-xl font-display text-4xl font-bold tracking-tight text-brand-ink sm:text-5xl">
                Admin login.
              </h1>
            </div>

            <Link className="button-secondary" to="/">
              Back to Home
            </Link>
          </div>

          <div className="glass-card login-card p-6 sm:p-8">
            <div className="max-w-md">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-muted">
                Sign in
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold text-brand-ink">
                Enter password
              </h2>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block text-sm font-semibold text-brand-ink">
                Admin password
                <input
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-[24px] border border-brand-ink/10 bg-white/90 px-4 py-3 outline-none transition focus:border-brand-accent"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  type="password"
                  value={password}
                />
              </label>

              {error ? (
                <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              <button className="button-primary w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Checking...' : 'Enter'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}

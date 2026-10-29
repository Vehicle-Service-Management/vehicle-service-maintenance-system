import { useState, type FormEvent } from 'react'
import { ApiError, login } from '../lib/api'
import { useSession } from './useSession'

export function DevSignIn() {
  const { setSession } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      setSession(await login(email.trim(), password))
    } catch (loginError) {
      setError(loginError instanceof ApiError
        ? loginError.message
        : 'Could not reach the API. Check that the backend is running.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="dev-sign-in" aria-labelledby="dev-sign-in-title">
      <div>
        <p className="dev-sign-in__eyebrow">LOCAL DEVELOPMENT ONLY</p>
        <h2 id="dev-sign-in-title">Preview the service workflows</h2>
        <p>Sign in with an existing account. This calls the real API login and uses its bearer token; server role and ownership checks still apply.</p>
      </div>
      <form className="dev-sign-in__form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Account email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in for local preview'}
        </button>
      </form>
    </section>
  )
}

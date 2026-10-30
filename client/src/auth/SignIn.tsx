import { useState, type FormEvent } from 'react'
import { ApiError, login } from '../lib/api'
import { useSession } from './useSession'

export function SignIn() {
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
    <section className="sign-in" aria-labelledby="sign-in-title">
      <div>
        <p className="sign-in__eyebrow">SERVICE CENTRE ACCOUNT</p>
        <h2 id="sign-in-title">Sign in to your workspace</h2>
        <p>Use your service-centre account to securely access the features available to your role.</p>
      </div>
      <form className="sign-in__form" onSubmit={(event) => void submit(event)}>
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
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}

import { useState, type FormEvent } from 'react'
import { ApiError, login, registerCustomer } from '../lib/api'
import { useSession } from './useSession'

export function SignIn() {
  const { setSession } = useSession()
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const session = mode === 'register'
        ? await registerCustomer({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            ...(address.trim() ? { address: address.trim() } : {}),
            password,
          })
        : await login(email.trim(), password)
      setSession(session)
    } catch (loginError) {
      setError(loginError instanceof ApiError
        ? loginError.message
        : 'Could not reach the API. Check that the backend is running.')
    } finally {
      setSubmitting(false)
    }
  }

  const registering = mode === 'register'

  return (
    <section className="sign-in" aria-labelledby="sign-in-title">
      <div>
        <p className="sign-in__eyebrow">SERVICE CENTRE ACCOUNT</p>
        <h2 id="sign-in-title">{registering ? 'Create your customer account' : 'Sign in to your workspace'}</h2>
        <p>{registering
          ? 'Use the same name and email you gave the service centre to link an existing profile, or create a new one. Staff can add vehicles to your profile.'
          : 'Use your service-centre account to securely access the features available to your role.'}</p>
      </div>
      <form className="sign-in__form" onSubmit={(event) => void submit(event)}>
        {registering && (
          <>
            <label className="field">
              <span>Full name</span>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={100} required />
            </label>
            <label className="field">
              <span>Phone</span>
              <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" minLength={7} maxLength={20} required />
            </label>
            <label className="field">
              <span>Address <small>Optional</small></span>
              <input type="text" value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" maxLength={250} />
            </label>
          </>
        )}
        <label className="field">
          <span>Account email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : undefined} required />
        </label>
        {registering && (
          <label className="field">
            <span>Confirm password</span>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required />
          </label>
        )}
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting
            ? registering ? 'Creating account…' : 'Signing in…'
            : registering ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="sign-in__switch">
        {registering ? 'Already registered?' : 'New customer?'}{' '}
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setError('')
            setMode(registering ? 'sign-in' : 'register')
          }}
        >
          {registering ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </section>
  )
}

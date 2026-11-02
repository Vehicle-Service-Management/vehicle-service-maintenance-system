import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthSession } from '../lib/api'
import { setUnauthorizedHandler } from '../lib/api'
import { SessionContext } from './session-context'
import { useEffect as useEffectHook } from 'react'
import { getTokenExpiryTime } from '../lib/api'

const SESSION_STORAGE_KEY = 'vsmms.auth-session'

function readStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null

  try {
    const saved = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!saved) return null
    const session = JSON.parse(saved) as AuthSession
    const expiry = getTokenExpiryTime(session.accessToken)
    if (!session.user || !expiry || expiry <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return session
  } catch {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readStoredSession)
  useEffectHook(() => {
    if (!session) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
      return
    }

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    const expiry = getTokenExpiryTime(session.accessToken)
    if (!expiry || expiry <= Date.now()) {
      setSession(null)
      return
    }

    const timer = window.setTimeout(() => setSession(null), expiry - Date.now())
    return () => window.clearTimeout(timer)
  }, [session])
  const clearSession = useCallback(() => setSession(null), [])
  const value = useMemo(
    () => ({ session, setSession, clearSession }),
    [session, clearSession],
  )

  useEffect(() => {
    setUnauthorizedHandler(clearSession)
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

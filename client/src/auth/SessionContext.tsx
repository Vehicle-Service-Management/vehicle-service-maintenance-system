import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SESSION_EXPIRED_EVENT, type AuthSession } from '../lib/api'
import { SessionContext } from './session-context'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  useEffect(() => {
    const expireSession = () => setSession(null)
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession)
  }, [])
  const value = useMemo(
    () => ({ session, setSession, clearSession: () => setSession(null) }),
    [session],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

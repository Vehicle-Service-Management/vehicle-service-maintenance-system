import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthSession } from '../lib/api'
import { setUnauthorizedHandler } from '../lib/api'
import { SessionContext } from './session-context'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
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

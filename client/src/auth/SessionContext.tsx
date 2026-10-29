import { useMemo, useState, type ReactNode } from 'react'
import type { AuthSession } from '../lib/api'
import { SessionContext } from './session-context'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const value = useMemo(
    () => ({ session, setSession, clearSession: () => setSession(null) }),
    [session],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

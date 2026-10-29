import { createContext } from 'react'
import type { AuthSession } from '../lib/api'

export interface SessionContextValue {
  session: AuthSession | null
  setSession: (session: AuthSession) => void
  clearSession: () => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

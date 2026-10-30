export type UserRole = 'Customer' | 'Service Advisor' | 'Service Technician' | 'Administrator'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: UserRole
}

export interface AuthSession {
  accessToken: string
  user: AuthUser
}

export interface Vehicle {
  id: string
  customerId: string
  registrationNumber: string
  make: string
  model: string
  year: number
}

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
}

export interface ServiceRequest {
  id: string
  vehicleId: string | null
  customerId: string | null
  serviceType: string | null
  description: string
  status: string
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

export class ApiError extends Error {
  public readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export const SESSION_EXPIRED_EVENT = 'vsmms:session-expired'

interface ApiErrorPayload {
  error?: string
  details?: Array<{ path?: string[]; message?: string }>
}

export async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers })
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    const errorPayload = payload as ApiErrorPayload | null
    const details = errorPayload?.details
      ?.map((detail) => detail.message)
      .filter((message): message is string => Boolean(message))
    const message = [errorPayload?.error ?? `Request failed (${response.status})`, ...(details ?? [])]
      .join(': ')
    throw new ApiError(message, response.status)
  }

  return payload as T
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const payload = await response.json().catch(() => null) as {
    accessToken?: string
    user?: AuthUser
    error?: string
  } | null

  if (!response.ok || !payload?.accessToken || !payload.user) {
    throw new ApiError(payload?.error ?? `Login failed (${response.status})`, response.status)
  }

  return { accessToken: payload.accessToken, user: payload.user }
}

export async function checkApiHealth(): Promise<boolean> {
  const response = await fetch('/health', {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) return false

  const payload: unknown = await response.json()
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'status' in payload &&
    payload.status === 'ok'
  )
}

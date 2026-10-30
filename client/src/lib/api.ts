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

export interface CustomerRegistration {
  name: string
  email: string
  phone: string
  address?: string
  password: string
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
  address: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ServiceRequest {
  id: string
  vehicleId: string | null
  customerId: string | null
  serviceType: string | null
  description: string
  status: string
  rejectionReason: string | null
  workPerformed?: string
  notes?: string
  completedAt?: string | null
  assignedTo?: string | null
  assignedTechnicianName?: string | null
  assignedTechnicianEmail?: string | null
  assignedBy?: string | null
  assigningStaffName?: string | null
  assigningStaffEmail?: string | null
  assignedAt?: string | null
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

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

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
    if (response.status === 401) {
      unauthorizedHandler?.()
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

export async function registerCustomer(input: CustomerRegistration): Promise<AuthSession> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await response.json().catch(() => null) as {
    accessToken?: string
    user?: AuthUser
    error?: string
  } | null

  if (!response.ok || !payload?.accessToken || !payload.user) {
    throw new ApiError(payload?.error ?? `Registration failed (${response.status})`, response.status)
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

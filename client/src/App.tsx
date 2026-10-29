import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { DevSignIn } from './auth/DevSignIn'
import { useSession } from './auth/useSession'
import { CustomerManagement } from './features/customers/CustomerManagement'
import { VehicleManagement } from './features/vehicles/VehicleManagement'
import { CustomerRequestList } from './features/services/CustomerRequestList'
import { ServiceOverview } from './features/services/ServiceOverview'
import { ServiceRequestForm } from './features/services/ServiceRequestForm'
import { ServiceReviewQueue } from './features/services/ServiceReviewQueue'
import { checkApiHealth } from './lib/api'
import './App.css'

type ConnectionState = 'checking' | 'connected' | 'unavailable'

type WorkspaceView =
  | 'overview'
  | 'create'
  | 'requests'
  | 'review'
  | 'customers'
  | 'vehicles'

const pageTitles: Record<WorkspaceView, { eyebrow: string; title: string }> = {
  overview: { eyebrow: 'WORKSPACE', title: 'Overview' },
  create: { eyebrow: 'SERVICE INTAKE', title: 'New service request' },
  requests: { eyebrow: 'CUSTOMER PORTAL', title: 'My service requests' },
  review: { eyebrow: 'SERVICE OPERATIONS', title: 'Request review' },
  customers: { eyebrow: 'CUSTOMER MANAGEMENT', title: 'Customers' },
  vehicles: { eyebrow: 'VEHICLE MANAGEMENT', title: 'Vehicles' },
}

async function getConnectionState(): Promise<
  Exclude<ConnectionState, 'checking'>
> {
  try {
    return (await checkApiHealth()) ? 'connected' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="VSMMS home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M5 19.5h22l-2.1-6.2a3 3 0 0 0-2.8-2H9.9a3 3 0 0 0-2.8 2L5 19.5Z" />
          <path d="M4 19.5v5h3m21-5v5h-3M8 24.5h16M9 15h14M10 11.3l1.1 4M22 11.3l-1.1 4" />
          <circle cx="9" cy="21.5" r="1" />
          <circle cx="23" cy="21.5" r="1" />
        </svg>
      </span>

      <span className="brand-copy">
        <strong>VSMMS</strong>
        <span>Vehicle service &amp; maintenance</span>
      </span>
    </a>
  )
}

export default function App({
  signedOutContent,
}: {
  signedOutContent?: ReactNode
}) {
  const { session, clearSession } = useSession()

  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [selectedView, setSelectedView] = useState<WorkspaceView | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const refreshConnection = useCallback(async () => {
    setConnection('checking')
    setConnection(await getConnectionState())
  }, [])

  useEffect(() => {
    let active = true

    void getConnectionState().then((state) => {
      if (active) {
        setConnection(state)
      }
    })

    return () => {
      active = false
    }
  }, [])

  const role = session?.user.role
  const isCustomer = role === 'Customer'
  const isAdvisor =
    role === 'Service Advisor' || role === 'Administrator'
  const isTechnician = role === 'Service Technician'

  const view = selectedView ?? 'overview'
  const page = pageTitles[view]

  function navigate(next: WorkspaceView) {
    setSelectedView(next)
    setMobileNavOpen(false)
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-screen__top">
          <Brand />

          {connection !== 'connected' && (
            <div className="connection-tools">
              <span
                className={`connection connection--${connection}`}
                role="status"
              >
                <i className="connection-dot" />
                {connection === 'checking'
                  ? 'Connecting to API'
                  : 'API unavailable'}
              </span>

              <button
                className="connection-retry"
                type="button"
                onClick={() => void refreshConnection()}
                disabled={connection === 'checking'}
                aria-label="Check API connection again"
              >
                ↻
              </button>
            </div>
          )}
        </div>

        <main className="auth-screen__content">
          <section className="auth-intro">
            <p className="eyebrow">
              <span /> VEHICLE SERVICE OPERATIONS
            </p>

            <h1>
              Every vehicle.
              <br />
              Every visit.
              <br />
              <em>One clear record.</em>
            </h1>

            <p>
              Manage service requests from the first customer report through
              advisor review and workshop handoff.
            </p>

            <div className="auth-workflow" aria-label="Service workflow">
              <span>
                <b>01</b> Request
              </span>
              <i />
              <span>
                <b>02</b> Review
              </span>
              <i />
              <span>
                <b>03</b> Service
              </span>
            </div>
          </section>

          <div className="auth-screen__form">
            {signedOutContent ??
              (import.meta.env.DEV ? (
                <DevSignIn />
              ) : (
                <div className="auth-production-note">
                  <h2>Sign in to continue</h2>
                  <p>
                    Use your service-centre account to open the workspace.
                  </p>
                </div>
              ))}
          </div>
        </main>

        <footer className="auth-screen__footer">
          <span>VSMMS · VEHICLE SERVICE &amp; MAINTENANCE</span>
          <span>REQUEST INTAKE · ADVISOR REVIEW · WORKSHOP CARE</span>
        </footer>
      </div>
    )
  }

  if (isTechnician) {
    return (
      <div className="app-shell app-shell--workspace">
        <header className="workspace-topbar workspace-topbar--solo">
          <Brand />

          <div className="workspace-user">
            <span>
              <strong>{session.user.displayName}</strong>
              <small>{role}</small>
            </span>

            <button
              className="button button--quiet"
              type="button"
              onClick={() => {
                clearSession()
                setSelectedView(null)
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="workspace-main">
          <div className="panel role-placeholder">
            <p className="eyebrow">
              <span /> TECHNICIAN WORKSPACE
            </p>

            <h2>Assigned service work</h2>

            <p>
              The technician assignment and service execution screens belong
              to the related sprint tasks and will connect here.
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell app-shell--workspace">
      <aside
        className={`sidebar${mobileNavOpen ? ' sidebar--open' : ''}`}
      >
        <div className="sidebar__brand">
          <Brand />

          <button
            className="sidebar__close"
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        <div className="sidebar__label">SERVICE CENTRE</div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <button
            className={view === 'overview' ? 'is-active' : ''}
            type="button"
            onClick={() => navigate('overview')}
          >
            <span className="nav-icon">⌂</span>
            Overview
          </button>

          {isCustomer && (
            <>
              <div className="sidebar__label sidebar__label--spaced">
                MY SERVICE
              </div>

              <button
                className={view === 'create' ? 'is-active' : ''}
                type="button"
                onClick={() => navigate('create')}
              >
                <span className="nav-icon">＋</span>
                New request
              </button>

              <button
                className={view === 'requests' ? 'is-active' : ''}
                type="button"
                onClick={() => navigate('requests')}
              >
                <span className="nav-icon">▤</span>
                My requests
              </button>
            </>
          )}

          {isAdvisor && (
            <>
              <div className="sidebar__label sidebar__label--spaced">
                REQUESTS
              </div>

              <button
                className={view === 'review' ? 'is-active' : ''}
                type="button"
                onClick={() => navigate('review')}
              >
                <span className="nav-icon">▤</span>
                Review queue
              </button>

              <button
                className={view === 'create' ? 'is-active' : ''}
                type="button"
                onClick={() => navigate('create')}
              >
                <span className="nav-icon">＋</span>
                Create for customer
              </button>

              <div className="sidebar__label sidebar__label--spaced">
                MANAGEMENT
              </div>

              <button
                className={view === 'customers' ? 'is-active' : ''}
                type="button"
                onClick={() => navigate('customers')}
              >
                <span className="nav-icon">♙</span>
                Customers
              </button>

              <button
                className={view === 'vehicles' ? 'is-active' : ''}
                type="button"
                onClick={() => navigate('vehicles')}
              >
                <span className="nav-icon">▣</span>
                Vehicles
              </button>
            </>
          )}
        </nav>
      </aside>

      {mobileNavOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      <div className="workspace-frame">
        <header className="workspace-topbar">
          <button
            className="mobile-menu"
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>

          <div className="workspace-heading">
            <p>{page.eyebrow}</p>
            <h1>{page.title}</h1>
          </div>

          <div className="workspace-topbar__actions">
            {connection !== 'connected' && (
              <div className="connection-tools">
                <span
                  className={`connection connection--${connection}`}
                  role="status"
                >
                  <i className="connection-dot" />
                  {connection === 'checking'
                    ? 'Connecting'
                    : 'API unavailable'}
                </span>

                <button
                  className="connection-retry"
                  type="button"
                  onClick={() => void refreshConnection()}
                  disabled={connection === 'checking'}
                  aria-label="Check API connection again"
                >
                  ↻
                </button>
              </div>
            )}

            <div className="workspace-user">
              <span className="workspace-user__avatar" aria-hidden="true">
                {session.user.displayName.slice(0, 1).toUpperCase()}
              </span>

              <span>
                <strong>{session.user.displayName}</strong>
                <small>{role}</small>
              </span>
            </div>

            <button
              className="button button--quiet workspace-signout"
              type="button"
              onClick={() => {
                clearSession()
                setSelectedView(null)
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="workspace-main">
          {view === 'overview' && (
            <ServiceOverview session={session} onNavigate={navigate} />
          )}

          {isCustomer && view === 'create' && (
            <ServiceRequestForm
              session={session}
              onSaved={() => navigate('requests')}
            />
          )}

          {isCustomer && view === 'requests' && (
            <CustomerRequestList session={session} />
          )}

          {isAdvisor && view === 'review' && (
            <ServiceReviewQueue session={session} />
          )}

          {isAdvisor && view === 'create' && (
            <ServiceRequestForm
              session={session}
              onSaved={() => navigate('review')}
            />
          )}

          {isAdvisor && view === 'customers' && (
            <CustomerManagement session={session} />
          )}

          {isAdvisor && view === 'vehicles' && (
            <VehicleManagement session={session} />
          )}
        </main>

        <footer className="workspace-footer">
          <span>VSMMS · SERVICE OPERATIONS</span>
          <span>INTAKE → REVIEW → WORKSHOP</span>
        </footer>
      </div>
    </div>
  )
}
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSession } from './auth/useSession'
import { CustomerRequestList } from './features/services/CustomerRequestList'
import { ServiceRequestForm } from './features/services/ServiceRequestForm'
import { ServiceReviewQueue } from './features/services/ServiceReviewQueue'
import { checkApiHealth } from './lib/api'
import './App.css'

type ConnectionState = 'checking' | 'connected' | 'unavailable'
type WorkspaceView = 'create' | 'requests' | 'review'

async function getConnectionState(): Promise<Exclude<ConnectionState, 'checking'>> {
  try {
    return (await checkApiHealth()) ? 'connected' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

export default function App({ signedOutContent }: { signedOutContent?: ReactNode }) {
  const { session, clearSession } = useSession()
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [selectedView, setSelectedView] = useState<WorkspaceView | null>(null)

  const refreshConnection = useCallback(async () => {
    setConnection('checking')
    setConnection(await getConnectionState())
  }, [])

  useEffect(() => {
    let active = true
    void getConnectionState().then((state) => { if (active) setConnection(state) })
    return () => { active = false }
  }, [])

  const isCustomer = session?.user.role === 'Customer'
  const isAdvisor = session?.user.role === 'Service Advisor' || session?.user.role === 'Administrator'
  const view = selectedView ?? (isAdvisor ? 'review' : 'create')
  const connectionLabel = {
    checking: 'Checking connection',
    connected: 'API connected',
    unavailable: 'API unavailable',
  }[connection]

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="VSMMS home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M5 19.5h22l-2.1-6.2a3 3 0 0 0-2.8-2H9.9a3 3 0 0 0-2.8 2L5 19.5Z" />
              <path d="M4 19.5v5h3m21-5v5h-3M8 24.5h16M9 15h14M10 11.3l1.1 4M22 11.3l-1.1 4" />
              <circle cx="9" cy="21.5" r="1" /><circle cx="23" cy="21.5" r="1" />
            </svg>
          </span>
          <span className="brand-copy"><strong>VSMMS</strong><span>Vehicle service &amp; maintenance</span></span>
        </a>

        {session ? (
          <div className="account-menu">
            <div className="account-copy"><strong>{session.user.displayName}</strong><span>{session.user.role}</span></div>
            <button className="button button--quiet" type="button" onClick={() => { clearSession(); setSelectedView(null) }}>Sign out</button>
          </div>
        ) : (
          <div className={`connection connection--${connection}`} role="status" aria-live="polite">
            <span className="connection-dot" aria-hidden="true" /><span>{connectionLabel}</span>
            <button className="refresh-button" type="button" onClick={() => void refreshConnection()} disabled={connection === 'checking'} aria-label="Check API connection again" title="Check API connection again">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16.2 8A6.5 6.5 0 0 0 5 4.5L3.5 6M3.5 6V2.8M3.5 6h3.2M3.8 12A6.5 6.5 0 0 0 15 15.5l1.5-1.5m0 0v3.2m0-3.2h-3.2" /></svg>
            </button>
          </div>
        )}
      </header>

      {session && (
        <nav className="workspace-nav" aria-label="Service workspace">
          {isCustomer && <>
            <button className={view === 'create' ? 'is-active' : ''} type="button" onClick={() => setSelectedView('create')}>New request</button>
            <button className={view === 'requests' ? 'is-active' : ''} type="button" onClick={() => setSelectedView('requests')}>My requests</button>
          </>}
          {isAdvisor && <>
            <button className={view === 'review' ? 'is-active' : ''} type="button" onClick={() => setSelectedView('review')}>Review queue</button>
            <button className={view === 'create' ? 'is-active' : ''} type="button" onClick={() => setSelectedView('create')}>Create for customer</button>
          </>}
        </nav>
      )}

      <main className={session ? 'workspace-main' : ''}>
        {session && isCustomer && view === 'create' && <ServiceRequestForm session={session} onSaved={() => setSelectedView('requests')} />}
        {session && isCustomer && view === 'requests' && <CustomerRequestList session={session} />}
        {session && isAdvisor && view === 'review' && <ServiceReviewQueue session={session} />}
        {session && isAdvisor && view === 'create' && <ServiceRequestForm session={session} onSaved={() => setSelectedView('review')} />}
        {session && !isCustomer && !isAdvisor && (
          <div className="empty-state role-placeholder"><h2>Technician workspace</h2><p>Service execution and assigned-work screens will connect here when that sprint feature is implemented.</p></div>
        )}

        {!session && (
          <>
            <section className="welcome" aria-labelledby="welcome-title">
              <div className="welcome-copy">
                <p className="eyebrow"><span /> SERVICE OPERATIONS</p>
                <h1 id="welcome-title">Every service visit starts with a clear next step.</h1>
                <p className="welcome-description">A shared workspace for the people who look after vehicles, service requests, and the work that brings them back to the road.</p>
                {signedOutContent ? (
                  <div className="signed-out-slot">{signedOutContent}</div>
                ) : (
                  <div className="signed-out-note">
                    <strong>Sign-in is the next integration point</strong>
                    <span>Once the login screen supplies a bearer-token session, your request and advisor workspaces are ready here.</span>
                  </div>
                )}
              </div>
              <aside className="welcome-art" aria-label="Service operations workspace illustration">
                <div className="orbit orbit--outer" /><div className="orbit orbit--inner" />
                <div className="art-label art-label--top"><span>01</span> REQUEST INTAKE</div>
                <div className="art-label art-label--bottom"><span>02</span> WORKSHOP CARE</div>
                <div className="vehicle-card">
                  <div className="vehicle-card__top">
                    <span className="vehicle-card__icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="m7 27 3-9a4 4 0 0 1 3.8-2.8h20.4A4 4 0 0 1 38 18l3 9v9h-5v-4H12v4H7v-9Z" /><path d="M11 26h26M15 20h18M14 29.5h.01M34 29.5h.01" /><circle cx="15" cy="29.5" r="2" /><circle cx="33" cy="29.5" r="2" /></svg></span>
                    <span className="vehicle-card__status"><i /> READY FOR SERVICE</span>
                  </div>
                  <div className="vehicle-card__line" /><div className="vehicle-card__caption">BUILT AROUND THE WORKFLOW</div>
                  <div className="vehicle-card__title">From request<br />to road again.</div>
                  <div className="vehicle-card__footer"><span>Customer</span><b /><span>Advisor</span><b /><span>Technician</span></div>
                </div>
                <div className="art-stamp" aria-hidden="true">V<br />S<br />M</div>
              </aside>
            </section>
            <section className="foundation" aria-label="Project information">
              <div className="foundation-heading"><span className="section-index">01 / 03</span><h2>One connected service journey</h2></div>
              <p>Customers submit requests for registered vehicles. Advisors review the request, validate complete details, or return it with feedback for correction.</p>
              <div className="foundation-meta"><span><i className="meta-mark" /> RESPONSIVE WEB CLIENT</span><span>REACT&nbsp; / &nbsp;TYPESCRIPT</span><span>API STATUS: {connection === 'connected' ? 'ONLINE' : connection === 'checking' ? 'CHECKING' : 'OFFLINE'}</span></div>
            </section>
          </>
        )}
      </main>

      <footer className="footer"><span>VEHICLE SERVICE &amp; MAINTENANCE MANAGEMENT SYSTEM</span><span>{session ? 'SERVICE WORKSPACE' : 'WORKSPACE FOUNDATION'}</span></footer>
    </div>
  )
}

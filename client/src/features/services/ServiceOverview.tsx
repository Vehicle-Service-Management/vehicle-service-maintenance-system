import { useEffect, useState } from 'react'
import { apiRequest, type AuthSession, type ServiceRequest, type Vehicle } from '../../lib/api'

type View = 'overview' | 'create' | 'requests' | 'review'

interface Props {
  session: AuthSession
  onNavigate: (view: View) => void
}

interface RequestPage {
  services: ServiceRequest[]
  total: number
}

export function ServiceOverview({ session, onNavigate }: Props) {
  const isCustomer = session.user.role === 'Customer'
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [counts, setCounts] = useState({ main: 0, secondary: 0, third: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadOverview() {
      try {
        if (isCustomer) {
          const [requestPage, vehiclePage, rejectedPage] = await Promise.all([
            apiRequest<RequestPage>('/api/services?limit=6', session.accessToken),
            apiRequest<{ vehicles: Vehicle[]; total: number }>('/api/me/vehicles', session.accessToken),
            apiRequest<RequestPage>('/api/services?status=rejected&limit=1', session.accessToken),
          ])
          if (!active) return
          setRequests(requestPage.services)
          setVehicles(vehiclePage.vehicles)
          setCounts({ main: vehiclePage.total, secondary: requestPage.total, third: rejectedPage.total })
        } else {
          const [recent, submitted, assigned, activeJobs] = await Promise.all([
            apiRequest<RequestPage>('/api/services?limit=6', session.accessToken),
            apiRequest<RequestPage>('/api/services?status=submitted&limit=1', session.accessToken),
            apiRequest<RequestPage>('/api/services?status=assigned&limit=1', session.accessToken),
            apiRequest<RequestPage>('/api/services?status=in_progress&limit=1', session.accessToken),
          ])
          if (!active) return
          setRequests(recent.services)
          setCounts({ main: submitted.total, secondary: assigned.total, third: activeJobs.total })
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your service overview.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadOverview()
    return () => { active = false }
  }, [isCustomer, session.accessToken])

  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))

  return (
    <div className="overview-page">
      <section className="overview-welcome">
        <div>
          <p className="eyebrow"><span /> {isCustomer ? 'CUSTOMER PORTAL' : 'SERVICE OPERATIONS'}</p>
          <h2>{isCustomer ? 'Good to see you' : 'Today at the service centre'}, {session.user.displayName.split(' ')[0]}.</h2>
          <p>{isCustomer
            ? 'Keep your vehicle details and service requests together in one place.'
            : 'Review incoming requests and keep the workshop moving.'}</p>
        </div>
        <button className="button button--primary" type="button" onClick={() => onNavigate(isCustomer ? 'create' : 'review')}>
          {isCustomer ? 'Create a request' : 'Open review queue'}
        </button>
      </section>

      {error && <p className="notice notice--error" role="alert">{error}</p>}

      <section className="metric-grid" aria-label="Service summary">
        <article className="metric-card metric-card--accent">
          <span>{isCustomer ? 'MY VEHICLES' : 'AWAITING REVIEW'}</span>
          <strong>{loading ? '—' : counts.main}</strong>
          <small>{isCustomer ? 'registered to your account' : 'submitted requests'}</small>
        </article>
        <article className="metric-card">
          <span>{isCustomer ? 'SERVICE REQUESTS' : 'ASSIGNED WORK'}</span>
          <strong>{loading ? '—' : counts.secondary}</strong>
          <small>{isCustomer ? 'all request statuses' : 'ready for technicians'}</small>
        </article>
        <article className="metric-card">
          <span>{isCustomer ? 'NEEDS YOUR ATTENTION' : 'IN PROGRESS'}</span>
          <strong>{loading ? '—' : counts.third}</strong>
          <small>{isCustomer ? 'returned for correction' : 'currently in the workshop'}</small>
        </article>
      </section>

      <section className="overview-lower">
        <div className="overview-list panel">
          <div className="overview-section-heading">
            <div><p className="eyebrow"><span /> WORKFLOW</p><h3>{isCustomer ? 'Recent service requests' : 'Recently updated requests'}</h3></div>
            <button className="text-button" type="button" onClick={() => onNavigate(isCustomer ? 'requests' : 'review')}>
              {isCustomer ? 'View all' : 'Review queue'} <span aria-hidden="true">→</span>
            </button>
          </div>
          {loading ? <p className="state-message" role="status">Loading service activity…</p> : requests.length === 0 ? (
            <div className="empty-state"><h3>{isCustomer ? 'No requests yet' : 'No service activity yet'}</h3><p>{isCustomer ? 'Create a request when your vehicle needs attention.' : 'Submitted requests will appear here as customers contact the service centre.'}</p></div>
          ) : (
            <div className="overview-request-list">
              {requests.map((request) => {
                const vehicle = request.vehicleId ? vehiclesById.get(request.vehicleId) : undefined
                return (
                  <article className="overview-request" key={request.id}>
                    <span className="overview-request__icon" aria-hidden="true">{isCustomer ? '↗' : 'SR'}</span>
                    <div className="overview-request__copy">
                      <strong>{request.serviceType || 'Service request'}</strong>
                      <span>{isCustomer && vehicle ? `${vehicle.registrationNumber} · ${vehicle.make} ${vehicle.model}` : `Request ${request.id.slice(0, 8)}`}</span>
                    </div>
                    <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString()}</time>
                    <span className={`status-pill status-pill--${request.status}`}>{request.status.replaceAll('_', ' ')}</span>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <aside className="overview-side panel">
          <p className="eyebrow"><span /> {isCustomer ? 'YOUR GARAGE' : 'SERVICE FLOW'}</p>
          <h3>{isCustomer ? 'Registered vehicles' : 'Request to road-ready'}</h3>
          {isCustomer ? (
            loading ? <p className="side-note">Loading linked vehicles…</p> : vehicles.length === 0 ? (
              <p className="side-note">No vehicle is linked to this customer account yet. Ask an advisor to register it.</p>
            ) : (
              <ul className="vehicle-mini-list">
                {vehicles.slice(0, 4).map((vehicle) => (
                  <li key={vehicle.id}><span className="vehicle-mini-list__mark" aria-hidden="true">V</span><span><strong>{vehicle.registrationNumber}</strong><small>{vehicle.year} {vehicle.make} {vehicle.model}</small></span></li>
                ))}
              </ul>
            )
          ) : (
            <ol className="workflow-steps">
              <li className="workflow-steps__current"><span>01</span><div><strong>Request received</strong><small>Review details and vehicle</small></div></li>
              <li><span>02</span><div><strong>Validate request</strong><small>Confirm required information</small></div></li>
              <li><span>03</span><div><strong>Assign and service</strong><small>Continue through workshop flow</small></div></li>
            </ol>
          )}
          {isCustomer && <button className="button button--secondary side-action" type="button" onClick={() => onNavigate('create')}>Request vehicle service</button>}
        </aside>
      </section>
    </div>
  )
}

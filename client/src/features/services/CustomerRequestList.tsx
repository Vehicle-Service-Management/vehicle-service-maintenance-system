import { useCallback, useEffect, useState } from 'react'
import { apiRequest, type AuthSession, type ServiceRequest, type Vehicle } from '../../lib/api'
import { ServiceRequestForm } from './ServiceRequestForm'

export function CustomerRequestList({ session }: { session: AuthSession }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [editing, setEditing] = useState<ServiceRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(() => Promise.all([
        apiRequest<{ services: ServiceRequest[] }>('/api/services?limit=100', session.accessToken),
        apiRequest<{ vehicles: Vehicle[] }>('/api/me/vehicles', session.accessToken),
      ]), [session.accessToken])

  const refresh = useCallback(async () => {
    try {
      const [requestResult, vehicleResult] = await loadData()
      setRequests(requestResult.services)
      setVehicles(vehicleResult.vehicles)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your requests.')
    } finally {
      setLoading(false)
    }
  }, [loadData])

  useEffect(() => {
    let active = true
    void loadData().then(([requestResult, vehicleResult]) => {
      if (!active) return
      setRequests(requestResult.services)
      setVehicles(vehicleResult.vehicles)
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your requests.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [loadData])

  if (editing) {
    return (
      <ServiceRequestForm
        session={session}
        request={editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void refresh()
        }}
      />
    )
  }

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))

  return (
    <section className="panel" aria-labelledby="my-requests-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow"><span /> YOUR SERVICE REQUESTS</p>
          <h2 id="my-requests-title">Request history</h2>
          <p className="panel-intro">Track advisor review and correct a request if it is returned to you.</p>
        </div>
        <button className="button button--quiet" type="button" onClick={() => { setError(''); setLoading(true); void refresh() }} disabled={loading}>Refresh</button>
      </div>

      {error && <p className="notice notice--error" role="alert">{error}</p>}
      {loading ? <p className="state-message" role="status">Loading your requests…</p> : requests.length === 0 ? (
        <div className="empty-state"><h3>No service requests yet</h3><p>Your submitted requests will appear here.</p></div>
      ) : (
        <div className="request-list">
          {requests.map((request) => {
            const vehicle = request.vehicleId ? vehicleById.get(request.vehicleId) : undefined
            return (
              <article className="request-card" key={request.id}>
                <div className="request-card__top">
                  <div>
                    <p className="request-card__eyebrow">{vehicle ? `${vehicle.registrationNumber} · ${vehicle.make} ${vehicle.model}` : 'Vehicle details unavailable'}</p>
                    <h3>{request.serviceType || 'Service request'}</h3>
                  </div>
                  <span className={`status-pill status-pill--${request.status}`}>{request.status.replaceAll('_', ' ')}</span>
                </div>
                <p className="request-card__description">{request.description || 'No description was provided.'}</p>
                {request.rejectionReason && <p className="notice notice--error"><strong>Advisor feedback:</strong> {request.rejectionReason}</p>}
                <div className="request-card__footer">
                  <span>Submitted {new Date(request.createdAt).toLocaleDateString()}</span>
                  {request.status === 'rejected' && (
                    <button className="button button--secondary" type="button" onClick={() => setEditing(request)}>Correct and resubmit</button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

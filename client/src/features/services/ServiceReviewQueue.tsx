import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiRequest, type AuthSession, type Customer, type ServiceRequest, type Vehicle } from '../../lib/api'

interface ReviewDetail {
  service: ServiceRequest
  vehicle: Vehicle | null
  customer: Customer | null
}

async function lookupOptional<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export function ServiceReviewQueue({ session }: { session: AuthSession }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [selected, setSelected] = useState<ReviewDetail | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadData = useCallback(() => apiRequest<{ services: ServiceRequest[] }>(
    '/api/services?status=submitted&limit=100',
    session.accessToken,
  ), [session.accessToken])

  const refresh = useCallback(async () => {
    try {
      const result = await loadData()
      setRequests(result.services)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the review queue.')
    } finally {
      setLoading(false)
    }
  }, [loadData])

  useEffect(() => {
    let active = true
    void loadData().then((result) => {
      if (active) setRequests(result.services)
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load the review queue.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [loadData])

  async function openRequest(request: ServiceRequest) {
    setSelected(null)
    setRejecting(false)
    setReason('')
    setError('')
    setDetailLoading(true)
    try {
      const { service } = await apiRequest<{ service: ServiceRequest }>(
        `/api/services/${encodeURIComponent(request.id)}`,
        session.accessToken,
      )
      const [vehicleResult, customerResult] = await Promise.all([
        service.vehicleId
          ? lookupOptional(apiRequest<{ vehicle: Vehicle }>(`/api/vehicles/${encodeURIComponent(service.vehicleId)}`, session.accessToken))
          : Promise.resolve(null),
        service.customerId
          ? lookupOptional(apiRequest<{ customer: Customer }>(`/api/customers/${encodeURIComponent(service.customerId)}`, session.accessToken))
          : Promise.resolve(null),
      ])
      setSelected({
        service,
        vehicle: vehicleResult?.vehicle ?? null,
        customer: customerResult?.customer ?? null,
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load request details.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function decide(decision: 'validate' | 'reject') {
    if (!selected) return
    if (decision === 'reject' && !reason.trim()) {
      setError('Enter a reason so the customer knows what to correct.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const result = await apiRequest<{ service: ServiceRequest }>(
        `/api/services/${encodeURIComponent(selected.service.id)}/review`,
        session.accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify(decision === 'validate' ? { decision } : { decision, reason: reason.trim() }),
        },
      )
      setNotice(decision === 'validate' ? 'Request validated and ready for assignment.' : 'Request returned to the customer with your feedback.')
      setSelected(null)
      setRejecting(false)
      setReason('')
      setRequests((current) => current.filter((request) => request.id !== result.service.id))
      setLoading(true)
      await refresh()
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Could not save the review decision.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="review-queue-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow"><span /> ADVISOR WORKSPACE</p>
          <h2 id="review-queue-title">Service request review</h2>
          <p className="panel-intro">Check the linked customer, vehicle, service type and description before validating or returning a request.</p>
        </div>
        <button className="button button--quiet" type="button" onClick={() => { setError(''); setLoading(true); void refresh() }} disabled={loading}>Refresh queue</button>
      </div>

      {notice && <p className="notice notice--success" role="status">{notice}</p>}
      {error && <p className="notice notice--error" role="alert">{error}</p>}

      {detailLoading && <p className="state-message" role="status">Loading request details…</p>}

      {selected && (
        <article className="review-detail">
          <div className="review-detail__heading">
            <div>
              <p className="request-card__eyebrow">REQUEST {selected.service.id.slice(0, 8).toUpperCase()}</p>
              <h3>{selected.service.serviceType || 'Service type not provided'}</h3>
            </div>
            <button className="button button--quiet" type="button" onClick={() => { setSelected(null); setRejecting(false); setError('') }}>Close details</button>
          </div>
          <dl className="detail-grid">
            <div><dt>Customer</dt><dd>{selected.customer?.name ?? 'Customer record unavailable'}</dd></div>
            <div><dt>Contact</dt><dd>{selected.customer?.phone ?? 'Not available'}</dd></div>
            <div><dt>Vehicle</dt><dd>{selected.vehicle ? `${selected.vehicle.registrationNumber} · ${selected.vehicle.year} ${selected.vehicle.make} ${selected.vehicle.model}` : 'Registered vehicle unavailable'}</dd></div>
            <div><dt>Submitted</dt><dd>{new Date(selected.service.createdAt).toLocaleString()}</dd></div>
            <div className="detail-grid__wide"><dt>Requested work / reported issue</dt><dd>{selected.service.description || 'No description was provided.'}</dd></div>
          </dl>

          {rejecting ? (
            <div className="reject-panel">
              <label className="field">
                <span>Reason for returning this request</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} required autoFocus placeholder="Explain what information needs correction." />
              </label>
              <div className="form-actions">
                <button className="button button--quiet" type="button" onClick={() => { setRejecting(false); setReason(''); setError('') }}>Cancel</button>
                <button className="button button--danger" type="button" onClick={() => void decide('reject')} disabled={saving || !reason.trim()}>{saving ? 'Returning…' : 'Return with feedback'}</button>
              </div>
            </div>
          ) : (
            <div className="review-actions">
              <p>Validate only when the request has a registered vehicle, service type and a clear description.</p>
              <div>
                <button className="button button--secondary" type="button" onClick={() => setRejecting(true)} disabled={saving}>Return for correction</button>
                <button className="button button--primary" type="button" onClick={() => void decide('validate')} disabled={saving}>{saving ? 'Saving…' : 'Validate request'}</button>
              </div>
            </div>
          )}
        </article>
      )}

      <div className="queue-heading">
        <h3>Submitted requests <span>{requests.length}</span></h3>
      </div>
      {loading ? <p className="state-message" role="status">Loading submitted requests…</p> : requests.length === 0 ? (
        <div className="empty-state"><h3>The review queue is clear</h3><p>New service requests will appear here.</p></div>
      ) : (
        <div className="request-list">
          {requests.map((request) => (
            <article className="request-card" key={request.id}>
              <div className="request-card__top">
                <div>
                  <p className="request-card__eyebrow">Submitted {new Date(request.createdAt).toLocaleDateString()}</p>
                  <h3>{request.serviceType || 'Service type needs attention'}</h3>
                </div>
                <span className="status-pill status-pill--submitted">submitted</span>
              </div>
              <p className="request-card__description">{request.description || 'No description was provided.'}</p>
              <div className="request-card__footer">
                <span>Vehicle linked: {request.vehicleId ? 'Yes' : 'No'}</span>
                <button className="button button--secondary" type="button" onClick={() => void openRequest(request)}>Review request</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { AuthSession, ServiceRequest } from '../../lib/api'
import { ApiError, apiRequest } from '../../lib/api'

interface Technician {
  id: string
  email: string
  displayName: string
  activeAssignments: number
}

interface ServicePage {
  services: ServiceRequest[]
  total: number
}

interface TechnicianPage {
  technicians: Technician[]
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Could not reach the service API. Please try again.'
}

export function AssignmentQueue({ session }: { session: AuthSession }) {
  const [unassigned, setUnassigned] = useState<ServiceRequest[]>([])
  const [assigned, setAssigned] = useState<ServiceRequest[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [selectedTechnicians, setSelectedTechnicians] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [unassignedPage, assignedPage, technicianPage] = await Promise.all([
        apiRequest<ServicePage>('/api/services/awaiting-assignment?limit=100', session.accessToken),
        apiRequest<ServicePage>('/api/services/assigned?limit=100', session.accessToken),
        apiRequest<TechnicianPage>('/api/technicians?limit=100', session.accessToken),
      ])
      setUnassigned(unassignedPage.services)
      setAssigned(assignedPage.services)
      setTechnicians(technicianPage.technicians)
      setError('')
      setSelectedTechnicians((current) => {
        const next = { ...current }
        for (const service of unassignedPage.services) {
          if (!next[service.id] && technicianPage.technicians[0]) {
            next[service.id] = technicianPage.technicians[0].id
          }
        }
        return next
      })
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [session.accessToken])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  async function assign(service: ServiceRequest) {
    const technicianUserId = selectedTechnicians[service.id]
    if (!technicianUserId) return
    setSavingId(service.id)
    setError('')
    try {
      await apiRequest<{ service: ServiceRequest }>(
        `/api/services/${encodeURIComponent(service.id)}/assign`,
        session.accessToken,
        { method: 'POST', body: JSON.stringify({ technicianUserId }) },
      )
      await load()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSavingId('')
    }
  }

  return (
    <div className="operations-stack">
      <section className="panel operations-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow"><span /> WORKSHOP HANDOFF</p>
            <h2>Requests awaiting assignment</h2>
            <p className="panel-intro">Assign validated requests to an active service technician.</p>
          </div>
          <button className="button button--quiet" type="button" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        {loading ? <p className="empty-state">Loading service requests…</p> : unassigned.length === 0 ? (
          <p className="empty-state">No validated requests are waiting for assignment.</p>
        ) : (
          <div className="operations-list">
            {unassigned.map((service) => (
              <article className="operation-card" key={service.id}>
                <div className="operation-card__heading">
                  <div>
                    <span className="status-pill">{service.status}</span>
                    <h3>{service.serviceType || 'Service request'}</h3>
                  </div>
                  <small>Submitted {formatDate(service.createdAt)}</small>
                </div>
                <p>{service.description}</p>
                <div className="operation-card__actions">
                  <label className="field">
                    <span>Assign technician</span>
                    <select
                      value={selectedTechnicians[service.id] ?? ''}
                      onChange={(event) => setSelectedTechnicians((current) => ({
                        ...current,
                        [service.id]: event.target.value,
                      }))}
                      disabled={technicians.length === 0 || savingId === service.id}
                    >
                      {technicians.length === 0 && <option value="">No active technicians</option>}
                      {technicians.map((technician) => (
                        <option key={technician.id} value={technician.id}>
                          {technician.displayName} · {technician.activeAssignments} active
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={() => void assign(service)}
                    disabled={!selectedTechnicians[service.id] || savingId === service.id}
                  >
                    {savingId === service.id ? 'Assigning…' : 'Assign request'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel operations-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow"><span /> ACTIVE WORK</p>
            <h2>Current assignments</h2>
          </div>
        </div>
        {assigned.length === 0 ? (
          <p className="empty-state">There are no active assignments.</p>
        ) : (
          <div className="operations-list">
            {assigned.map((service) => (
              <article className="operation-card operation-card--compact" key={service.id}>
                <div>
                  <span className="status-pill">{service.status.replace(/_/g, ' ')}</span>
                  <h3>{service.serviceType || 'Service request'}</h3>
                  <p>{service.description}</p>
                </div>
                <dl className="operation-meta">
                  <div><dt>Technician</dt><dd>{service.assignedTechnicianName || service.assignedTechnicianEmail}</dd></div>
                  <div><dt>Assigned</dt><dd>{formatDate(service.assignedAt)}</dd></div>
                  <div><dt>Work recorded</dt><dd>{service.workPerformed || 'Not started'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ExecutionCard({
  service,
  session,
  onSaved,
}: {
  service: ServiceRequest
  session: AuthSession
  onSaved: () => void
}) {
  const [workPerformed, setWorkPerformed] = useState(service.workPerformed ?? '')
  const [notes, setNotes] = useState(service.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function update(status?: 'in_progress' | 'awaiting_parts' | 'completed') {
    setSaving(true)
    setError('')
    try {
      await apiRequest<{ service: ServiceRequest }>(
        `/api/services/${encodeURIComponent(service.id)}/execution`,
        session.accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify({ workPerformed, notes, ...(status ? { status } : {}) }),
        },
      )
      onSaved()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="operation-card">
      <div className="operation-card__heading">
        <div>
          <span className="status-pill">{service.status.replace(/_/g, ' ')}</span>
          <h3>{service.serviceType || 'Service request'}</h3>
        </div>
        <small>Assigned {formatDate(service.assignedAt)}</small>
      </div>
      <p>{service.description}</p>
      <label className="field">
        <span>Work performed <b aria-hidden="true">*</b></span>
        <textarea value={workPerformed} onChange={(event) => setWorkPerformed(event.target.value)} rows={3} maxLength={10000} />
      </label>
      <label className="field">
        <span>Service notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={5000} />
      </label>
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <div className="operation-card__buttons">
        <button className="button button--quiet" type="button" onClick={() => void update()} disabled={saving}>
          Save work
        </button>
        {service.status === 'assigned' && (
          <button className="button button--quiet" type="button" onClick={() => void update('in_progress')} disabled={saving}>
            Start work
          </button>
        )}
        {service.status === 'in_progress' && (
          <button className="button button--quiet" type="button" onClick={() => void update('awaiting_parts')} disabled={saving}>
            Awaiting parts
          </button>
        )}
        {service.status === 'awaiting_parts' && (
          <button className="button button--quiet" type="button" onClick={() => void update('in_progress')} disabled={saving}>
            Resume work
          </button>
        )}
        {service.status !== 'assigned' && (
          <button className="button button--primary" type="button" onClick={() => void update('completed')} disabled={saving || !workPerformed.trim()}>
            Mark completed
          </button>
        )}
      </div>
    </article>
  )
}

export function TechnicianWorkQueue({ session }: { session: AuthSession }) {
  const [services, setServices] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await apiRequest<ServicePage>('/api/services/assigned?limit=100', session.accessToken)
      setServices(result.services)
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [session.accessToken])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  return (
    <div className="operations-stack">
      <section className="panel operations-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow"><span /> TECHNICIAN WORKSPACE</p>
            <h2>Assigned service work</h2>
            <p className="panel-intro">Record repairs and service notes as work progresses. Completed jobs are read-only.</p>
          </div>
          <button className="button button--quiet" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
        </div>
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        {loading ? <p className="empty-state">Loading assigned work…</p> : services.length === 0 ? (
          <p className="empty-state">No active service requests are assigned to you.</p>
        ) : (
          <div className="operations-list">
            {services.map((service) => (
              <ExecutionCard key={service.id} service={service} session={session} onSaved={() => void load()} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

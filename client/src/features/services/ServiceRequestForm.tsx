import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest, type AuthSession, type Customer, type ServiceRequest, type Vehicle } from '../../lib/api'

interface Props {
  session: AuthSession
  request?: ServiceRequest
  onSaved: (request: ServiceRequest) => void
  onCancel?: () => void
}

export function ServiceRequestForm({ session, request, onSaved, onCancel }: Props) {
  const isStaff = session.user.role === 'Service Advisor' || session.user.role === 'Administrator'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [customerId, setCustomerId] = useState(request?.customerId ?? '')
  const [vehicleId, setVehicleId] = useState(request?.vehicleId ?? '')
  const [serviceType, setServiceType] = useState(request?.serviceType ?? '')
  const [description, setDescription] = useState(request?.description ?? '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true

    async function loadOptions() {
      setLoading(true)
      setError('')
      try {
        if (isStaff) {
          const result = await apiRequest<{ customers: Customer[] }>('/api/customers?limit=100', session.accessToken)
          if (!active) return
          setCustomers(result.customers)
          const selectedCustomerId = request?.customerId ?? result.customers[0]?.id ?? ''
          setCustomerId(selectedCustomerId)
          if (selectedCustomerId) {
            const vehicleResult = await apiRequest<{ vehicles: Vehicle[] }>(
              `/api/customers/${encodeURIComponent(selectedCustomerId)}/vehicles`,
              session.accessToken,
            )
            if (active) setVehicles(vehicleResult.vehicles)
          } else {
            setVehicles([])
          }
        } else {
          const result = await apiRequest<{ vehicles: Vehicle[] }>('/api/me/vehicles', session.accessToken)
          if (active) setVehicles(result.vehicles)
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load the required records.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadOptions()
    return () => { active = false }
  }, [isStaff, request?.customerId, session.accessToken])

  async function changeCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId)
    setVehicleId('')
    setVehicles([])
    setError('')
    if (!nextCustomerId) return

    try {
      const result = await apiRequest<{ vehicles: Vehicle[] }>(
        `/api/customers/${encodeURIComponent(nextCustomerId)}/vehicles`,
        session.accessToken,
      )
      setVehicles(result.vehicles)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load vehicles for this customer.')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!vehicleId) {
      setError('Choose a registered vehicle before submitting.')
      return
    }
    if (!serviceType.trim() || !description.trim()) {
      setError('Enter a service type and a description of the work needed.')
      return
    }

    setSaving(true)
    try {
      const body = { vehicleId, serviceType: serviceType.trim(), description: description.trim() }
      const result = request
        ? await apiRequest<{ service: ServiceRequest }>(`/api/services/${encodeURIComponent(request.id)}`, session.accessToken, {
            method: 'PATCH', body: JSON.stringify(body),
          })
        : await apiRequest<{ service: ServiceRequest }>('/api/services', session.accessToken, {
            method: 'POST', body: JSON.stringify(body),
          })
      setNotice(request ? 'Your corrected request was resubmitted for review.' : 'Your service request was submitted for review.')
      onSaved(result.service)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save the service request.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="state-message" role="status">Loading customer and vehicle records…</p>

  return (
    <section className="panel request-panel" aria-labelledby="request-form-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow"><span /> REQUEST INTAKE</p>
          <h2 id="request-form-title">{request ? 'Correct your request' : 'Request a service visit'}</h2>
          <p className="panel-intro">Choose a registered vehicle and describe the work needed. An advisor will review it before service is assigned.</p>
        </div>
        {onCancel && <button className="button button--quiet" type="button" onClick={onCancel}>Back</button>}
      </div>

      {error && <p className="notice notice--error" role="alert">{error}</p>}
      {notice && <p className="notice notice--success" role="status">{notice}</p>}

      {!isStaff && vehicles.length === 0 ? (
        <div className="empty-state">
          <h3>No registered vehicle is linked to this account</h3>
          <p>Ask a service advisor to link your customer record and register your vehicle before creating a request.</p>
        </div>
      ) : isStaff && customers.length === 0 ? (
        <div className="empty-state">
          <h3>No customer records found</h3>
          <p>Register a customer and vehicle before creating a service request on their behalf.</p>
        </div>
      ) : (
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          {isStaff && (
            <label className="field field--wide">
              <span>Customer</span>
              <select value={customerId} onChange={(event) => void changeCustomer(event.target.value)} required>
                <option value="">Choose a customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.email}</option>)}
              </select>
            </label>
          )}

          <label className="field field--wide">
            <span>Registered vehicle</span>
            <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required disabled={vehicles.length === 0}>
              <option value="">Choose a vehicle</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registrationNumber} · {vehicle.year} {vehicle.make} {vehicle.model}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--wide">
            <span>Service type</span>
            <input value={serviceType} onChange={(event) => setServiceType(event.target.value)} maxLength={40} list="service-type-options" required placeholder="e.g. Oil change" />
            <datalist id="service-type-options">
              <option value="General inspection" />
              <option value="Oil change" />
              <option value="Brake repair" />
              <option value="Engine diagnostics" />
              <option value="Tyre service" />
            </datalist>
          </label>

          <label className="field field--wide">
            <span>Describe the issue or requested work</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={5} required placeholder="Include symptoms, warning lights, or the work you would like done." />
            <small>{description.length}/500 characters</small>
          </label>

          <div className="form-actions field--wide">
            <p>Your request will be marked <strong>Submitted</strong> until a service advisor reviews it.</p>
            <button className="button button--primary" type="submit" disabled={saving || vehicles.length === 0}>
              {saving ? 'Submitting…' : request ? 'Resubmit for review' : 'Submit service request'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

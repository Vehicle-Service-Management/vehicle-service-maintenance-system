import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  apiRequest,
  ApiError,
  type AuthSession,
  type Customer,
  type Vehicle,
} from '../../lib/api'

interface CustomerPage {
  customers: Customer[]
  total: number
}

interface VehiclePage {
  vehicles: Vehicle[]
  total: number
}

interface VehicleResponse {
  vehicle: Vehicle
}

interface VehicleHistory {
  serviceRecords: Array<{ id: string; serviceType: string | null; status: string; workPerformed: string; notes: string; completedAt: string | null }>
  maintenanceRecords: Array<{ id: string; maintenanceDate: string; details: string; serviceId: string | null }>
}

interface Props {
  session: AuthSession
}

const emptyForm = {
  customerId: '',
  registrationNumber: '',
  make: '',
  model: '',
  year: String(new Date().getFullYear()),
}

export function VehicleManagement({ session }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null)
  const [history, setHistory] = useState<VehicleHistory | null>(null)
  const [maintenanceDate, setMaintenanceDate] = useState(new Date().toISOString().slice(0, 10))
  const [maintenanceDetails, setMaintenanceDetails] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const customerPage = await apiRequest<CustomerPage>(
        '/api/customers?limit=100',
        session.accessToken,
      )

      setCustomers(customerPage.customers)

      const vehiclePage = await apiRequest<VehiclePage>(
        `/api/vehicles?limit=100&search=${encodeURIComponent(search)}`,
        session.accessToken,
      )
      setVehicles(vehiclePage.vehicles)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load customers and vehicles.',
      )
    } finally {
      setLoading(false)
    }
  }, [session.accessToken, search])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function startEditing(vehicle: Vehicle) {
    setEditingId(vehicle.id)
    setForm({
      customerId: vehicle.customerId,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: String(vehicle.year),
    })
    setError('')
    setMessage('')
  }

  async function openHistory(vehicle: Vehicle) {
    setError('')
    setHistoryVehicle(vehicle)
    try {
      const result = await apiRequest<VehicleHistory>(`/api/vehicles/${encodeURIComponent(vehicle.id)}/history`, session.accessToken)
      setHistory(result)
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Unable to load vehicle history.')
    }
  }

  async function saveMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!historyVehicle) return
    setSaving(true)
    setError('')
    try {
      await apiRequest(`/api/vehicles/${encodeURIComponent(historyVehicle.id)}/maintenance`, session.accessToken, {
        method: 'POST', body: JSON.stringify({ maintenanceDate, details: maintenanceDetails }),
      })
      setMaintenanceDetails('')
      await openHistory(historyVehicle)
      setMessage('Maintenance record saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save maintenance record.')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)

    try {
      const payload = {
        registrationNumber: form.registrationNumber.trim().toUpperCase(),
        make: form.make.trim(),
        model: form.model.trim(),
        year: Number(form.year),
      }

      if (editingId) {
        await apiRequest<VehicleResponse>(
          `/api/vehicles/${encodeURIComponent(editingId)}`,
          session.accessToken,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
        )

        setMessage('Vehicle details updated successfully.')
      } else {
        if (!form.customerId) {
          setError('Please select a customer.')
          return
        }

        await apiRequest<VehicleResponse>(
          '/api/vehicles',
          session.accessToken,
          {
            method: 'POST',
            body: JSON.stringify({
              ...payload,
              customerId: form.customerId,
            }),
          },
        )

        setMessage('Vehicle registered successfully.')
      }

      setForm(emptyForm)
      setEditingId(null)
      await loadData()
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : saveError instanceof Error
            ? saveError.message
            : 'Unable to save vehicle details.',
      )
    } finally {
      setSaving(false)
    }
  }

  const customerNames = new Map(
    customers.map((customer) => [customer.id, customer.name]),
  )

  return (
    <div className="management-page">
      <section className="panel management-panel">
        <div className="overview-section-heading">
          <div>
            <p className="eyebrow"><span /> VEHICLE MANAGEMENT</p>
            <h2>{editingId ? 'Update vehicle' : 'Register vehicle'}</h2>
          </div>
        </div>

        <p>Register vehicles against existing customer records.</p>

        {error && <p className="notice notice--error" role="alert">{error}</p>}
        {message && <p className="notice" role="status">{message}</p>}

        {customers.length === 0 && !loading ? (
          <div className="empty-state">
            <h3>No customers available</h3>
            <p>Register a customer before registering a vehicle.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="management-form">
            {!editingId && (
              <label>
                Customer *
                <select
                  required
                  value={form.customerId}
                  onChange={(event) =>
                    setForm({ ...form, customerId: event.target.value })
                  }
                >
                  <option value="">Select a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} — {customer.email}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {editingId && (
              <label>
                Customer
                <input
                  value={customerNames.get(form.customerId) ?? 'Unknown customer'}
                  disabled
                />
              </label>
            )}

            <label>
              Registration number *
              <input
                required
                maxLength={20}
                pattern="[A-Za-z0-9 -]+"
                value={form.registrationNumber}
                onChange={(event) =>
                  setForm({ ...form, registrationNumber: event.target.value })
                }
                placeholder="KA01AB1234"
              />
            </label>

            <label>
              Make *
              <input
                required
                maxLength={60}
                value={form.make}
                onChange={(event) =>
                  setForm({ ...form, make: event.target.value })
                }
                placeholder="Toyota"
              />
            </label>

            <label>
              Model *
              <input
                required
                maxLength={60}
                value={form.model}
                onChange={(event) =>
                  setForm({ ...form, model: event.target.value })
                }
                placeholder="Corolla"
              />
            </label>

            <label>
              Year *
              <input
                required
                type="number"
                min={1886}
                max={new Date().getFullYear() + 1}
                step={1}
                value={form.year}
                onChange={(event) =>
                  setForm({ ...form, year: event.target.value })
                }
              />
            </label>

            <div className="management-actions">
              <button
                className="button button--primary"
                type="submit"
                disabled={saving || loading}
              >
                {saving
                  ? 'Saving…'
                  : editingId
                    ? 'Save changes'
                    : 'Register vehicle'}
              </button>

              {editingId && (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      <section className="panel management-panel">
        <div className="overview-section-heading">
          <div>
            <p className="eyebrow"><span /> VEHICLE DIRECTORY</p>
            <h2>Registered vehicles</h2>
          </div>

          <button
            className="button button--secondary"
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <label>Search vehicles
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Registration, make, model, or customer" />
        </label>

        {loading ? (
          <p className="state-message" role="status">Loading vehicles…</p>
        ) : vehicles.length === 0 ? (
          <div className="empty-state">
            <h3>{search ? 'No matching vehicles' : 'No vehicles registered'}</h3>
            <p>{search ? 'Try another search term.' : 'Register a vehicle using the form above.'}</p>
          </div>
        ) : (
          <div className="management-table-wrap">
            <table className="management-table">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Customer</th>
                  <th>Make</th>
                  <th>Model</th>
                  <th>Year</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>{vehicle.registrationNumber}</td>
                    <td>{customerNames.get(vehicle.customerId) ?? 'Unknown'}</td>
                    <td>{vehicle.make}</td>
                    <td>{vehicle.model}</td>
                    <td>{vehicle.year}</td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => startEditing(vehicle)}
                      >
                        Edit
                      </button>
                      {' · '}
                      <button className="text-button" type="button" onClick={() => void openHistory(vehicle)}>History</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {historyVehicle && (
          <section className="panel management-panel" aria-label="Vehicle service and maintenance history">
            <div className="overview-section-heading"><div><p className="eyebrow"><span /> VEHICLE HISTORY</p><h3>{historyVehicle.registrationNumber}</h3></div><button className="text-button" type="button" onClick={() => { setHistoryVehicle(null); setHistory(null) }}>Close</button></div>
            <form className="management-form" onSubmit={saveMaintenance}>
              <label>Maintenance date *<input type="date" required value={maintenanceDate} onChange={(event) => setMaintenanceDate(event.target.value)} /></label>
              <label>Maintenance details *<textarea required maxLength={2000} value={maintenanceDetails} onChange={(event) => setMaintenanceDetails(event.target.value)} placeholder="Describe the maintenance performed" /></label>
              <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add maintenance record'}</button>
            </form>
            {!history ? <p className="state-message">Loading history…</p> : <>
              <h4>Maintenance records</h4>
              {history.maintenanceRecords.length ? <ul>{history.maintenanceRecords.map((record) => <li key={record.id}>{record.maintenanceDate}: {record.details}</li>)}</ul> : <p>No maintenance records.</p>}
              <h4>Service activity</h4>
              {history.serviceRecords.length ? <ul>{history.serviceRecords.map((record) => <li key={record.id}>{record.serviceType ?? 'Service'} ({record.status}) — {record.workPerformed || 'No work details'}</li>)}</ul> : <p>No service records.</p>}
            </>}
          </section>
        )}
      </section>
    </div>
  )
}

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  apiRequest,
  ApiError,
  type AuthSession,
  type Customer,
} from '../../lib/api'

interface CustomerPage {
  customers: Customer[]
  total: number
  limit: number
  offset: number
}

interface CustomerResponse {
  customer: Customer
}

interface Props {
  session: AuthSession
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
}

export function CustomerManagement({ session }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await apiRequest<CustomerPage>(
        '/api/customers?limit=100',
        session.accessToken,
      )

      setCustomers(result.customers)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load customers.',
      )
    } finally {
      setLoading(false)
    }
  }, [session.accessToken])

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

  function startEditing(customer: Customer) {
    setEditingId(customer.id)
    setForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address ?? '',
    })
    setError('')
    setMessage('')
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
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      }

      if (editingId) {
        await apiRequest<CustomerResponse>(
          `/api/customers/${editingId}`,
          session.accessToken,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
        )

        setMessage('Customer details updated successfully.')
      } else {
        await apiRequest<CustomerResponse>(
          '/api/customers',
          session.accessToken,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        )

        setMessage('Customer registered successfully.')
      }

      setForm(emptyForm)
      setEditingId(null)
      await loadCustomers()
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : saveError instanceof Error
            ? saveError.message
            : 'Unable to save customer details.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="management-page">
      <section className="panel management-panel">
        <div className="overview-section-heading">
          <div>
            <p className="eyebrow"><span /> CUSTOMER MANAGEMENT</p>
            <h2>{editingId ? 'Update customer' : 'Register customer'}</h2>
          </div>
        </div>

        <p>Register customers and maintain their contact information.</p>

        {error && <p className="notice notice--error" role="alert">{error}</p>}
        {message && <p className="notice" role="status">{message}</p>}

        <form onSubmit={handleSubmit} className="management-form">
          <label>
            Customer name *
            <input
              required
              minLength={1}
              maxLength={100}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder="Enter full name"
            />
          </label>

          <label>
            Email address *
            <input
              required
              type="email"
              maxLength={254}
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
              placeholder="customer@example.com"
            />
          </label>

          <label>
            Phone number *
            <input
              required
              minLength={7}
              maxLength={20}
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
              placeholder="Enter phone number"
            />
          </label>

          <label>
            Address
            <textarea
              maxLength={250}
              value={form.address}
              onChange={(event) =>
                setForm({ ...form, address: event.target.value })
              }
              placeholder="Enter address (optional)"
              rows={3}
            />
          </label>

          <div className="management-actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={saving}
            >
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Register customer'}
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
      </section>

      <section className="panel management-panel">
        <div className="overview-section-heading">
          <div>
            <p className="eyebrow"><span /> CUSTOMER DIRECTORY</p>
            <h2>Registered customers</h2>
          </div>

          <button
            className="button button--secondary"
            type="button"
            onClick={() => void loadCustomers()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <p>{customers.length} customer(s) displayed</p>

        {loading ? (
          <p className="state-message" role="status">Loading customers…</p>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <h3>No customers registered</h3>
            <p>Register a customer using the form above.</p>
          </div>
        ) : (
          <div className="management-table-wrap">
            <table className="management-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.email}</td>
                    <td>{customer.phone}</td>
                    <td>{customer.address || '—'}</td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => startEditing(customer)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
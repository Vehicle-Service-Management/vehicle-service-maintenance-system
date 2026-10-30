import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiRequest, ApiError, type AdminUser, type AuthSession, type UserRole } from '../../lib/api'

interface UserPage {
  users: AdminUser[]
  total: number
  limit: number
  offset: number
}

interface UserResponse {
  user: AdminUser
}

type StaffRole = Exclude<UserRole, 'Customer'>
type RoleFilter = 'all' | StaffRole
type StatusFilter = 'all' | 'active' | 'inactive'

interface Props {
  session: AuthSession
}

interface AccountForm {
  displayName: string
  email: string
  role: StaffRole
  password: string
}

const staffRoles: StaffRole[] = [
  'Service Advisor',
  'Service Technician',
  'Administrator',
]

const emptyForm: AccountForm = {
  displayName: '',
  email: '',
  role: 'Service Advisor',
  password: '',
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return fallback
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

export function UserManagement({ session }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountForm>(emptyForm)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const allUsers: AdminUser[] = []
      let offset = 0
      let total = 0

      do {
        const page = await apiRequest<UserPage>(
          `/api/admin/users?limit=100&offset=${offset}`,
          session.accessToken,
        )
        allUsers.push(...page.users)
        total = page.total
        offset += page.limit
      } while (offset < total)

      setUsers(allUsers.filter((user) => user.role !== 'Customer'))
    } catch (loadError) {
      setError(messageFor(loadError, 'Unable to load staff accounts.'))
    } finally {
      setLoading(false)
    }
  }, [session.accessToken])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((user) => {
      const matchesQuery = !normalizedQuery ||
        user.displayName.toLowerCase().includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery)
      const matchesRole = roleFilter === 'all' || user.role === roleFilter
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'active' ? user.isActive : !user.isActive)
      return matchesQuery && matchesRole && matchesStatus
    })
  }, [query, roleFilter, statusFilter, users])

  function beginCreate() {
    setCreating(true)
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setMessage('')
  }

  function beginEdit(user: AdminUser) {
    setCreating(false)
    setEditingId(user.id)
    setForm({
      displayName: user.displayName,
      email: user.email,
      role: user.role as StaffRole,
      password: '',
    })
    setError('')
    setMessage('')
  }

  function cancelForm() {
    setCreating(false)
    setEditingId(null)
    setForm(emptyForm)
    setError('')
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)

    const payload = {
      displayName: form.displayName.trim(),
      email: form.email.trim(),
      role: form.role,
      ...(form.password ? { password: form.password } : {}),
    }

    try {
      if (editingId) {
        await apiRequest<UserResponse>(
          `/api/admin/users/${editingId}`,
          session.accessToken,
          { method: 'PATCH', body: JSON.stringify(payload) },
        )
        setMessage('Staff account updated.')
      } else {
        await apiRequest<UserResponse>(
          '/api/admin/users',
          session.accessToken,
          { method: 'POST', body: JSON.stringify({ ...payload, password: form.password }) },
        )
        setMessage('Staff account created. Share the initial password securely.')
      }

      setCreating(false)
      setEditingId(null)
      setForm(emptyForm)
      await loadUsers()
    } catch (saveError) {
      setError(messageFor(saveError, 'Unable to save this account.'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(user: AdminUser) {
    const nextActive = !user.isActive
    if (!nextActive && !window.confirm(`Deactivate ${user.displayName}'s account? They will no longer be able to sign in.`)) {
      return
    }

    setError('')
    setMessage('')
    setBusyUserId(user.id)

    try {
      await apiRequest<UserResponse>(
        `/api/admin/users/${user.id}`,
        session.accessToken,
        { method: 'PATCH', body: JSON.stringify({ isActive: nextActive }) },
      )
      setMessage(nextActive ? 'Account reactivated.' : 'Account deactivated.')
      await loadUsers()
    } catch (actionError) {
      setError(messageFor(actionError, 'Unable to update this account.'))
    } finally {
      setBusyUserId(null)
    }
  }

  function renderAccountForm(user?: AdminUser) {
    const isEditing = Boolean(user)
    const isOwnAccount = user?.id === session.user.id

    return (
      <form className="management-form user-account-form" onSubmit={(event) => void submitForm(event)}>
        <label>
          Full name *
          <input
            required
            minLength={1}
            maxLength={100}
            autoComplete="name"
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
        </label>

        <label>
          Account email *
          <input
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>

        <label>
          Role *
          <select
            required
            value={form.role}
            disabled={isOwnAccount}
            onChange={(event) => setForm({ ...form, role: event.target.value as StaffRole })}
          >
            {staffRoles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          {isOwnAccount && <small>Your own role cannot be changed here.</small>}
        </label>

        <label>
          {isEditing ? 'Reset password' : 'Initial password'}{isEditing ? '' : ' *'}
          <input
            type="password"
            required={!isEditing}
            minLength={12}
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder={isEditing ? 'Leave blank to keep current password' : 'At least 12 characters'}
          />
          <small>{isEditing ? 'Leave blank unless you want to set a new password.' : 'Use at least 12 characters.'}</small>
        </label>

        <div className="management-actions">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create account'}
          </button>
          <button className="button button--quiet" type="button" onClick={cancelForm} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="management-page user-management">
      <section className="panel management-panel">
        <div className="overview-section-heading">
          <div>
            <p className="eyebrow"><span /> ADMINISTRATOR ACCESS</p>
            <h2>{creating ? 'Create staff account' : 'Manage staff accounts'}</h2>
          </div>
          <div className="user-management__heading-actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void loadUsers()}
              disabled={loading || saving || busyUserId !== null}
            >
              Refresh
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={creating ? cancelForm : beginCreate}
              disabled={saving}
            >
              {creating ? 'Cancel' : 'Add staff account'}
            </button>
          </div>
        </div>

        <p>Manage Service Advisors, Service Technicians and Administrators. Customer accounts are created through customer registration.</p>

        {error && <p className="notice notice--error" role="alert">{error}</p>}
        {message && <p className="notice notice--success" role="status">{message}</p>}

        {creating && renderAccountForm()}
      </section>

      <section className="panel management-panel">
        <div className="overview-section-heading">
          <div>
            <p className="eyebrow"><span /> USER DIRECTORY</p>
            <h2>Staff accounts</h2>
          </div>
          <span className="user-management__count">{visibleUsers.length} shown · {users.length} total</span>
        </div>

        <div className="user-filters" aria-label="Filter staff accounts">
          <label>
            Search
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or email"
            />
          </label>
          <label>
            Role
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
              <option value="all">All staff roles</option>
              {staffRoles.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>
            Account status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p className="state-message" role="status">Loading staff accounts…</p>
        ) : visibleUsers.length === 0 ? (
          <div className="empty-state">
            <h3>{users.length === 0 ? 'No staff accounts yet' : 'No accounts match these filters'}</h3>
            <p>{users.length === 0 ? 'Create an advisor, technician or administrator account to get started.' : 'Try changing the search or filters.'}</p>
          </div>
        ) : (
          <div className="management-table-wrap">
            <table className="management-table user-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <Fragment key={user.id}>
                    <tr>
                      <td>{user.displayName}{user.id === session.user.id && <small className="user-table__self">You</small>}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td><span className={`status-pill user-status${user.isActive ? '' : ' user-status--inactive'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <div className="user-table__actions">
                          <button className="text-button" type="button" onClick={() => beginEdit(user)} disabled={saving || busyUserId !== null}>Edit</button>
                          <button
                            className={`text-button${user.isActive ? ' user-table__deactivate' : ''}`}
                            type="button"
                            onClick={() => void toggleActive(user)}
                            disabled={saving || busyUserId !== null || user.id === session.user.id}
                            title={user.id === session.user.id ? 'You cannot deactivate your own account.' : undefined}
                          >
                            {busyUserId === user.id ? 'Saving…' : user.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === user.id && (
                      <tr className="user-table__edit-row">
                        <td colSpan={6}>{renderAccountForm(user)}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

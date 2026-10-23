# Vehicle Service Maintenance API

A REST API for administering vehicle-service users, enforcing role-based access, and keeping append-only audit records of administrative and service-status activity. It uses TypeScript, Express, and SQLite.

## Requirements

- Node.js 20 or later
- npm

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Set `JWT_SECRET` in `.env` to a cryptographically random value of at least 32 characters. The example value is a placeholder and must not be used outside local development.

Create the first administrator once, before starting the API. Set `BOOTSTRAP_ADMIN_PASSWORD` to a unique password of at least 12 characters, then run:

```powershell
$env:BOOTSTRAP_ADMIN_PASSWORD = "<unique password>"
npm run bootstrap-admin -- admin@example.com "System Administrator"
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

The bootstrap command only runs while the database has no users. It stores a bcrypt password hash and an audit event; it never stores or logs the supplied password. Keep the password in a secrets manager in deployed environments.

Start the API:

```sh
npm run dev
```

The API listens on port `3000` by default. Configure `PORT` and `DATABASE_PATH` in `.env` to override the defaults. `GET /health` is an unauthenticated liveness check.

## Authentication and authorization

`POST /api/auth/login` accepts `{ "email": "...", "password": "..." }` and returns a one-hour bearer token. For authenticated requests, send the returned token in the `Authorization` header with the `Bearer` scheme. Passwords are hashed with bcrypt, login requests are rate limited, and each request loads the user's current active state and role from the database so role changes and deactivation take effect immediately.

Roles are `Customer`, `Service Advisor`, `Service Technician`, and `Administrator`. Only administrators can manage users or view audit events. Service creation is limited to administrators and service advisors; service status updates are limited to administrators, service advisors, and technicians.

## User administration

- `GET /api/admin/users?limit=50&offset=0` — list users (passwords and password hashes are never returned).
- `POST /api/admin/users` — create a user with `email`, `displayName`, `password`, and `role`.
- `PATCH /api/admin/users/:id` — update `email`, `displayName`, `password`, `role`, and/or `isActive`.

User deletion is intentionally not provided: accounts are deactivated so historical records and audit attribution are retained. Administrators cannot change their own role or deactivate themselves, and the last active administrator cannot be demoted or deactivated.

## Audit logging and service activity

- `GET /api/admin/audit-events?limit=50&offset=0` — list timestamped events with actor identity/role, action, target, and relevant change details.
- `POST /api/services` — create a service record (starts in `received`).
- `PATCH /api/services/:id/status` — set a status to `received`, `assigned`, `in_progress`, `awaiting_parts`, `completed`, or `cancelled`.

User creation/changes, successful logins, service creation, and service-status changes are recorded in the same database transaction as their corresponding change. Audit details exclude passwords. SQLite triggers reject updates and deletes to audit events, and the API exposes no write operation for them. Configure the database file and its backups with appropriate operator-level access controls; database-file administrators remain outside application authorization.

## Development checks

```sh
npm run typecheck
npm test
npm run build
```

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

Roles are `Customer`, `Service Advisor`, `Service Technician`, and `Administrator`. Only administrators can manage users or view audit events. Service creation and technician assignment are limited to administrators and service advisors; assigned technicians can view and update their own active work. Administrators and service advisors can view and manage all services.

## User administration

- `GET /api/admin/users?limit=50&offset=0` — list users (passwords and password hashes are never returned).
- `POST /api/admin/users` — create a user with `email`, `displayName`, `password`, and `role`.
- `PATCH /api/admin/users/:id` — update `email`, `displayName`, `password`, `role`, and/or `isActive`.

User deletion is intentionally not provided: accounts are deactivated so historical records and audit attribution are retained. Administrators cannot change their own role or deactivate themselves, and the last active administrator cannot be demoted or deactivated.

## Audit logging and service activity

- `GET /api/admin/audit-events?limit=50&offset=0` — list timestamped events with actor identity/role, action, target, and relevant change details.
- `POST /api/services` — create a service record (starts in `received`).
- `POST /api/services/:id/assign` — assign an active Service Technician with `{ "technicianUserId": "<user-id>" }`; assigning a new service moves it to `assigned`.
- `GET /api/services/assigned?limit=50&offset=0` — list active assignments. Technicians see only their own; administrators and advisors can see all active assignments.
- `PATCH /api/services/:id/execution` — record `workPerformed`, optional `notes`, and/or progress `status` (`in_progress`, `awaiting_parts`, etc.). Marking work `completed` requires an assigned technician and non-empty work performed; the server records `completedAt`.
- `PATCH /api/services/:id/status` — update a service status to `received`, `assigned`, `in_progress`, `awaiting_parts`, `completed`, or `cancelled`. Completion through this route also requires assignment and recorded work.

User creation/changes, successful logins, service assignment, execution updates, completion, and service-status changes are recorded in the same database transaction as their corresponding change. Completed and cancelled services cannot be modified. Audit details exclude passwords and include service work/notes where changed. SQLite triggers reject updates and deletes to audit events, and the API exposes no write operation for them. The API migrates existing SQLite service tables to add assignment, execution, and completion fields. Configure the database file and its backups with appropriate operator-level access controls; database-file administrators remain outside application authorization.

## Development checks

```sh
npm run typecheck
npm test
npm run build
```

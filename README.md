# Vehicle Service Maintenance API

A REST API for administering vehicle-service users, enforcing role-based access, and keeping append-only audit records of administrative and service activity. It uses TypeScript, Express, and SQLite.

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

The React + TypeScript + Vite client is in `client/`. For local full-stack development, keep the API running in one terminal and start the client in another:

```sh
npm --prefix client install
npm run dev:client
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Vite proxies `/api` and `/health` requests to the API on port `3000`.

The Express setup and middleware live in `src/app.ts`. API endpoints are grouped into auth, admin, customer, vehicle, and service routers under `src/routes/`, then mounted under `/api`. Service-request creation, correction, and review handlers are in `src/controllers/service-request.controller.ts`; shared validation and database row types live in `src/routes/shared.ts`. `npm run dev` uses `tsx watch` to restart the TypeScript server when source files change, so Nodemon is not needed.

## Authentication and authorization

`POST /api/auth/login` accepts `{ "email": "...", "password": "..." }` and returns a one-hour bearer token. For authenticated requests, send the returned token in the `Authorization` header with the `Bearer` scheme. Passwords are hashed with bcrypt, login requests are rate limited, and each request loads the user's current active state and role from the database so role changes and deactivation take effect immediately.

Roles are `Customer`, `Service Advisor`, `Service Technician`, and `Administrator`. Only administrators can manage users or view audit events. Customers can submit service requests for vehicles in their linked customer profile. Service advisors and administrators can submit requests on behalf of customers and review requests. Operational status updates are limited to administrators, service advisors, and technicians, and require a request to be validated first.

## User administration

- `GET /api/admin/users?limit=50&offset=0` - list users (passwords and password hashes are never returned).
- `POST /api/admin/users` - create a user with `email`, `displayName`, `password`, and `role`. Customer accounts also require `customerId` to link the login to an existing customer record.
- `PATCH /api/admin/users/:id` - update `email`, `displayName`, `password`, `role`, `isActive`, and/or `customerId`.

User deletion is intentionally not provided: accounts are deactivated so historical records and audit attribution are retained. Administrators cannot change their own role or deactivate themselves, and the last active administrator cannot be demoted or deactivated.

## Service request intake and review

- `GET /api/me/vehicles` - list vehicles linked to the authenticated Customer account for request selection. Staff can use `GET /api/customers/:id/vehicles`.
- `GET /api/services?status=submitted&limit=50&offset=0` - list requests. Customers only see requests for their linked customer profile; staff can filter by public status.
- `GET /api/services/:id` - view a request, subject to the same customer ownership rules.
- `POST /api/services` - submit a request with `vehicleId`, and optionally `serviceType` and `description`. Customer submissions must use a vehicle owned by their linked profile. New requests start as `submitted` so staff can validate missing or incorrect details.
- `PATCH /api/services/:id` - correct a submitted or rejected request. The owning customer or staff can edit it; a rejected request returns to `submitted` for review.
- `PATCH /api/services/:id/review` - advisors and administrators validate a complete request with `{ "decision": "validate" }` or reject it with `{ "decision": "reject", "reason": "..." }`.
- `PATCH /api/services/:id/status` - after validation, staff can update the operational status to `assigned`, `in_progress`, `awaiting_parts`, `completed`, or `cancelled`, following the permitted status transitions.

The public request status is `submitted`, `validated`, or `rejected` during intake and review. After validation, it reflects the operational workflow status. Rejection reasons and review attribution are retained, and resubmission clears the prior rejection details.

## Audit logging

User creation/changes, successful logins, service creation, service review decisions, and service-status changes are recorded in the same database transaction as their corresponding change. Audit details exclude passwords. SQLite triggers reject updates and deletes to audit events, and the API exposes no write operation for them. Configure the database file and its backups with appropriate operator-level access controls; database-file administrators remain outside application authorization.

## Development checks

```sh
npm run typecheck
npm run typecheck:client
npm test
npm run build
```

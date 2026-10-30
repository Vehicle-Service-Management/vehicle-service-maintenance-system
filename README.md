# Vehicle Service & Maintenance Management System

A full-stack vehicle service and maintenance application. The client is built with React, TypeScript, and Vite; the REST API uses TypeScript and Express; SQLite stores users, customers, vehicles, service requests, and append-only audit records.

## Get the latest shared baseline

The customer and vehicle management screens and the service request intake and review workflow are merged into `main`. For a fresh checkout:

```powershell
git clone --branch main https://github.com/Vehicle-Service-Management/vehicle-service-maintenance-system.git
Set-Location vehicle-service-maintenance-system
```

To update an existing checkout:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
```


## Install prerequisites

- Node.js 20.19 or later, or 22.12 or later (needed by the current Vite client)
- npm (included with Node.js)
- Git

Check the installed versions:

```powershell
node --version
npm --version
git --version
```

### Install dependencies

Run these commands from the repository root:

```powershell
npm install
npm --prefix client install
```

### Configure local environment

Create a local environment file and edit its secret:

```powershell
Copy-Item .env.example .env
notepad .env
```

Replace the example `JWT_SECRET` with a random value containing at least 32 characters. Keep the `.env` file private; it is ignored by Git. The default `PORT` is `3000`, and the default SQLite file is `data/app.sqlite`. Both are local to this checkout and are not shared through Git.

### Create the first local administrator

Do this once for a new local database, before starting the API. Choose a unique password of at least 12 characters:

```powershell
$env:BOOTSTRAP_ADMIN_PASSWORD = "<your local admin password>"
npm run bootstrap-admin -- admin@example.com "System Administrator"
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

Use the same email and password to sign in to the development client. The bootstrap command only works when the database has no users. It stores a bcrypt hash and an audit event, not the password itself. If you already bootstrapped this database, do not run it again.

### Start the backend and frontend

Keep each process running in its own PowerShell terminal. In terminal 1, start the API from the repository root:

```powershell
npm run dev
```

The API listens on `http://localhost:3000`. Check it from another terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

In terminal 2, from the repository root, start the Vite client:

```powershell
npm run dev:client
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The client proxies `/api` and `/health` to the API. In development mode, the sign-in panel calls the real API login endpoint; it does not bypass authentication or role checks.

## Try customer, vehicle, and service request workflows

A fresh SQLite database contains no customers, vehicles, or service requests. Sign in with an Administrator or Service Advisor account and use the **Customers** screen to register a customer, then the **Vehicles** screen to register a vehicle for that customer. The customer and vehicle screens support listing and updating records as well.

To test the customer portal, use **Create an account** on the sign-in page. If staff already created the customer record, register with the same name and email to link the login to that record; otherwise registration creates a new customer profile. An Administrator or Service Advisor must add vehicles to the profile before a service request can be submitted. Administrators manage staff accounts from **User management**; customer login linking remains available through the admin API below when needed:

```powershell
$base = "http://localhost:3000"
$adminEmail = Read-Host "Admin account email"
$adminPassword = Read-Host "Admin account password"

$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" `
  -ContentType "application/json" `
  -Body (@{ email = $adminEmail; password = $adminPassword } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.accessToken)" }

$customers = Invoke-RestMethod -Method Get -Uri "$base/api/customers?limit=100" -Headers $headers
$customers.customers | Select-Object id, name, email | Format-Table
$customerId = Read-Host "Customer ID to link"
$customer = $customers.customers | Where-Object { $_.id -eq $customerId }
if (-not $customer) { throw "Customer ID was not in the list above." }

$customerPassword = Read-Host "Choose a customer password (12 or more characters)"
$customerAccount = Invoke-RestMethod -Method Post -Uri "$base/api/admin/users" `
  -Headers $headers -ContentType "application/json" `
  -Body (@{
    email = $customer.email
    displayName = $customer.name
    password = $customerPassword
    role = "Customer"
    customerId = $customer.id
  } | ConvertTo-Json)

Write-Output "Created linked customer login $($customerAccount.user.email)"
```

Sign out of the website and sign in with the linked customer email and password. Choose **New request**, select the registered vehicle, and submit a service type and description. Then sign in as an Administrator or Service Advisor and open **Review queue**. Validate the request or return it with feedback. Sign back in as the customer to see the result in **My requests** and correct and resubmit a returned request.

The local database and `.env` are intentionally ignored by Git. Each teammate has a separate database and needs to create their own local records. Do not commit the database or real credentials.

## Work added on this branch after the service workflow baseline

The following changes were added after the branch's technician assignment and service execution baseline (`71e7f78`):

- **Sign-in and technician workspace polish** (`abc6d19`): corrected technician header/layout spacing and made the login action visible without needing to hover. The login rate limit was also adjusted.
- **Customer self-registration and profile linking** (`8e9b7ce`): added a customer registration form and API endpoint. Registration creates a Customer account and profile, or links an unlinked staff-created customer record when its email and normalized name match. Public registration cannot create staff accounts.
- **Administrator staff management** (current uncommitted change): added the **User management** screen to create Service Advisor, Service Technician, and Administrator accounts; search and filter them; edit account details and roles; reset passwords; and deactivate or reactivate accounts. The screen is restricted to administrators, and the API enforces that restriction as well. Customer accounts remain separate from this staff directory.
- **Requirements documentation**: updated the SRS and SAD to include customer registration/profile linking and the administrator staff-management screen.
- **Regression coverage**: extended the API tests to verify staff account editing, password reset, deactivation, reactivation, and subsequent sign-in behavior.

Checks run for the current change: `npm test` (25 passing), `npm run typecheck`, `npm run typecheck:client`, `npm --prefix client run build`, and `git diff --check`. The browser UI still needs a manual click-through check.

## Continue implementation from `main`

Create a feature branch from the latest `main` instead of committing directly to `main`. For example, to work on issue #11:

```powershell
git fetch origin
git switch --create feature/login-integration origin/main
```

Make and verify the change, then commit and publish your branch:

```powershell
git status
npm test
npm run typecheck
npm run typecheck:client
npm --prefix client run lint
npm run build
npm --prefix client run build
git add path/to/your-changed-file
git commit -m "feat: describe your change"
git push --set-upstream origin feature/login-integration
```

Replace the example branch name and `path/to/your-changed-file` with the branch and file names for your task.

Open a pull request with `main` as the base and your feature branch as the compare branch. Coordinate with teammates before editing shared API contracts, role/session types, or the same client components.

Docker is not required for this development workflow. It can be added later for consistent full-project packaging and deployment.

## Project layout and development notes

The React + TypeScript + Vite client is in `client/`. It includes role-aware service-centre workspaces, customer and vehicle registration/list/update screens, customer request submission/correction, an advisor review queue, technician assignment, technician work execution, and an overview. The production sign-in and shared in-memory bearer-token session are documented in [`client/README.md`](client/README.md#sign-in-and-session).

The Express setup and middleware live in `src/app.ts`. API endpoints are grouped into auth, admin, customer, vehicle, and service routers under `src/routes/`, then mounted under `/api`. Service-request creation, correction, and review handlers are in `src/controllers/service-request.controller.ts`; shared validation and database row types live in `src/routes/shared.ts`. `npm run dev` uses `tsx watch` to restart the TypeScript server when source files change, so Nodemon is not needed.

## Authentication and authorization

`POST /api/auth/login` accepts `{ "email": "...", "password": "..." }` and returns a one-hour bearer token. For authenticated requests, send the returned token in the `Authorization` header with the `Bearer` scheme. Passwords are hashed with bcrypt, login requests are rate limited, and each request loads the user's current active state and role from the database so role changes and deactivation take effect immediately.

Customers can create their own account from the sign-in page. Public registration creates a `Customer` login and customer profile together, then signs the customer in. If an unlinked customer record already has the same email and name, registration links the login to that record so existing vehicles and service history remain visible. Names are matched without regard to capitalization or repeated spaces. Public registration cannot create staff or administrator accounts. Records with a different name, or already linked to an account, require staff assistance.

Roles are `Customer`, `Service Advisor`, `Service Technician`, and `Administrator`. Only administrators can manage users or view audit events. Customers can submit service requests for vehicles in their linked customer profile. Service advisors and administrators can submit requests on behalf of customers, review requests, and assign validated work to active technicians. Technicians can view and update execution details only for their own assignments.

## User administration

Administrators can use **User management** in the browser workspace to create Service Advisor, Service Technician, and Administrator accounts, edit account details and roles, reset passwords, and deactivate or reactivate accounts. Customers and non-Administrator staff cannot access this screen, and the API independently enforces Administrator access. Customer accounts are created through public customer registration.

- `POST /api/auth/register` - public customer registration with `name`, `email`, `phone`, optional `address`, and `password`. It creates a customer profile and linked Customer user, or links an unlinked existing record when its email and name match. It returns a bearer token.
- `GET /api/admin/users?limit=50&offset=0` - list users (passwords and password hashes are never returned).
- `POST /api/admin/users` - create a user with `email`, `displayName`, `password`, and `role`. Customer accounts also require `customerId` to link the login to an existing customer record.
- `PATCH /api/admin/users/:id` - update `email`, `displayName`, `password`, `role`, `isActive`, and/or `customerId`.

User deletion is intentionally not provided: accounts are deactivated so historical records and audit attribution are retained. Administrators cannot change their own role or deactivate themselves, and the last active administrator cannot be demoted or deactivated.

## Customer and vehicle management

Customer and vehicle records can be managed by Administrators and Service Advisors. Customer accounts can only see vehicles linked to their own customer profile.

- `POST /api/customers` - register a customer with `name`, `email`, `phone`, and optional `address`.
- `GET /api/customers?limit=50&offset=0` and `GET /api/customers/:id` - list or view customer records.
- `PATCH /api/customers/:id` - update customer contact details.
- `POST /api/vehicles` - register a vehicle with `customerId`, `registrationNumber`, `make`, `model`, and `year`.
- `GET /api/customers/:id/vehicles` - list vehicles registered to a customer.
- `GET /api/vehicles/:id` and `PATCH /api/vehicles/:id` - view or update a vehicle.
- `GET /api/me/vehicles` - list vehicles linked to the authenticated Customer account.

The web client provides customer and vehicle registration, list, and update screens for staff. Customers sign in through public registration; an Administrator can still create a linked Customer account through `POST /api/admin/users` and supply the existing record's `customerId` when manual setup is needed.

## Service request intake and review

- `GET /api/me/vehicles` - list vehicles linked to the authenticated Customer account for request selection. Staff can use `GET /api/customers/:id/vehicles`.
- `GET /api/services?status=submitted&limit=50&offset=0` - list requests. Customers only see requests for their linked customer profile; staff can filter by public status.
- `GET /api/services/:id` - view a request, subject to the same customer ownership rules.
- `POST /api/services` - submit a request with `vehicleId`, and optionally `serviceType` and `description`. Customer submissions must use a vehicle owned by their linked profile. New requests start as `submitted` so staff can validate missing or incorrect details.
- `PATCH /api/services/:id` - correct a submitted or rejected request. The owning customer or staff can edit it; a rejected request returns to `submitted` for review.
- `PATCH /api/services/:id/review` - advisors and administrators validate a complete request with `{ "decision": "validate" }` or reject it with `{ "decision": "reject", "reason": "..." }`.
- `GET /api/services/awaiting-assignment` and `GET /api/technicians` - advisors and administrators can view validated requests awaiting assignment and active technicians.
- `POST /api/services/:id/assign` - advisors and administrators assign a validated request using `{ "technicianUserId": "..." }`.
- `GET /api/services/assigned` - staff can view active assignments; technicians only receive their own assigned work.
- `PATCH /api/services/:id/execution` - the assigned technician or authorized staff can record `workPerformed`, internal `notes`, and execution status (`in_progress`, `awaiting_parts`, or `completed`). Completion requires work details and stores a completion timestamp.
- `PATCH /api/services/:id/status` - authorized staff can cancel or otherwise make permitted operational status changes; technicians cannot cancel work.

The public request status is `submitted`, `validated`, or `rejected` during intake and review. After validation, it reflects the operational workflow status. Rejection reasons and review attribution are retained, and resubmission clears the prior rejection details. Assignment and execution details are stored with the service record; internal service notes and technician contact details are not included in customer responses.

## Audit logging

User creation/changes, successful logins, customer and vehicle creation/updates, service creation, service review decisions, assignment, execution updates, completion, and service-status changes are recorded in the same database transaction as their corresponding change. Audit details exclude passwords. SQLite triggers reject updates and deletes to audit events, and the API exposes no write operation for them. Configure the database file and its backups with appropriate operator-level access controls; database-file administrators remain outside application authorization.

## Development checks

```sh
npm run typecheck
npm run typecheck:client
npm test
npm --prefix client run lint
npm run build
npm --prefix client run build
```

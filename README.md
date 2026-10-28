# Vehicle Service Maintenance API

A REST API for administering vehicle-service users, enforcing role-based access, and keeping append-only audit records of administrative and service activity. It uses TypeScript, Express, and SQLite.

## Requirements

- Node.js 20.19 or later, or 22.12 or later (needed by the current Vite client)
- npm

## Get the team branch

The current working baseline is `feature/service-request-intake-review`. It contains the service-request intake and review workflow and is published on `origin`. It has not been merged into `main`.

For a fresh checkout:

```powershell
git clone --branch feature/service-request-intake-review https://github.com/Vehicle-Service-Management/vehicle-service-maintenance-system.git
Set-Location vehicle-service-maintenance-system
```

If the repository is already cloned and you have a local branch with this name, update it:

```powershell
git fetch origin
git switch feature/service-request-intake-review
git pull --ff-only origin feature/service-request-intake-review
```

If you have not created the local branch yet, fetch and create it as a tracking branch:

```powershell
git fetch origin
git switch --create feature/service-request-intake-review --track origin/feature/service-request-intake-review
```

## Run on a fresh laptop

### 1. Install prerequisites

- Node.js 20.19 or later, or 22.12 or later (needed by the current Vite client)
- npm (included with Node.js)
- Git

Check the installed versions:

```powershell
node --version
npm --version
git --version
```

### 2. Install dependencies

Run these commands from the repository root:

```powershell
npm install
npm --prefix client install
```

### 3. Configure local environment

Create a local environment file and edit its secret:

```powershell
Copy-Item .env.example .env
notepad .env
```

Replace the example `JWT_SECRET` with a random value containing at least 32 characters. Keep the `.env` file private; it is ignored by Git. The default `PORT` is `3000`, and the default SQLite file is `data/app.sqlite`. Both are local to this checkout and are not shared through Git.

### 4. Create the first local administrator

Do this once for a new local database, before starting the API. Choose a unique password of at least 12 characters:

```powershell
$env:BOOTSTRAP_ADMIN_PASSWORD = "<your local admin password>"
npm run bootstrap-admin -- admin@example.com "System Administrator"
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

Use the same email and password to sign in to the development client. The bootstrap command only works when the database has no users. It stores a bcrypt hash and an audit event, not the password itself. If you already bootstrapped this database, do not run it again.

### 5. Start the backend and frontend

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

## Create local records to try the request flow

A fresh SQLite database contains no customers, vehicles, or service requests. The current client does not include customer/vehicle registration screens, so add the records through the API once before trying the workflow. The following PowerShell example creates a customer, a vehicle, and a linked customer login using the admin account. These records are saved only in your local `data/app.sqlite` file.

Run this in a third PowerShell terminal. Enter the admin credentials created above when prompted:

```powershell
$base = "http://localhost:3000"
$adminEmail = Read-Host "Admin account email"
$adminPassword = Read-Host "Admin account password"

$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" `
  -ContentType "application/json" `
  -Body (@{ email = $adminEmail; password = $adminPassword } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.accessToken)" }

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$customerEmail = "demo.customer.$stamp@example.com"
$customerName = "Demo Customer"
$customer = Invoke-RestMethod -Method Post -Uri "$base/api/customers" `
  -Headers $headers -ContentType "application/json" `
  -Body (@{ name = $customerName; email = $customerEmail; phone = "9876543210" } | ConvertTo-Json)

$vehicle = Invoke-RestMethod -Method Post -Uri "$base/api/vehicles" `
  -Headers $headers -ContentType "application/json" `
  -Body (@{
    customerId = $customer.customer.id
    registrationNumber = "DEMO-$stamp"
    make = "Toyota"
    model = "Corolla"
    year = 2022
  } | ConvertTo-Json)

$customerPassword = Read-Host "Choose a customer password (12 or more characters)"
$customerAccount = Invoke-RestMethod -Method Post -Uri "$base/api/admin/users" `
  -Headers $headers -ContentType "application/json" `
  -Body (@{
    email = $customerEmail
    displayName = $customerName
    password = $customerPassword
    role = "Customer"
    customerId = $customer.customer.id
  } | ConvertTo-Json)

Write-Output "Created customer $customerEmail"
Write-Output "Created vehicle $($vehicle.vehicle.registrationNumber)"
Write-Output "Created linked customer login $($customerAccount.user.email)"
```

To try customer submission, sign out of the website, sign in with the customer email and password, choose **New request**, select the registered vehicle, and submit a service type and description. To try advisor review, sign out and sign in again with the administrator account, then open **Review queue**. The submitted request should appear there; validate it or return it with feedback. The customer can then see the result under **My requests**.

The local database and `.env` are intentionally ignored by Git. Each teammate has a separate database and needs to create their own local records. Do not commit the database or real credentials.

## Continue implementation on top of this branch

Create a separate feature branch from the shared baseline instead of committing directly to the shared branch. For example, to work on issue #11:

```powershell
git fetch origin
git switch --create feature/login-integration origin/feature/service-request-intake-review
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

Open a pull request with your feature branch as the source. Until the team chooses a different integration target, use `feature/service-request-intake-review` as the base so the work builds on this baseline. Coordinate with teammates before editing shared API contracts, role/session types, or the same client components.

Docker is not required for this development workflow. It can be added later for consistent full-project packaging and deployment.

## Project layout and development notes

The React + TypeScript + Vite client is in `client/`. It includes role-aware service-centre workspaces, customer request submission/correction, an advisor review queue, and a live overview. Integration instructions for issue #11 and the shared in-memory bearer-token session are in [`client/README.md`](client/README.md#login-integration-contract-for-issue-11).

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

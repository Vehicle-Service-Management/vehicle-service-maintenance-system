# VSMMS web client

React + TypeScript + Vite client for the Vehicle Service & Maintenance Management System.

## Development

Run all commands below from the repository root. Install the client dependencies once:

```sh
npm --prefix client install
```

Start the Express API in one terminal and the Vite client in another:

```sh
npm run dev
```

```sh
npm run dev:client
```

Vite proxies `/api` and `/health` requests to the Express server on port `3000` during local development. The client normally runs at `http://localhost:5173`. Run `npm run typecheck:client`, `npm --prefix client run lint`, and `npm --prefix client run build` from the repository root to check the client.

## Customer, vehicle, and service request workflows

- Service advisors and administrators can register, list, and update customers and their vehicles.
- The role-based service-centre workspace includes an overview with live request and vehicle summary counts.
- Customers can submit service requests for their linked vehicles, page through their request history, and correct a rejected request before resubmitting it.
- Service advisors and administrators can search the customer list when creating a request, review paged submitted/returned queues, correct requests created on a customer’s behalf, validate complete requests, or return them with a required reason.
- Advisors and administrators can assign validated requests to active technicians and view active assignments.
- Technicians can view only their own active assignments, record work and internal service notes, update progress, and complete work with a recorded timestamp.
- The client calls the existing bearer-token API. Role checks in the interface only control navigation; the API remains responsible for authorization.
- Visitors can register a Customer account from the signed-out page. Registration links an existing unlinked customer record when email and name match, or creates a new profile; staff roles remain administrator-created.

Administrators can open **User management** from the service-centre navigation to create and manage Service Advisor, Service Technician, and Administrator accounts. Customer accounts are created through public customer registration; manual linking to an existing customer record remains available through the admin API. Customer and non-Administrator staff roles do not receive access to user management, and the API enforces the same restriction.

## Sign-in and session

The signed-out page lets customers register or calls `POST /api/auth/login` for existing accounts. Registration creates a customer profile linked to the new login and signs the customer in. `login(email, password)` and `registerCustomer(input)` return `{ accessToken, user }`; the session provider keeps the bearer token in memory and does not persist credentials in browser storage. Authenticated requests use `apiRequest(path, accessToken, options)`. A `401` from an authenticated API request clears the session and returns the user to sign-in. The API remains responsible for role and ownership enforcement.

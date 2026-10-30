# VSMMS web client

React + TypeScript + Vite client for the Vehicle Service & Maintenance Management System.

## Development

Run the Express API in one terminal from the repository root:

```sh
npm run dev
```

Run the client in another terminal:

```sh
npm --prefix client install
npm run dev:client
```

Vite proxies `/api` and `/health` requests to the Express server on port `3000` during local development. Run `npm run typecheck:client` from the repository root to check the client TypeScript sources without generating build output.

## Sprint 1 request workflows

- The role-based service-centre workspace includes a dashboard with live request and vehicle summary counts.
- Customers can submit service requests for their linked vehicles, page through their request history, and correct a rejected request before resubmitting it.
- Service advisors and administrators can search the customer list when creating a request, review paged submitted/returned queues, correct requests created on a customer’s behalf, validate complete requests, or return them with a required reason.
- The client calls the existing bearer-token API. Role checks in the interface only control navigation; the API remains responsible for authorization.

## Login and role-based access

The signed-out page provides the same login form in development and production. It calls `POST /api/auth/login` with the account email and password, shows API errors (including invalid credentials), and sets the returned `{ accessToken, user }` session only after a successful response. Passwords and bearer tokens are not persisted in browser storage. An expired or revoked token clears the in-memory session when an authenticated request returns `401`.

The client uses the authenticated user's role to show the appropriate workspace and navigation. These checks are only for presentation: API routes independently validate the bearer token, reload the active user and current role from the database, and enforce permissions. Unauthorized requests receive `401` or `403`; the client must not treat a hidden button as an authorization boundary. Authenticated API calls use `apiRequest(path, accessToken, options)`.

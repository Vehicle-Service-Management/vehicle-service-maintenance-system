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

## Login integration contract for issue #11

The full login screen remains a separate task. In Vite development mode, the signed-out page shows a small local preview sign-in form that calls the real `/api/auth/login` endpoint, so the sprint workflows can be tried before issue #11 is finished. This is not a role bypass: use existing credentials, and the API still checks the actual token, role and vehicle ownership. The development sign-in is omitted from production builds.

The issue #11 login screen can use the shared session interface without changing the request and review screens:

```tsx
import App from './App'
import { useSession } from './auth/useSession'
import { login } from './lib/api'

function LoginScreen() {
  const { setSession } = useSession()
  // On submit: setSession(await login(email, password))
  return null // Replace with the issue #11 login form.
}

// In main.tsx, inside <SessionProvider>:
<App signedOutContent={<LoginScreen />} />
```

`login(email, password)` returns `{ accessToken, user }`, matching `POST /api/auth/login`. The provider keeps the bearer token in memory and exposes `setSession` and `clearSession`; it does not persist credentials in browser storage. The login form should call `clearSession()` on sign-out and when an authenticated API call raises `ApiError` with status `401`. It should not duplicate role checks as an authorization boundary. Authenticated API calls use `apiRequest(path, accessToken, options)`.

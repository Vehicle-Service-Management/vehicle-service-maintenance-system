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
- The client calls the existing bearer-token API. Role checks in the interface only control navigation; the API remains responsible for authorization.

The client does not yet include user-administration screens. An administrator must link a customer login to a customer record through the API. The full production login screen, technician assignment, and service execution screens are separate work; the local development sign-in is described below.

## Login integration contract for issue #11

The full production login screen remains a separate task. In Vite development mode, the signed-out page shows a small local preview sign-in form that calls the real `/api/auth/login` endpoint. This is not a role bypass: use existing credentials, and the API still checks the actual token, role and vehicle ownership. The development sign-in is omitted from production builds.

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

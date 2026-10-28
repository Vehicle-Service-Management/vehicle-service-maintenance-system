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

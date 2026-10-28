import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionProvider } from './auth/SessionContext'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
)

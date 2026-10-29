import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/shared/ErrorBoundary.tsx'

// The operator page (hosted mode) is its own small app with its own sign-in, loaded only at /operator
const OperatorPage = lazy(() => import('./components/pages/Operator.tsx'))
const operator = /^\/operator\/?$/.test(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {operator ? <Suspense fallback={null}><OperatorPage /></Suspense> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { CloudProvider } from './contexts/CloudContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudProvider>
      <App />
    </CloudProvider>
  </StrictMode>,
)

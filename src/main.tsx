import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './runtime-config'
import { initializeReactDevTools } from './development/reactDevTools.ts'

await initializeReactDevTools()

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('PaperBridge root element is missing')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

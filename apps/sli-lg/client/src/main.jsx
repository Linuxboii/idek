import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@spacelink/whatsapp-crm/tokens.css'
import { configureCrm } from '@spacelink/whatsapp-crm'
import {
  WHATSAPP_API_BASE_URL,
  WHATSAPP_WS_BASE_URL,
  WHATSAPP_ADMIN_TOKEN,
} from './config/endpoints.js'
import './index.css'
import App from './App.jsx'

configureCrm({
  apiBaseUrl: WHATSAPP_API_BASE_URL,
  wsBaseUrl: WHATSAPP_WS_BASE_URL,
  getToken: () => WHATSAPP_ADMIN_TOKEN,
  onUnauthorized: () => {
    console.warn('[whatsapp-crm] 401 from wa-slilg backend')
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

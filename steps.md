# WhatsApp CRM Chat Drawer — Integration Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed the WhatsApp CRM chat UI as a slide-in drawer in the host React app, so clicking "Chat" on any customer opens their WhatsApp conversation without leaving the page.

**Architecture:** Six CRM components are copied from the source project into `src/whatsapp-crm/`. A new `WhatsAppDrawer` component handles silent JWT login to the CRM backend, resolves a customer's phone number to a lead ID, and renders `ChatPanel` inside a fixed right-side drawer. A shared `crmState.js` module holds the token so both `api.js` and `ws.js` can read it without touching the host app's localStorage.

**Tech Stack:** React (Vite), axios, TailwindCSS, FastAPI backend at `https://wa-slilg.avlokai.com`

**Backend repo:** `https://github.com/Sushanth-Kasturi/n8n-python` (or wherever deployed)

---

## Context: What the WhatsApp CRM backend does

The backend is a FastAPI app running at `https://wa-slilg.avlokai.com`. It handles inbound WhatsApp messages, stores leads + message history in PostgreSQL, and exposes a REST + WebSocket API for agents to manage conversations.

Key endpoints used by this integration:
- `POST /api/auth/login` — email + password → `access_token` (JWT, 8h)
- `GET /api/conversations?phone=<phone>` — returns list of leads; use first result to get `lead.id`
- `GET /api/conversations/{lead_id}` — full message history + lead metadata
- `POST /api/chat/{lead_id}/send-text` — agent sends text message
- `POST /api/chat/{lead_id}/send-media` — agent sends media (multipart)
- `PUT /api/leads/{lead_id}/takeover` — pause AI for 12h
- `DELETE /api/leads/{lead_id}/takeover` — resume AI immediately
- `GET /api/media/{media_id}` — proxy download of WA media
- `GET /ws?token=<jwt>` — WebSocket for real-time events (`new_message`, `takeover`, `resume_ai`)

All protected endpoints require `Authorization: Bearer <access_token>` header.

A conversation object looks like:
```json
{
  "lead": {
    "id": "uuid",
    "phone": "+91XXXXXXXXXX",
    "name": "Ravi Kumar",
    "score": 85,
    "ai_active": true,
    "ai_paused_until": null,
    "assigned_to": null
  },
  "messages": [
    {
      "id": "uuid",
      "sender": "lead",
      "message_text": "Hi I'm interested",
      "message_type": "text",
      "media_url": null,
      "created_at": "2026-05-15T10:00:00Z"
    }
  ]
}
```

---

## Task 1: Backend — Add phone filter to conversations endpoint

**Files (in backend repo `n8n-python`):**
- Modify: `app/db.py` — `list_conversations` function
- Modify: `app/crm_api.py` — `list_conversations` endpoint

### Why
Currently `GET /api/conversations` only supports `limit`/`offset`. The host app needs to look up a lead by phone number. Without this filter, it would have to fetch all leads and scan client-side.

- [ ] **Step 1: Edit `app/db.py` — add phone filter to `list_conversations`**

Find the function at line ~351. Replace it entirely:

```python
async def list_conversations(
    limit: int = 50,
    offset: int = 0,
    phone: str | None = None,
) -> list[dict]:
    if phone:
        q = """
        SELECT
            l.id::text, l.phone, l.name, l.score,
            l.ai_paused_until, l.unread_count,
            l.assigned_to::text,
            u.name AS assigned_agent_name,
            m.message_text AS last_message,
            m.created_at   AS last_message_at
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_to
        LEFT JOIN LATERAL (
            SELECT message_text, created_at FROM messages
            WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
        ) m ON TRUE
        WHERE l.phone = $1
        ORDER BY COALESCE(m.created_at, l.created_at) DESC
        LIMIT $2 OFFSET $3;
        """
        args = (phone, limit, offset)
    else:
        q = """
        SELECT
            l.id::text, l.phone, l.name, l.score,
            l.ai_paused_until, l.unread_count,
            l.assigned_to::text,
            u.name AS assigned_agent_name,
            m.message_text AS last_message,
            m.created_at   AS last_message_at
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_to
        LEFT JOIN LATERAL (
            SELECT message_text, created_at FROM messages
            WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
        ) m ON TRUE
        ORDER BY COALESCE(m.created_at, l.created_at) DESC
        LIMIT $1 OFFSET $2;
        """
        args = (limit, offset)

    async with pool().acquire() as con:
        rows = await con.fetch(q, *args)
        out = []
        for r in rows:
            d = dict(r)
            d["ai_active"] = (
                d["ai_paused_until"] is None
                or d["ai_paused_until"] < datetime.now(timezone.utc)
            )
            if d["ai_paused_until"]:
                d["ai_paused_until"] = d["ai_paused_until"].isoformat()
            if d["last_message_at"]:
                d["last_message_at"] = d["last_message_at"].isoformat()
            out.append(d)
        return out
```

- [ ] **Step 2: Edit `app/crm_api.py` — expose `?phone=` query param**

Find `@router.get("/conversations")` (around line 87). Replace the endpoint:

```python
@router.get("/conversations")
async def list_conversations(
    phone: str | None = None,
    limit: int = 50,
    offset: int = 0,
    _user=Depends(get_current_user),
):
    return await db.list_conversations(limit=limit, offset=offset, phone=phone)
```

- [ ] **Step 3: Restart backend and verify with curl**

```bash
# First get a token
TOKEN=$(curl -s -X POST https://wa-slilg.avlokai.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Test phone filter (use a real phone in your DB)
curl -s "https://wa-slilg.avlokai.com/api/conversations?phone=%2B91XXXXXXXXXX" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: array with 0 or 1 lead objects.

- [ ] **Step 4: Commit backend change**

```bash
git add app/db.py app/crm_api.py
git commit -m "feat: add phone filter to GET /api/conversations"
```

---

## Task 2: Host app — Install dependency and add credentials

**Files (in host app):**
- Modify: `package.json` (via npm install)
- Create/modify: secure deployment secrets for CRM credentials

- [ ] **Step 1: Install axios**

```bash
npm install axios
```

- [ ] **Step 2: Configure CRM credentials as deployment secrets**

```env
VITE_CRM_EMAIL=agent@yourdomain.com
VITE_CRM_PASSWORD=agentpassword
```

These are the credentials of a dedicated CRM agent account (not admin). The token is stored in memory only — never written to localStorage or cookies.

---

## Task 3: Create `src/whatsapp-crm/crmState.js`

**Files:**
- Create: `src/whatsapp-crm/crmState.js`

This module holds the CRM JWT token in a module-level variable so both `api.js` and `ws.js` can access it without touching the host app's localStorage.

- [ ] **Step 1: Create the file**

```js
// src/whatsapp-crm/crmState.js
export let crmToken = null
export function setCrmToken(t) { crmToken = t }
export function clearCrmToken() { crmToken = null }
```

---

## Task 4: Create `src/whatsapp-crm/api.js`

**Files:**
- Create: `src/whatsapp-crm/api.js`

Adapted from the original CRM `api.js`. Key differences:
- Reads token from `crmState.js` instead of localStorage
- Hardcodes the CRM API base URL
- On 401: clears token (lets `WhatsAppDrawer` retry login) — does NOT redirect to `/login`

- [ ] **Step 1: Create the file**

```js
// src/whatsapp-crm/api.js
import axios from 'axios'
import { crmToken, clearCrmToken } from './crmState'

const BASE = 'https://wa-slilg.avlokai.com'

const api = axios.create({ baseURL: `${BASE}/api` })

api.interceptors.request.use(cfg => {
  if (crmToken) cfg.headers.Authorization = `Bearer ${crmToken}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) clearCrmToken()
    return Promise.reject(err)
  }
)

export const conversationsApi = {
  list: (params = {}) => api.get('/conversations', { params }),
  get: (id) => api.get(`/conversations/${id}`),
}

export const leadsApi = {
  takeover: (id) => api.put(`/leads/${id}/takeover`),
  resumeAI: (id) => api.delete(`/leads/${id}/takeover`),
  assign: (id, agentId) => api.put(`/leads/${id}/assign`, null, { params: { agent_id: agentId } }),
}

export const chatApi = {
  sendText: (leadId, text) => api.post(`/chat/${leadId}/send-text`, { text }),
  sendMedia: (leadId, file, caption = '') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('caption', caption)
    return api.post(`/chat/${leadId}/send-media`, fd)
  },
}

export const mediaUrl = (mediaId) =>
  `${BASE}/api/media/${mediaId}`

export default api
```

---

## Task 5: Create `src/whatsapp-crm/ws.js`

**Files:**
- Create: `src/whatsapp-crm/ws.js`

Adapted from the original. Key differences:
- Reads token from `crmState.js` instead of localStorage
- Hardcodes the CRM WebSocket base URL
- Does NOT auto-reconnect indefinitely (closes cleanly when drawer unmounts)

- [ ] **Step 1: Create the file**

```js
// src/whatsapp-crm/ws.js
import { useCallback, useEffect, useRef } from 'react'
import { crmToken } from './crmState'

const CRM_WS_BASE = 'wss://wa-slilg.avlokai.com'

export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const retryCount = useRef(0)
  const onMsgRef = useRef(onMessage)
  onMsgRef.current = onMessage

  const connect = useCallback(() => {
    if (!crmToken) return null

    const socket = new WebSocket(`${CRM_WS_BASE}/ws?token=${crmToken}`)

    socket.onopen = () => { retryCount.current = 0 }

    socket.onmessage = (e) => {
      try { onMsgRef.current(JSON.parse(e.data)) } catch { /* ignore bad JSON */ }
    }

    socket.onclose = () => {
      if (retryCount.current >= 5) return
      const delay = Math.min(1000 * 2 ** retryCount.current, 30000)
      retryCount.current++
      setTimeout(connect, delay)
    }

    ws.current = socket
    return socket
  }, [])

  useEffect(() => {
    const socket = connect()
    return () => {
      retryCount.current = 99  // prevent reconnect on unmount
      socket?.close()
      ws.current = null
    }
  }, [connect])

  const subscribe = useCallback((leadId) => {
    ws.current?.send(JSON.stringify({ action: 'subscribe', lead_id: leadId }))
  }, [])

  const unsubscribe = useCallback((leadId) => {
    ws.current?.send(JSON.stringify({ action: 'unsubscribe', lead_id: leadId }))
  }, [])

  return { subscribe, unsubscribe }
}
```

---

## Task 6: Copy CRM components into host app

**Files:**
- Create: `src/whatsapp-crm/MessageBubble.jsx`
- Create: `src/whatsapp-crm/TakeoverBanner.jsx`
- Create: `src/whatsapp-crm/MediaUpload.jsx`
- Create: `src/whatsapp-crm/ChatPanel.jsx`

Copy these files from the source project (`n8n-python/frontend/src/components/`).
After copying, update the import in each file that references `'../api'` → `'./api'`.

**Source locations:**
- `n8n-python/frontend/src/components/MessageBubble.jsx` → `src/whatsapp-crm/MessageBubble.jsx`
- `n8n-python/frontend/src/components/TakeoverBanner.jsx` → `src/whatsapp-crm/TakeoverBanner.jsx`
- `n8n-python/frontend/src/components/MediaUpload.jsx` → `src/whatsapp-crm/MediaUpload.jsx`
- `n8n-python/frontend/src/components/ChatPanel.jsx` → `src/whatsapp-crm/ChatPanel.jsx`

- [ ] **Step 1: Copy all four component files into `src/whatsapp-crm/`**

- [ ] **Step 2: In `ChatPanel.jsx` — fix the import path**

Find:
```js
import { chatApi, conversationsApi, leadsApi } from '../api'
import MediaUpload from './MediaUpload'
import MessageBubble from './MessageBubble'
import TakeoverBanner from './TakeoverBanner'
```

Replace with:
```js
import { chatApi, conversationsApi, leadsApi } from './api'
import MediaUpload from './MediaUpload'
import MessageBubble from './MessageBubble'
import TakeoverBanner from './TakeoverBanner'
```

- [ ] **Step 3: Check `TakeoverBanner.jsx`, `MessageBubble.jsx`, `MediaUpload.jsx` for any `'../api'` imports**

If any exist, change them to `'./api'`. (Likely only ChatPanel has the api import.)

- [ ] **Step 4: Verify the directory looks correct**

```
src/whatsapp-crm/
  crmState.js
  api.js
  ws.js
  ChatPanel.jsx
  MessageBubble.jsx
  TakeoverBanner.jsx
  MediaUpload.jsx
```

---

## Task 7: Create `src/whatsapp-crm/WhatsAppDrawer.jsx`

**Files:**
- Create: `src/whatsapp-crm/WhatsAppDrawer.jsx`

This is the main integration component. It:
1. Silently logs in to the CRM backend using env-var credentials
2. Looks up the lead by phone number
3. Renders `ChatPanel` inside a fixed right-side drawer

- [ ] **Step 1: Create the file**

```jsx
// src/whatsapp-crm/WhatsAppDrawer.jsx
import { useEffect, useState } from 'react'
import { setCrmToken, clearCrmToken, crmToken } from './crmState'
import { conversationsApi } from './api'
import ChatPanel from './ChatPanel'

const CRM_BASE = 'https://wa-slilg.avlokai.com'

async function ensureCrmToken() {
  if (crmToken) return
  const res = await fetch(`${CRM_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: import.meta.env.VITE_CRM_EMAIL,
      password: import.meta.env.VITE_CRM_PASSWORD,
    }),
  })
  if (!res.ok) throw new Error(`CRM login failed (${res.status})`)
  const data = await res.json()
  setCrmToken(data.access_token)
}

// state: 'idle' | 'loading' | 'ready' | 'not_found' | 'error'

export default function WhatsAppDrawer({ phone, customerName, open, onClose }) {
  const [status, setStatus] = useState('idle')
  const [lead, setLead] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!open || !phone) return

    let cancelled = false
    setStatus('loading')
    setLead(null)

    async function load() {
      try {
        await ensureCrmToken()
        const { data } = await conversationsApi.list({ phone, limit: 1 })
        if (cancelled) return
        const found = Array.isArray(data) ? data[0] : data?.items?.[0]
        if (!found) {
          setStatus('not_found')
        } else {
          setLead(found)
          setStatus('ready')
        }
      } catch (err) {
        if (cancelled) return
        clearCrmToken()
        setErrorMsg(err.message || 'Failed to connect to WhatsApp CRM')
        setStatus('error')
      }
    }

    load()
    return () => { cancelled = true }
  }, [open, phone, retryKey])

  useEffect(() => {
    if (!open) {
      setStatus('idle')
      setLead(null)
    }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-green-600 text-white flex-shrink-0">
          <div>
            <div className="font-semibold text-sm">{customerName || phone}</div>
            <div className="text-xs opacity-75">{phone}</div>
          </div>
          <button
            onClick={onClose}
            className="text-white text-2xl font-light leading-none hover:opacity-70"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {status === 'loading' && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Loading conversation…
            </div>
          )}

          {status === 'not_found' && (
            <div className="flex-1 flex items-center justify-center px-6 text-center text-gray-400 text-sm">
              No WhatsApp conversation found for {phone}
            </div>
          )}

          {status === 'error' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-red-500 text-sm">{errorMsg}</p>
              <button
                onClick={() => setRetryKey(k => k + 1)}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                Retry
              </button>
            </div>
          )}

          {status === 'ready' && lead && (
            <ChatPanel lead={lead} />
          )}
        </div>
      </div>
    </>
  )
}
```

---

## Task 8: Wire `WhatsAppDrawer` into the host app's customer list

**Files:**
- Modify: whichever component in the host app renders the customer table/list with phone, name, intent columns (e.g. `src/pages/Customers.jsx` or `src/components/LeadTable.jsx` — check the actual file)

- [ ] **Step 1: Add import at top of the customer list component**

```jsx
import { useState } from 'react'
import WhatsAppDrawer from '../whatsapp-crm/WhatsAppDrawer'
```

(Adjust relative path based on where the customer list file lives.)

- [ ] **Step 2: Add drawer state inside the component**

```jsx
const [chatPhone, setChatPhone] = useState(null)
const [chatName, setChatName] = useState('')
```

- [ ] **Step 3: Add "Chat" button to each customer row**

In the JSX where customer rows are rendered, add:

```jsx
<button
  onClick={() => {
    setChatPhone(customer.phone)    // must be E.164 format e.g. +91XXXXXXXXXX
    setChatName(customer.name || customer.phone)
  }}
  className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
>
  Chat
</button>
```

- [ ] **Step 4: Add `WhatsAppDrawer` at bottom of the component's return**

```jsx
<WhatsAppDrawer
  phone={chatPhone}
  customerName={chatName}
  open={!!chatPhone}
  onClose={() => setChatPhone(null)}
/>
```

- [ ] **Step 5: Verify phone format**

The phone number passed to `WhatsAppDrawer` must match the format stored in the WhatsApp leads table. The backend stores numbers as received from WhatsApp Cloud API — typically E.164 format (`+91XXXXXXXXXX`). If the host app stores phone numbers differently (e.g. without `+`, or with spaces), normalise before passing:

```js
// Example normaliser if host app stores "91XXXXXXXXXX" without +
const normalisePhone = (p) => p.startsWith('+') ? p : `+${p}`
setChatPhone(normalisePhone(customer.phone))
```

---

## Task 9: Ensure TailwindCSS covers `src/whatsapp-crm/`

**Files:**
- Modify: `tailwind.config.js` (or `tailwind.config.cjs`) in host app

- [ ] **Step 1: Verify `content` array includes `src/whatsapp-crm/**`**

Open `tailwind.config.js`. The `content` array must include:

```js
content: [
  './index.html',
  './src/**/*.{js,jsx,ts,tsx}',   // this glob already covers whatsapp-crm/
]
```

If the glob `./src/**/*.{js,jsx,ts,tsx}` is already present, no change needed — it covers `src/whatsapp-crm/` automatically.

If the config uses explicit paths, add:
```js
'./src/whatsapp-crm/**/*.{js,jsx}'
```

---

## Task 10: Smoke test end-to-end

- [ ] **Step 1: Start host app dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open a customer in the UI that has a WhatsApp conversation**

Click the "Chat" button. Expected:
1. Drawer slides in from right
2. Header shows customer name + phone
3. Body shows "Loading conversation…" briefly
4. Chat history appears (messages from WhatsApp lead)
5. Text input at bottom is functional — type and send

- [ ] **Step 3: Test "not found" case**

Click "Chat" for a customer whose phone number is NOT in the WhatsApp leads table. Expected:
- "No WhatsApp conversation found for +91..." message

- [ ] **Step 4: Test "Take Over" button**

In the chat header, click "Take Over". Expected:
- AI Active badge → Human badge
- TakeoverBanner shows "AI paused for 12 hours"

- [ ] **Step 5: Test close**

Click × or click backdrop. Drawer closes. Re-open same customer — chat reloads.

---

## File checklist (host app additions)

| File | Action |
|---|---|
| `src/whatsapp-crm/crmState.js` | Create |
| `src/whatsapp-crm/api.js` | Create |
| `src/whatsapp-crm/ws.js` | Create |
| `src/whatsapp-crm/ChatPanel.jsx` | Copy + fix import |
| `src/whatsapp-crm/MessageBubble.jsx` | Copy |
| `src/whatsapp-crm/TakeoverBanner.jsx` | Copy |
| `src/whatsapp-crm/MediaUpload.jsx` | Copy |
| `src/whatsapp-crm/WhatsAppDrawer.jsx` | Create |
| `.env` | Add 3 CRM vars |
| Customer list component | Add drawer state + button + `<WhatsAppDrawer>` |

## Backend change (n8n-python repo)

| File | Change |
|---|---|
| `app/db.py` | `list_conversations` — add optional `phone` param + conditional WHERE clause |
| `app/crm_api.py` | `list_conversations` endpoint — add `phone: str \| None = None` query param |

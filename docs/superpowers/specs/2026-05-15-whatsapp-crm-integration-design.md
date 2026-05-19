# WhatsApp CRM Integration — Design Spec
Date: 2026-05-15

## Problem
The other React project (hereafter "host app") displays customer phone numbers, names, and sales intent. Users need to click "Chat" and interact with that customer's WhatsApp conversation without leaving the page.

## Solution
Embed the WhatsApp CRM chat UI as a slide-in drawer in the host app. Components are copied from this project into a `src/whatsapp-crm/` subdirectory. A new `WhatsAppDrawer` component handles auth, lead lookup, and renders `ChatPanel`.

---

## Architecture

### Host App Changes
- New directory: `src/whatsapp-crm/` containing copied + adapted CRM components
- New component: `WhatsAppDrawer` — drawer shell, auth bridge, phone→lead resolution, ChatPanel render
- New env vars: `VITE_CRM_API_BASE_URL`, `VITE_CRM_EMAIL`, `VITE_CRM_PASSWORD`
- New dep: `axios` (if not already present)

### Backend Changes (this project — wa-slilg.avlokai.com)
- `crm_api.py`: add optional `?phone=` query param to `GET /api/conversations`

---

## File Structure

```
src/whatsapp-crm/
  api.js              # CRM-specific axios instance (module-level token cache, no window.location redirect)
  ws.js               # WebSocket hook (copied as-is)
  ChatPanel.jsx       # Full chat panel (copied as-is)
  MessageBubble.jsx   # Message rendering (copied as-is)
  TakeoverBanner.jsx  # Human takeover status (copied as-is)
  MediaUpload.jsx     # File upload button (copied as-is)
  WhatsAppDrawer.jsx  # NEW — drawer + auth bridge + lead lookup
```

---

## Component API

### WhatsAppDrawer

```jsx
<WhatsAppDrawer
  phone="+91XXXXXXXXXX"   // customer phone from host app
  customerName="Ravi Kumar"
  open={bool}
  onClose={() => {}}
/>
```

**Internal state machine:**
```
idle → loading → ready      (auth ok, lead found → render ChatPanel)
               → not_found  (lead not in WhatsApp system)
               → error      (network/auth failure → show retry)
```

**Drawer UX:**
- `position: fixed`, right edge, full viewport height, width 420px
- Slides in with CSS transition
- Header: customer name + phone + close (×) button
- Body: ChatPanel fills remaining height
- Loading: spinner centered
- Not found: "No WhatsApp conversation found for this number"
- Error: error message + Retry button

---

## Auth Bridge

CRM JWT is stored in a **module-level variable** inside `src/whatsapp-crm/api.js` — not in localStorage — to avoid colliding with the host app's own auth tokens.

**Flow on drawer open:**
1. Check `crmToken` module var — if set, skip to step 4
2. `POST /api/auth/login` with `{email: VITE_CRM_EMAIL, password: VITE_CRM_PASSWORD}`
3. Store `access_token` in `crmToken` module var
4. `GET /api/conversations?phone=<phone>` — find matching lead
5. Pass lead object to ChatPanel
6. On 401 mid-session: clear `crmToken`, retry from step 2 once

**Security note:** CRM credentials are build-time env vars (`VITE_CRM_EMAIL` / `VITE_CRM_PASSWORD`). The account used should be a dedicated read-write agent account, not admin. Tokens are never written to localStorage or cookies.

---

## Backend Change — Phone Filter

**File:** `app/crm_api.py`

Add optional `phone` query parameter to `GET /api/conversations`:

```python
@router.get("/conversations")
async def list_conversations(
    phone: str | None = None,   # filter by exact phone number
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
```

When `phone` is provided, filter the query: `WHERE leads.phone = $phone`. Return as list (empty list = not_found). Existing callers (no phone param) are unaffected.

---

## WebSocket Lifecycle

- Connect when drawer opens (lead resolved)
- Subscribe to `lead.id` channel
- Disconnect when drawer closes (`onClose` callback)
- Prevents background socket drain when drawer is idle

---

## Env Vars (host app)

```env
VITE_CRM_API_BASE_URL=https://wa-slilg.avlokai.com
VITE_CRM_EMAIL=<crm agent email>
VITE_CRM_PASSWORD=<crm agent password>
```

---

## Dependencies (host app)

```bash
npm install axios
```

No other new deps. `ws.js` uses native browser `WebSocket`. Components use React only.

---

## Integration Usage (host app)

In the customer list component wherever "Chat" button exists:

```jsx
import WhatsAppDrawer from '../whatsapp-crm/WhatsAppDrawer'

const [drawerPhone, setDrawerPhone] = useState(null)
const [drawerName, setDrawerName] = useState('')

// In customer row:
<button onClick={() => { setDrawerPhone(customer.phone); setDrawerName(customer.name) }}>
  Chat
</button>

<WhatsAppDrawer
  phone={drawerPhone}
  customerName={drawerName}
  open={!!drawerPhone}
  onClose={() => setDrawerPhone(null)}
/>
```

---

## Change Summary

| Location | Change |
|---|---|
| Host app — `src/whatsapp-crm/` | 6 copied files + 1 new (`WhatsAppDrawer.jsx`) |
| Host app — `.env` | 3 new vars |
| Host app — `package.json` | `axios` dependency |
| Host app — customer list component | `WhatsAppDrawer` wired to "Chat" button |
| This backend — `app/crm_api.py` | `?phone=` filter on `GET /api/conversations` |

---

## Out of Scope
- Shared user accounts between host app and CRM (each system has own auth)
- ConversationList sidebar inside drawer (direct lead open only)
- Admin panel / user management inside host app

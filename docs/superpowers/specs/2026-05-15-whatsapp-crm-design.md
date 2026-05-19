# WhatsApp CRM — Design Spec
**Date:** 2026-05-15  
**Project:** n8n-python (expand existing)  
**Status:** Approved

---

## Overview

Expand the existing FastAPI/PostgreSQL/WhatsApp Cloud API backend into a full CRM with:
- Multi-agent human chat interface (admin + clerk roles)
- Real-time WebSocket message delivery
- AI auto-pilot with human takeover (12h timer, manual resume)
- Media pass-through (images, audio, video, documents)
- Reusable via `.env` — new client = new config, same codebase

---

## Architecture

**Approach A — Monolith expansion** (chosen).  
Single FastAPI process, same DB, same PM2 deploy. WebSocket manager lives in-process. No additional infra (no Redis, no second service).

```
WhatsApp Cloud API
        │  webhook POST /webhook
        ▼
   FastAPI app (main.py)
        │
        ├── pipeline.py        (AI guard → AI reply OR skip)
        ├── crm_api.py         (CRM/chat/admin REST + WS endpoint)
        ├── templates_api.py   (existing broadcast)
        ├── ws_manager.py      (in-memory channel map)
        └── auth.py            (JWT, bcrypt)
              │
         PostgreSQL
              │
     React + Vite frontend
     (served /static or separate dev server)
```

---

## Database Changes

### New table: `users`
```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'clerk')),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### New columns on `leads`
```sql
ALTER TABLE leads
    ADD COLUMN ai_paused_until  TIMESTAMPTZ,
    ADD COLUMN ai_paused_by     UUID REFERENCES users(id),
    ADD COLUMN assigned_to      UUID REFERENCES users(id),
    ADD COLUMN unread_count     INT NOT NULL DEFAULT 0;
```

### New columns on `messages`
```sql
ALTER TABLE messages
    ADD COLUMN sent_by    UUID REFERENCES users(id),  -- NULL = AI or inbound customer
    ADD COLUMN media_type TEXT,                        -- text/image/audio/video/document
    ADD COLUMN media_id   TEXT;                        -- WA media_id (ephemeral, no archive)
```

Migration file: `schema_crm.sql`

---

## Auth

- **Library:** python-jose (JWT) + passlib (bcrypt)
- **Access token:** 8h expiry, signed with `JWT_SECRET`
- **Refresh token:** 7d expiry, stored client-side in httpOnly cookie
- **Endpoints:**
  - `POST /api/auth/login` → `{access_token, refresh_token}`
  - `POST /api/auth/refresh` → `{access_token}`
- **Guards:**
  - `Depends(get_current_user)` — all CRM routes
  - `Depends(require_admin)` — user management, agent assignment

---

## WebSocket

**Endpoint:** `GET /ws?token=<jwt>`

**In-memory channel map** (`ws_manager.py`):
```python
channels: Dict[str, Set[WebSocket]]  # lead_id → connected clients
```

**Broadcast events (JSON):**
```json
{
  "event": "new_message",
  "lead_id": "uuid",
  "message": {
    "id": "uuid", "role": "user|assistant|agent",
    "message_text": "...", "media_type": null, "media_id": null,
    "sent_by_name": null, "created_at": "iso"
  }
}
```
```json
{"event": "takeover", "lead_id": "uuid", "paused_until": "iso", "by": "agent name"}
{"event": "resume_ai", "lead_id": "uuid"}
{"event": "lead_updated", "lead_id": "uuid", "unread_count": 3}
```

Dead socket handling: remove from channel map on `WebSocketDisconnect` or failed send.

---

## Human Takeover + AI Guard

### Pipeline guard (`pipeline.py`)
```python
lead = await db.get_lead_state(wa_id)
if lead and lead["ai_paused_until"] and lead["ai_paused_until"] > datetime.utcnow():
    await db.insert_message(lead_id, "user", final_message)
    await db.increment_unread(lead_id)
    await ws_manager.broadcast(lead_id, new_message_event(...))
    return  # skip AI
```

### Takeover triggers
Both paths call `db.set_takeover(lead_id, agent_id)`:
1. `PUT /api/leads/{id}/takeover` — explicit "Take Over" button
2. Any agent message send — implicit takeover + timer reset

`db.set_takeover`:
```sql
UPDATE leads SET
    ai_paused_until = NOW() + INTERVAL '12 hours',
    ai_paused_by = $2
WHERE id = $1;
```

### Resume AI
`DELETE /api/leads/{id}/takeover`:
```sql
UPDATE leads SET ai_paused_until = NULL, ai_paused_by = NULL WHERE id = $1;
```
Broadcasts `resume_ai` event to all WS clients on that lead.

---

## Media Send Flow

1. Agent picks file in `MediaUpload.jsx`
2. `POST /api/chat/{lead_id}/send-media` (multipart: `file`, `caption`)
3. Backend: upload bytes → WhatsApp Media Upload API → get `media_id`
4. Backend: call WhatsApp Send Message API with `media_id` + type
5. Store `messages` row: `role='agent'`, `media_type`, `media_id`, `sent_by=agent_id`
6. Broadcast `new_message` WS event (includes `media_type` + `media_id`)
7. Frontend renders preview using `media_id` (WA media URL fetched on demand)

No local file storage. No S3. Pass-through only.

**Supported types:** image, audio, video, document (PDF, etc.)

---

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Email + password → tokens |
| POST | `/api/auth/refresh` | cookie | New access token |

### Conversations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/conversations` | any | Paginated lead list + unread + AI status |
| GET | `/api/conversations/{id}` | any | Lead detail + full message history |
| PUT | `/api/leads/{id}/takeover` | any | Pause AI, start 12h timer |
| DELETE | `/api/leads/{id}/takeover` | any | Resume AI |
| PUT | `/api/leads/{id}/assign` | admin | Assign to agent |

### Messaging
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/chat/{id}/send-text` | any | Agent sends text message |
| POST | `/api/chat/{id}/send-media` | any | Agent sends media (multipart) |

### Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | admin | List agents |
| POST | `/api/users` | admin | Create agent |
| PUT | `/api/users/{id}` | admin | Update role/name |
| DELETE | `/api/users/{id}` | admin | Deactivate agent |

### WebSocket
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ws?token=<jwt>` | Subscribe to real-time events |

---

## Frontend Structure

```
frontend/src/
  App.jsx                    — router, auth guard, WS context provider
  ws.js                      — useWebSocket hook, auto-reconnect w/ backoff
  api.js                     — axios + token refresh interceptor
  pages/
    Login.jsx                — email/password form
    Dashboard.jsx            — layout shell (sidebar + chat panel)
    AdminUsers.jsx           — admin-only agent CRUD
  components/
    ConversationList.jsx     — left sidebar: search, filter (AI/Human/Unread),
                               lead rows with unread badge + status pill
    ChatPanel.jsx            — right panel: message thread + input bar
    MessageBubble.jsx        — renders text/image/audio/video/document/file
    TakeoverBanner.jsx       — "AI paused until HH:MM · Resume AI" bar
    MediaUpload.jsx          — file picker + drag-drop
    AgentBadge.jsx           — assigned agent chip
    UserManagement.jsx       — admin agent table + create/edit modal
```

**Layout:** WhatsApp Web-style. Left sidebar = conversation list. Right = full chat. TakeoverBanner appears at top of ChatPanel when `ai_paused_until` is set. Input bar has paperclip icon for media.

---

## New Backend Files

| File | Purpose |
|------|---------|
| `app/auth.py` | JWT issue/verify, bcrypt hash/verify, FastAPI dependencies |
| `app/ws_manager.py` | WebSocket channel map, broadcast, disconnect cleanup |
| `app/crm_api.py` | All new CRM + chat + admin router |
| `schema_crm.sql` | `users` table + `leads`/`messages` ALTER statements |

## Modified Backend Files

| File | Change |
|------|--------|
| `app/pipeline.py` | Add AI guard check at top of `handle_message` |
| `app/db.py` | Add takeover CRUD, user CRUD, conversation queries, unread increment |
| `app/config.py` | Add `JWT_SECRET`, `BUSINESS_NAME` settings |
| `app/main.py` | Include `crm_api` router, mount `/ws` endpoint |

---

## Reusability

New client checklist:
1. Copy repo
2. Fill `.env`:
   ```
   WA_PHONE_ID=
   WA_TOKEN=
   WA_VERIFY_TOKEN=
   WA_BUSINESS_ACCOUNT_ID=
   OPENAI_API_KEY=
   DATABASE_URL=
   JWT_SECRET=
   BUSINESS_NAME=
   VITE_API_BASE_URL=
   ```
3. Edit `app/prompts.py` — system prompt for new domain
4. Edit `app/extractor.py` — domain-specific lead field extraction
5. Run `psql -f schema.sql && psql -f schema_templates.sql && psql -f schema_crm.sql`
6. `pm2 start ecosystem.config.js`

---

## Error Handling

- JWT expired → 401, frontend auto-refreshes via interceptor
- WA API failure on media upload → 502 with message, no partial state written
- WebSocket disconnect → removed from channel map, client reconnects with backoff
- AI guard: any exception in check → log + let AI proceed (fail open, not silent)
- Agent send to unknown lead → 404

---

## Security Notes

- Passwords hashed with bcrypt (cost 12)
- JWT secret via env, never hardcoded
- Media bytes never written to disk — streamed directly to WA API
- Admin endpoints enforce role at dependency level, not just convention
- WA webhook verify token checked on every `GET /webhook`

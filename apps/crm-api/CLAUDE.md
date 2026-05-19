# crm-api — WhatsApp Sales Agent (FastAPI backend)

> Part of the Spacelink monorepo. See repo root `CLAUDE.md` for layout. This file covers the FastAPI backend only.

## Overview
Python/FastAPI port of the n8n WhatsApp sales agent workflow. Handles inbound WhatsApp messages, AI-powered lead qualification, Google Calendar scheduling, template broadcasting, and the CRM REST + WebSocket API.

## Stack
- **Runtime**: Python 3.11+ / FastAPI / Uvicorn
- **Database**: PostgreSQL (asyncpg)
- **AI**: OpenAI (GPT-4o-mini + Whisper)
- **Integrations**: WhatsApp Cloud API, Google Calendar API
- **Auth**: JWT (8h access, 7d refresh) + bcrypt
- **Deploy**: PM2 on VPS, Cloudflare Tunnel

## Project Structure
- `app/` — Application package
  - `main.py` — FastAPI app, webhook routes, CORS, lifespan, `/ws` endpoint, static file mount (optional)
  - `config.py` — Pydantic Settings (env vars)
  - `db.py` — Async DB layer (asyncpg pool); template + CRM CRUD, takeover/timer logic, unread counts
  - `pipeline.py` — Message processing orchestrator (AI guard, WS broadcasts on all reply paths)
  - `whatsapp.py` — WhatsApp Cloud API client (send text/template/media, upload_media, fetch templates)
  - `openai_client.py` — OpenAI chat + transcription
  - `calendar_client.py` — Google Calendar + Meet
  - `extraction.py` — Lead qualification extraction
  - `prompts.py` — System prompt templates
  - `templates_api.py` — Template broadcast REST + template list endpoint
  - `auth.py` — JWT + bcrypt + FastAPI deps
  - `ws_manager.py` — In-memory channel map (asyncio.Lock, async disconnect)
  - `crm_api.py` — CRM REST router (auth, users, conversations, takeover, send-text/media, media proxy)
  - `static/` — Admin UI (HTML/CSS/JS, legacy)
- `schema.sql` — Leads + messages tables
- `schema_templates.sql` — Template jobs + sends tables
- `schema_crm.sql` — Users table, CRM columns on leads/messages, indexes
- `seed_admin.py` — Seed first admin user

## API Endpoints

### Webhook + Broadcast
- `GET /webhook` — WhatsApp verification
- `POST /webhook` — Inbound messages + delivery status callbacks
- `GET /api/templates` — Fetch approved templates from Meta Graph API
- `POST /api/send-template` — Bulk send template messages (auth required)
- `GET /api/jobs` — List broadcast jobs with delivery summary
- `GET /api/jobs/{job_id}` — Job detail with per-recipient status
- `GET /healthz` — Health check
- `GET /admin` — Legacy admin UI (served from static dir)

### CRM (JWT Bearer auth required)
- `POST /api/auth/login` — email + password → access_token + refresh_token
- `GET  /api/conversations` — paginated lead list + unread count + AI status
- `GET  /api/conversations/{id}` — lead detail + full message history (clears unread)
- `PUT  /api/leads/{id}/takeover` — pause AI, start 12h timer
- `DELETE /api/leads/{id}/takeover` — resume AI immediately
- `PUT  /api/leads/{id}/assign?agent_id=` — assign lead to agent (admin only)
- `POST /api/chat/{id}/send-text` — agent sends text (resets 12h timer)
- `POST /api/chat/{id}/send-media` — agent sends media multipart (resets 12h timer)
- `GET  /api/media/{media_id}` — proxy WA media download (WA token stays server-side)
- `GET  /ws?token=<jwt>` — WebSocket for real-time events (`new_message`, `takeover`, `resume_ai`)

### Admin (admin role only)
- `GET  /api/users` — list agents
- `POST /api/users` — create agent
- `PUT  /api/users/{id}` — update name/role/active
- `DELETE /api/users/{id}` — deactivate agent

## Delivery Status Tracking
WhatsApp delivery webhooks update `template_sends` via `wamid` matching.
Lifecycle: `queued → accepted → sent → delivered → read → failed`.
Timestamps recorded: `sent_at`, `delivered_at`, `read_at`, `failed_at`.

## Environment
- Copy `.env.example` to `.env` and fill in credentials.
- `WA_BUSINESS_ACCOUNT_ID` — required for the template-list dropdown (Meta Graph API).
- Frontend apps hardcode `https://wa-slilg.avlokai.com` because deployment does not provide frontend env vars.
- `JWT_SECRET` must be ≥ 32 chars in production.

## CORS
Server allows: localhost (3000/5173/8000), devtunnels, GitHub Pages, Vercel, ngrok, and production domain.

## Admin UI (legacy `/admin`) features
- Template dropdown fetched from Meta (approved templates)
- Auto-selects language code from template
- Token persisted in localStorage across refreshes
- Jobs list auto-refreshes every 60s; job detail every 3s
- Per-recipient delivery status with badges and timestamps

## Commands
```bash
# Backend dev
uvicorn app.main:app --reload --port 8000

# Production (PM2)
pm2 start ecosystem.config.js

# Database (run in order)
psql -f schema.sql
psql -f schema_templates.sql
psql -f schema_crm.sql       # CRM tables (run after above two)
python seed_admin.py          # seed first admin user

# Tests
python -m pytest -q
```

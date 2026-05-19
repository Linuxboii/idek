# Spacelink Platform — Monorepo

Two web apps + one FastAPI backend + one node backend, sharing a chat-UI package.

## Layout
- `apps/crm-api/`   — FastAPI + Postgres backend (WhatsApp CRM). See `apps/crm-api/CLAUDE.md`.
- `apps/crm-web/`   — n8n-python React CRM dashboard. See `apps/crm-web/CLAUDE.md`.
- `apps/sli-lg/`    — SpaceLink lead-gen (imported via filesystem copy). See `apps/sli-lg/CLAUDE.md`.
- `packages/whatsapp-crm/` — shared chat components + API/WS client.

## Common commands
- `npm install` (root) — installs all workspaces.
- `npm --workspace apps/crm-web run dev`
- `npm --workspace apps/sli-lg/client run dev`
- `cd apps/crm-api && uvicorn app.main:app --reload --port 8000`
- `npm --workspace packages/whatsapp-crm test`

## DO NOT change (per merge spec)
- DB schemas in `apps/crm-api/schema*.sql`.
- Backend route/business logic in `apps/crm-api/app/`.
- SLI-LG node backend logic in `apps/sli-lg/server.js`, `apps/sli-lg/schema.js`.
- The hardcoded SLI-LG admin token (preexisting; tracked as follow-up).

See `docs/superpowers/specs/2026-05-19-projects-merge-design.md` for the merge contract.

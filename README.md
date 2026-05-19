# Spacelink Platform Monorepo

Two web apps and two backends sharing a chat-UI package:

- **apps/crm-api/** — FastAPI + Postgres backend (WhatsApp CRM, AI lead qualification, template broadcasts).
- **apps/crm-web/** — React CRM dashboard (n8n-python frontend; Login / Dashboard / AdminUsers).
- **apps/sli-lg/** — SpaceLink Infra lead-gen (React client + Node/Express server; imported via filesystem copy).
- **packages/whatsapp-crm/** — `@spacelink/whatsapp-crm`: shared chat components (`ChatPanel`, `ConversationList`, ...) plus the API/WS client and `configureCrm()` contract.

## Setup

From the monorepo root:

```bash
npm install
```

This installs all workspaces (`apps/crm-web`, `apps/sli-lg/client`, `packages/whatsapp-crm`).

## Per-app dev commands

```bash
# n8n-python CRM dashboard (Vite)
npm --workspace apps/crm-web run dev

# SLI-LG client (Vite)
npm --workspace apps/sli-lg/client run dev

# Shared package — run tests
npm --workspace packages/whatsapp-crm test
```

## Backend dev

```bash
cd apps/crm-api
uvicorn app.main:app --reload --port 8000
```

See `apps/crm-api/CLAUDE.md` for env vars and the full route inventory.

SLI-LG's Node backend (lead intake) lives at `apps/sli-lg/server.js` — see `apps/sli-lg/CLAUDE.md`.

## Where to file changes

| Symptom / change                                  | Edit in                          |
|---------------------------------------------------|----------------------------------|
| Chat bubble / conversation list / chat UI bug     | `packages/whatsapp-crm/`         |
| WhatsApp CRM backend (routes, DB, pipeline)       | `apps/crm-api/app/`              |
| SLI-LG lead capture pages, admin CRM UI           | `apps/sli-lg/client/src/`        |
| n8n-python admin / dashboard pages                | `apps/crm-web/src/`              |

Do NOT edit chat components inside the apps — they are consumed from the shared package via the workspace symlink. Fix once in `packages/whatsapp-crm/` and both apps pick it up.

## Reference

- Merge design spec: [`docs/superpowers/specs/2026-05-19-projects-merge-design.md`](docs/superpowers/specs/2026-05-19-projects-merge-design.md)

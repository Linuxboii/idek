# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo context

This directory was imported into the Spacelink monorepo via filesystem copy (no git subtree). Important wiring notes:

- Only `client/` is a workspace member (registered in the root `package.json`). The outer `package.json`, `server.js`, and `schema.js` are **not** workspaces — install / run them by `cd apps/sli-lg && npm install` as before.
- The chat drawer lives at `client/src/whatsapp-crm/WhatsAppDrawer.jsx` and consumes `@spacelink/whatsapp-crm` for components, API client, and WebSocket.
- The brand-token → CRM-var bridge (maps `--brand-*` design tokens onto the package's `--crm-*` vars) is in `client/src/index.css`. Edit there to retheme the chat UI for SLI-LG without touching the package.
- The Node backend (`server.js`, `schema.js`) and DB schema are **not** changed by the merge; treat them as-is.

See repo root `CLAUDE.md` for the full monorepo layout.

## Project Overview

SpaceLink Infra Lead Generator — a real estate lead capture and CRM frontend for a Hyderabad property business. The repo contains only the React client; the backend API is external.

## Commands

All commands run from the `client/` directory:

```bash
cd client
npm run dev        # start dev server (Vite)
npm run build      # production build
npm run preview    # preview production build
npm run lint       # ESLint
```

No test suite is configured.

## Architecture

**Stack**: React 19, Vite 8, Tailwind CSS v4, react-router-dom v7, xlsx

**Route map**:
- `/` → `LandingPage` — public marketing page with lead contact options
- `/login` → `LoginPage` — admin login
- `/admin` → `AdminPage` — protected CRM dashboard (redirects to `/login` if not authenticated)
- `*` → redirects to `/`

**Authentication** (`src/lib/auth.js`): Client-side only. Stores `"true"` in `localStorage` under `spacelink-admin-auth`. Password is hardcoded in that file. There is no server-side session.

**API layer** (`src/lib/api.js`, `src/config/endpoints.js`): Lead backend calls go through `request()` and use the hardcoded deployed host `https://slilg-api.avlokai.com`. Key endpoints: `GET /leads`, `GET /search?q=`, `GET /leads/:id`, `GET /insights/:id`, `POST /import-leads`. WhatsApp REST calls use `https://wa-slilg.avlokai.com`; WhatsApp WebSocket calls use `wss://wa-slilg.avlokai.com`. The WhatsApp admin bearer token is also hardcoded in `src/config/endpoints.js`.

**AdminPage** (`src/pages/AdminPage.jsx`): A large single-file CRM. Internal sub-components (`AdminHero`, `LeadSidebar`, `LeadWorkspace`, `ExportControls`, etc.) are all defined in that file. Lead temperature is derived from score: ≥75 = hot/Priority, ≥40 = warm/Active, <40 = cold/Others. Export writes XLSX using the `xlsx` library — "Download XLSX" skips API calls for speed, "Export + Chats" fetches per-lead conversation history.

**Design system** (`src/index.css`): Tailwind v4 with custom CSS variables as design tokens — `brand-ink`, `brand-muted`, `brand-accent` (orange), `brand-soft`. Fonts: Manrope (body) and Space Grotesk (display/headings via `font-display`). Dark mode is supported via `[data-theme='dark']` on `:root`. Utility classes like `.shell`, `.glass-card`, `.button-primary`, `.button-secondary`, `.nav-chip` are defined in `index.css` — prefer extending those over inventing new ones.

## Environment Variables

API endpoints are hardcoded in `client/src/config/endpoints.js` for deployment. Optional contact numbers can still be set in `client/.env.local`:

```
VITE_PUBLIC_CALL_NUMBER=+91XXXXXXXXXX        # enables "Call" CTAs
VITE_PUBLIC_WHATSAPP_NUMBER=91XXXXXXXXXX     # enables WhatsApp CTA
```

If call/WhatsApp numbers are not set, the corresponding CTAs are hidden.

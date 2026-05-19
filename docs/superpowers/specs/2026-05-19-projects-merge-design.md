# Projects Merge — Design Spec

**Date:** 2026-05-19
**Author:** Claude (with user)
**Status:** Approved for plan phase

## Goal

Merge two projects into a single monorepo so that WhatsApp CRM frontend code is shared between them — a change in one place flows to both apps. The backends and database schemas/logic are **not** changed in behavior.

### Projects involved

1. **n8n-python** (current repo, becomes monorepo root)
   - FastAPI backend at `wa-slilg.avlokai.com` — handles chat + storage of WhatsApp messages, lead CRM, takeover, WebSocket.
   - React frontend (Vite + Tailwind v4) — standalone CRM dashboard with login, conversations, AdminUsers.

2. **SLI-LG** (`C:\Users\paran\OneDrive\Documents\weekly_projects\weekly_project_2026\SLI-LG`)
   - React 19 + Vite 8 + Tailwind v4 client. Lead-gen + admin dashboard, displays leads from `slilg-api.avlokai.com`.
   - Node backend (`server.js`, `schema.js`) at repo root.
   - Currently has `client/src/whatsapp-crm/` with duplicate copies of chat components, calling `wa-slilg.avlokai.com` with hardcoded admin token.

## Non-goals

- No backend SQL schema changes (`schema.sql`, `schema_templates.sql`, `schema_crm.sql` untouched).
- No backend route or business-logic changes (`app/auth.py`, `app/crm_api.py`, `app/pipeline.py`, etc. behaviorally identical).
- No new CRM features.
- No replacement of SLI-LG hardcoded admin token with real auth (preexisting; flagged for follow-up).
- No migration to pnpm or Turborepo.
- No unification of SLI-LG node backend + n8n-python FastAPI backend.

## Decisions

| # | Choice | Picked |
|---|--------|--------|
| 1 | Display-side ownership | Both apps stay — share code |
| 2 | Code-sharing mechanism | Monorepo |
| 3 | Repo layout / root | n8n-python becomes root; SLI-LG imported into `apps/sli-lg/` |
| 4 | Workspace tool | npm workspaces |
| 5 | Shared package scope | Primitives + `ChatPanel` + `ConversationList` |
| 6 | Auth in shared package | Host injects token via `configureCrm()` |
| 7 | Styling | CSS variables (`--crm-*`); host overrides; no hard-coded Tailwind tokens inside package |
| 8 | SLI-LG git history | Preserve via `git subtree add` |

## Architecture

### Final repo layout

```
n8n-python/                              (monorepo root)
├── package.json                         (workspaces: apps/crm-web, apps/sli-lg/client, packages/*)
├── README.md
├── CLAUDE.md
├── docs/
├── apps/
│   ├── crm-api/                         (was app/ — FastAPI, behavior unchanged)
│   │   ├── app/
│   │   ├── schema.sql
│   │   ├── schema_templates.sql
│   │   ├── schema_crm.sql
│   │   ├── seed_admin.py
│   │   ├── requirements.txt
│   │   ├── ecosystem.config.js
│   │   └── tests/
│   ├── crm-web/                         (was frontend/ — n8n-python React app)
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.jsx
│   │       ├── main.jsx
│   │       ├── index.css
│   │       ├── context/AuthContext.jsx
│   │       ├── pages/{Login,Dashboard,AdminUsers}.jsx
│   │       └── components/UserManagement.jsx
│   └── sli-lg/                          (git subtree from SLI-LG repo)
│       ├── client/                      (React app, npm workspace member)
│       │   ├── package.json
│       │   ├── vite.config.js
│       │   └── src/
│       │       ├── App.jsx, main.jsx, index.css
│       │       ├── pages/{LandingPage,LoginPage,AdminPage}.jsx
│       │       ├── components/
│       │       ├── lib/{api,auth}.js
│       │       ├── config/endpoints.js
│       │       └── WhatsAppDrawer.jsx   (SLI-LG-specific shell, imports shared package)
│       ├── server.js
│       ├── schema.js
│       ├── package.json                 (not a workspace member — node backend keeps own install)
│       └── ...
└── packages/
    └── whatsapp-crm/                    (shared CRM frontend)
        ├── package.json                 (name: "@spacelink/whatsapp-crm", type: module)
        ├── README.md
        └── src/
            ├── index.js                 (re-exports)
            ├── config.js                (configureCrm)
            ├── api.js                   (uses config.getToken)
            ├── ws.js
            ├── crmState.js
            ├── tokens.css               (default --crm-* CSS variables)
            ├── ChatPanel.jsx
            ├── ConversationList.jsx
            ├── MessageBubble.jsx
            ├── TakeoverBanner.jsx
            └── MediaUpload.jsx
```

### Shared package contract

`packages/whatsapp-crm/src/config.js`:
```js
let cfg = {
  apiBaseUrl: '',
  wsBaseUrl: '',
  getToken: () => null,
  onUnauthorized: () => {},
}
export function configureCrm(partial) { cfg = { ...cfg, ...partial } }
export function getCrmConfig() { return cfg }
```

`api.js` reads `getCrmConfig().getToken()` on every request → host owns auth lifecycle. On 401 responses → `onUnauthorized()`.

`ws.js` exposes `useCrmWebSocket(channelId, handlers)` which builds the URL from `wsBaseUrl` + token.

Components are presentational; they call APIs and accept normal React props. No router, no auth context inside the package.

`tokens.css` defines defaults:
```css
:root {
  --crm-bg: #ffffff;
  --crm-fg: #111827;
  --crm-accent: #f97316;
  --crm-bubble-me: #f97316;
  --crm-bubble-them: #f3f4f6;
  --crm-border: #e5e7eb;
  --crm-muted: #6b7280;
}
```
Components reference these via Tailwind arbitrary values: `bg-[var(--crm-bg)] text-[var(--crm-fg)]`. Host imports `tokens.css` once.

Package is consumed **as source** via workspace symlink — no separate build step; each app's Vite transpiles.

### How each app consumes the package

**`apps/crm-web`** (n8n-python frontend, JWT login)
- `AuthContext` calls `configureCrm({ apiBaseUrl, wsBaseUrl, getToken: () => auth.accessToken, onUnauthorized: () => auth.refreshOrLogout() })` on mount.
- `pages/Dashboard.jsx` composes `<ConversationList />` + `<ChatPanel />` from `@spacelink/whatsapp-crm`.
- Removes its own copies of those primitives.

**`apps/sli-lg/client`** (SpaceLink lead-gen, hardcoded token)
- `main.jsx` calls `configureCrm({ apiBaseUrl: WHATSAPP_API_BASE_URL, wsBaseUrl: WHATSAPP_WS_BASE_URL, getToken: () => WHATSAPP_ADMIN_TOKEN })` once at startup.
- `WhatsAppDrawer.jsx` keeps its drawer shell; renders `<ChatPanel />` from the package.
- `client/src/whatsapp-crm/` directory deleted entirely.
- Brand tokens → CRM tokens in `client/src/index.css`:
  ```css
  :root {
    --crm-accent: var(--brand-accent);
    --crm-fg: var(--brand-ink);
    --crm-muted: var(--brand-muted);
  }
  ```

### Result

A single change in `packages/whatsapp-crm/src/ChatPanel.jsx` lands in both apps the next time Vite hot-reloads (instant in dev via symlink, on next `npm install` in CI).

## Migration order

Each step is its own commit. Build/tests green before next step.

1. **Move backend** — `app/` → `apps/crm-api/app/`. Move `schema*.sql`, `seed_admin.py`, `requirements.txt`, `tests/`, `ecosystem.config.js`. Update `ecosystem.config.js` `cwd` and script path. Run `pytest`. Restart PM2 locally.
2. **Move n8n-python frontend** — `frontend/` → `apps/crm-web/`. Update Vite proxy paths if needed. `npm run build` green.
3. **Subtree-import SLI-LG** — `git subtree add --prefix=apps/sli-lg <sli-lg remote> <branch>`. Confirm `apps/sli-lg/client` builds with its own existing `node_modules` re-installed.
4. **Create shared package** — scaffold `packages/whatsapp-crm/` with `package.json`, copy canonical primitives + `ChatPanel` + `ConversationList` from `apps/crm-web/src/components/`. Add `config.js`, `tokens.css`. Refactor `api.js`/`ws.js` to read token from `getCrmConfig()`.
5. **Wire `crm-web`** — replace imports with `@spacelink/whatsapp-crm`; delete duplicated components, `api.js`, `ws.js`; call `configureCrm` from `AuthContext`. Smoke-test: login → conversations → send text → send media → takeover → WS event arrives.
6. **Wire `sli-lg/client`** — delete `apps/sli-lg/client/src/whatsapp-crm/`; repoint `WhatsAppDrawer` imports; call `configureCrm` from `main.jsx`; add CRM-var bridge in `index.css`. Smoke-test: AdminPage → open drawer for a lead phone → chat renders + sends.
7. **Workspaces root** — root `package.json`:
   ```json
   {
     "private": true,
     "workspaces": ["apps/crm-web", "apps/sli-lg/client", "packages/*"]
   }
   ```
   Run `npm install` at root. Confirm symlinks resolve in `apps/*/node_modules/@spacelink/whatsapp-crm`.
8. **Cleanup** — delete orphan files; update `CLAUDE.md` in each app with new paths; update root `README.md` documenting dev/build/deploy + `git subtree pull` flow.

## Dev flow

```bash
# install all workspaces
npm install

# run apps individually
npm --workspace apps/crm-web        run dev
npm --workspace apps/sli-lg/client  run dev

# backend (Python, not a workspace)
cd apps/crm-api
uvicorn app.main:app --reload --port 8000

# build
npm --workspace apps/crm-web        run build
npm --workspace apps/sli-lg/client  run build
```

## Deploy

Unchanged — independent targets:
- FastAPI on VPS via PM2 (path-adjusted ecosystem file).
- SLI-LG node backend on its existing host.
- Two static frontends to their existing hosting (build output paths unchanged).

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| PM2 ecosystem path break | Update `cwd` + `script`; smoke-test `pm2 reload` after step 1 |
| Vite proxy/`.env` path break after moves | Audit + adjust during steps 2 and 3 |
| React 18 (crm-web) vs React 19 (sli-lg) hoist conflict | Bump `crm-web` to React 19 during step 5; verify crm-web build still green |
| SLI-LG drawer visual regression | Manual visual diff before/after step 6; tweak CRM var bridge as needed |
| Subtree pull conflicts on future SLI-LG syncs | Document `git subtree pull --prefix=apps/sli-lg ...` in root README; treat SLI-LG canonical source as the monorepo after step 3 |
| Hardcoded admin token in SLI-LG bundle | Out of scope — preexisting; flag for separate follow-up |

## Testing per step

- Step 1: `pytest` passes inside `apps/crm-api`; `pm2 reload` succeeds.
- Step 2: `npm --workspace apps/crm-web run build` green; manual login + chat against staging.
- Step 3: `apps/sli-lg/client` builds; LandingPage and AdminPage render.
- Step 4: package importable; no missing exports; lint clean.
- Step 5: end-to-end CRM smoke (login, list, takeover, send text, send media, WS event).
- Step 6: AdminPage opens drawer for a real lead phone; chat renders + sends.
- Step 7: `npm install` at root completes; symlinks present.
- Step 8: both web builds + Python tests + PM2 boot — all green.

## Out of scope (explicit)

- DB schema modifications.
- Backend route/business-logic edits.
- New CRM features.
- Replacing SLI-LG hardcoded admin token with real auth.
- Switching workspace tool to pnpm/yarn/Turborepo.
- Merging SLI-LG node backend into FastAPI app.
- Renaming the on-disk root directory.

## Follow-ups (not part of this work)

- Replace SLI-LG hardcoded `WHATSAPP_ADMIN_TOKEN` with real per-agent JWT issued by `wa-slilg.avlokai.com`.
- Decide whether to host both web builds under a single domain.
- Add CI job to build all workspaces on PR.

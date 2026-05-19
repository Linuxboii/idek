# Projects Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge n8n-python (FastAPI + React CRM) and SLI-LG (React lead-gen + node backend) into a single npm-workspaces monorepo, extracting a shared `@spacelink/whatsapp-crm` package so chat UI code lives in one place and propagates to both apps.

**Architecture:** n8n-python becomes the monorepo root. SLI-LG is imported via `git subtree add` preserving history. Backend FastAPI relocates to `apps/crm-api/` (no behavior change). The n8n-python frontend moves to `apps/crm-web/`. SLI-LG goes to `apps/sli-lg/` (workspace member is `apps/sli-lg/client`). Shared chat components, API client, WebSocket hook, and CRM state move into `packages/whatsapp-crm/`. Apps inject auth tokens via `configureCrm({ getToken })`. Theming uses `--crm-*` CSS variables overridable by each host app.

**Tech Stack:** Python 3.11+ / FastAPI / Postgres / pytest (backend, unchanged). React 19 / Vite / Tailwind v4 / npm workspaces (frontends). Node.js for SLI-LG backend (unchanged). Git subtree for history import.

**Spec:** `docs/superpowers/specs/2026-05-19-projects-merge-design.md`

**Non-goals (must NOT change):** Postgres schemas in `schema*.sql`; backend route logic in `app/`; SLI-LG node backend logic in `server.js`/`schema.js`; hardcoded SLI-LG admin token (flagged for later).

## Execution Addendum (2026-05-19)

After plan was written, discovered the actual git layout: both projects already live inside a **single umbrella git repo** at `C:\Users\paran\` (the user's home dir). Paths in this plan refer to monorepo-relative paths under `C:\Users\paran\OneDrive\Documents\Claude\Projects\n8n-python\` (henceforth: **MONOREPO_ROOT**). All `git` commands must be run from inside MONOREPO_ROOT (git auto-locates the umbrella `.git`).

Consequences:
- **Task 3 is simplified.** No subtree add, no temporary remote, no SLI-LG fetch. Both projects share one history already. Task 3 becomes a single `git mv` from `weekly_projects/weekly_project_2026/SLI-LG/` (relative to umbrella root) into `OneDrive/Documents/Claude/Projects/n8n-python/apps/sli-lg/`. See revised Task 3 below.
- **Working branch:** `feat/monorepo-merge` cut from `main`. Created before Task 1 starts. All commits land on that branch.
- **No worktree.** Cloning the umbrella repo is impractical (it contains the entire user profile). Work happens in place on the feature branch.
- **OneDrive sync paused** during execution to avoid file lock races.

---

## File structure after plan

```
n8n-python/                                  (monorepo root, current repo)
├── package.json                             (new — workspaces config)
├── README.md                                (rewrite)
├── CLAUDE.md                                (rewrite to point at new paths)
├── docs/                                    (unchanged)
├── apps/
│   ├── crm-api/                             (moved from app/)
│   │   ├── app/
│   │   ├── schema.sql, schema_templates.sql, schema_crm.sql
│   │   ├── seed_admin.py
│   │   ├── requirements.txt
│   │   ├── ecosystem.config.js              (cwd + script path updated)
│   │   └── tests/
│   ├── crm-web/                             (moved from frontend/)
│   │   ├── package.json                     (React bumped 18 → 19)
│   │   ├── vite.config.js
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.jsx, main.jsx, index.css
│   │       ├── context/AuthContext.jsx     (calls configureCrm on token change)
│   │       ├── pages/{Login,Dashboard,AdminUsers}.jsx
│   │       └── components/UserManagement.jsx
│   └── sli-lg/                              (git subtree from SLI-LG repo)
│       ├── client/                          (workspace member)
│       │   ├── src/
│       │   │   ├── App.jsx, main.jsx       (main.jsx calls configureCrm)
│       │   │   ├── index.css               (--crm-* bridge added)
│       │   │   ├── pages/{LandingPage,LoginPage,AdminPage}.jsx
│       │   │   ├── components/             (existing)
│       │   │   ├── lib/{api,auth}.js
│       │   │   ├── config/endpoints.js
│       │   │   └── whatsapp-crm/
│       │   │       └── WhatsAppDrawer.jsx  (kept; imports from @spacelink/whatsapp-crm)
│       │   └── package.json
│       ├── server.js, schema.js
│       └── package.json                     (NOT a workspace member)
└── packages/
    └── whatsapp-crm/
        ├── package.json                     (name: @spacelink/whatsapp-crm)
        ├── README.md
        └── src/
            ├── index.js                     (re-exports)
            ├── config.js                    (configureCrm / getCrmConfig)
            ├── api.js                       (conversationsApi, leadsApi, chatApi, mediaApi)
            ├── ws.js                        (useCrmWebSocket)
            ├── crmState.js
            ├── tokens.css                   (default --crm-* vars)
            ├── ChatPanel.jsx
            ├── ConversationList.jsx
            ├── MessageBubble.jsx
            ├── TakeoverBanner.jsx
            └── MediaUpload.jsx
```

---

## Task 1: Move FastAPI backend to apps/crm-api/

**Files:**
- Move directory: `app/` → `apps/crm-api/app/`
- Move files: `schema.sql`, `schema_templates.sql`, `schema_crm.sql`, `seed_admin.py`, `requirements.txt`, `ecosystem.config.js`, `tests/` (if at repo root)
- Modify: `apps/crm-api/ecosystem.config.js` (paths)

- [ ] **Step 1.1: Snapshot baseline test result**

Run from repo root: `pytest -q`
Record: pass/fail count. Save to scratch — it must remain identical after the move.

- [ ] **Step 1.2: Create destination directory and move**

```bash
mkdir -p apps/crm-api
git mv app apps/crm-api/app
git mv schema.sql apps/crm-api/schema.sql
git mv schema_templates.sql apps/crm-api/schema_templates.sql
git mv schema_crm.sql apps/crm-api/schema_crm.sql
git mv seed_admin.py apps/crm-api/seed_admin.py
git mv requirements.txt apps/crm-api/requirements.txt
git mv ecosystem.config.js apps/crm-api/ecosystem.config.js
git mv tests apps/crm-api/tests
```

- [ ] **Step 1.3: Update ecosystem.config.js paths**

Open `apps/crm-api/ecosystem.config.js`. Find any `script:`, `cwd:`, or path-to-module-string fields. Adjust so PM2 launches from `apps/crm-api/`:

```js
module.exports = {
  apps: [{
    name: 'wa-slilg',
    cwd: __dirname,                                  // resolves to apps/crm-api
    script: 'uvicorn',
    args: 'app.main:app --host 0.0.0.0 --port 8000',
    interpreter: 'python',
    // ... existing env, watch, etc.
  }]
}
```

If `cwd` was previously a hardcoded absolute path under the old layout, replace with `__dirname`.

- [ ] **Step 1.4: Verify Python imports still resolve**

```bash
cd apps/crm-api
python -c "from app.main import app; print('ok')"
```
Expected output: `ok`

- [ ] **Step 1.5: Run pytest from new location**

```bash
cd apps/crm-api
pytest -q
```
Expected: same pass/fail counts as Step 1.1.

- [ ] **Step 1.6: Commit**

```bash
git add -A
git commit -m "refactor: move FastAPI backend to apps/crm-api/

Pure relocation; no behavior change. PM2 ecosystem cwd updated to __dirname."
```

---

## Task 2: Move n8n-python frontend to apps/crm-web/

**Files:**
- Move directory: `frontend/` → `apps/crm-web/`
- Modify: `apps/crm-web/vite.config.js` (proxy paths if anything points to `../app`)
- Modify: `apps/crm-web/package.json` (no version bump yet; that's Task 5)

- [ ] **Step 2.1: Move directory**

```bash
git mv frontend apps/crm-web
```

- [ ] **Step 2.2: Audit Vite config for stale relative paths**

Open `apps/crm-web/vite.config.js`. Search for any path strings referencing `..` or `app/`. The proxy target is an HTTP URL (`https://wa-slilg.avlokai.com` or similar) — leave that alone. Only fix if a relative filesystem path now resolves wrong.

If `resolve.alias` references existed (e.g., `'@': path.resolve(__dirname, 'src')`), no change needed — `__dirname` adapts.

- [ ] **Step 2.3: Install deps in new location**

```bash
cd apps/crm-web
rm -rf node_modules package-lock.json
npm install
```

- [ ] **Step 2.4: Build to confirm green**

```bash
cd apps/crm-web
npm run build
```
Expected: build completes, dist/ produced, no errors.

- [ ] **Step 2.5: Commit**

```bash
git add -A
git commit -m "refactor: move n8n-python frontend to apps/crm-web/

Pure relocation; no source changes. Lockfile regenerated."
```

---

## Task 3: Move SLI-LG into apps/sli-lg/ (revised v2 — filesystem move, no history)

**Discovery during execution:** SLI-LG has its own nested `.git` and is NOT tracked by the umbrella repo. Therefore `git mv` is impossible and a subtree import was declined. SLI-LG's git history will be left in the original directory (kept as backup) and the monorepo gets a single "import sli-lg" commit.

**Files:**
- Move (filesystem) `C:\Users\paran\OneDrive\Documents\weekly_projects\weekly_project_2026\SLI-LG\` → `apps/sli-lg/` under MONOREPO_ROOT
- Remove nested `.git` from the destination
- Regenerate `apps/sli-lg/client/package-lock.json`

- [ ] **Step 3.1: Sanity check source and destination**

From MONOREPO_ROOT (`C:\Users\paran\OneDrive\Documents\Claude\Projects\n8n-python`):
```bash
test -d /c/Users/paran/OneDrive/Documents/weekly_projects/weekly_project_2026/SLI-LG && echo "source ok"
test ! -d apps/sli-lg && echo "destination empty"
```
Expected: both "ok" / "empty" printed.

- [ ] **Step 3.2: Copy SLI-LG to apps/sli-lg/ (filesystem copy, not git mv)**

From MONOREPO_ROOT:
```bash
mkdir -p apps
cp -r /c/Users/paran/OneDrive/Documents/weekly_projects/weekly_project_2026/SLI-LG apps/sli-lg
```
Expected: apps/sli-lg/ now mirrors the source.

If `cp -r` fails because of OneDrive locks, use PowerShell's `Copy-Item -Recurse -Force`. As a last resort, use `robocopy` (consult prior Task 2 output for the exact invocation that worked there).

- [ ] **Step 3.3: Delete the nested `.git` directory inside apps/sli-lg/**

```bash
rm -rf apps/sli-lg/.git
test ! -d apps/sli-lg/.git && echo "nested .git removed"
```
Without this, the umbrella repo would refuse to track files under what it sees as a foreign repo.

- [ ] **Step 3.4: Also delete `node_modules` and existing lockfile before reinstall**

```bash
rm -rf apps/sli-lg/node_modules apps/sli-lg/client/node_modules
rm -f  apps/sli-lg/package-lock.json apps/sli-lg/client/package-lock.json
```

- [ ] **Step 3.5: Verify SLI-LG client builds in new location**

```bash
cd apps/sli-lg/client
npm install
npm run build
```
Expected: build completes successfully.

- [ ] **Step 3.6: Stage and commit only the new apps/sli-lg/ tree**

From MONOREPO_ROOT:
```bash
git add apps/sli-lg
git status --short apps/sli-lg | head -5
```
Confirm files appear as `A` (new). Then:
```bash
git commit -m "feat: import SLI-LG into apps/sli-lg/

Filesystem copy from weekly_projects/weekly_project_2026/SLI-LG. Nested
.git removed; sli-lg history is not preserved in the monorepo (the
original directory remains as a backup). client lockfile regenerated."
```

DO NOT delete the original SLI-LG directory yet — keep it as a backup until Task 9 smoke tests pass.

---

## Task 4: Create packages/whatsapp-crm/ skeleton with TDD-friendly config module

**Files:**
- Create: `packages/whatsapp-crm/package.json`
- Create: `packages/whatsapp-crm/src/config.js`
- Create: `packages/whatsapp-crm/src/index.js`
- Create: `packages/whatsapp-crm/src/__tests__/config.test.js`
- Create: `packages/whatsapp-crm/vitest.config.js`

- [ ] **Step 4.1: Create package.json**

`packages/whatsapp-crm/package.json`:
```json
{
  "name": "@spacelink/whatsapp-crm",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./tokens.css": "./src/tokens.css"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "jsdom": "^25.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4.2: Create vitest config**

`packages/whatsapp-crm/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 4.3: Write failing test for configureCrm**

`packages/whatsapp-crm/src/__tests__/config.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import { configureCrm, getCrmConfig } from '../config.js'

describe('configureCrm', () => {
  beforeEach(() => {
    configureCrm({
      apiBaseUrl: '',
      wsBaseUrl: '',
      getToken: () => null,
      onUnauthorized: () => {},
    })
  })

  it('returns default config before configuration', () => {
    const cfg = getCrmConfig()
    expect(cfg.apiBaseUrl).toBe('')
    expect(cfg.getToken()).toBeNull()
  })

  it('merges partial updates into current config', () => {
    configureCrm({ apiBaseUrl: 'https://api.example.com' })
    const cfg = getCrmConfig()
    expect(cfg.apiBaseUrl).toBe('https://api.example.com')
    expect(typeof cfg.getToken).toBe('function')
  })

  it('preserves getToken closure across calls', () => {
    let token = 'abc'
    configureCrm({ getToken: () => token })
    expect(getCrmConfig().getToken()).toBe('abc')
    token = 'xyz'
    expect(getCrmConfig().getToken()).toBe('xyz')
  })

  it('calls onUnauthorized when invoked', () => {
    let called = 0
    configureCrm({ onUnauthorized: () => { called++ } })
    getCrmConfig().onUnauthorized()
    expect(called).toBe(1)
  })
})
```

- [ ] **Step 4.4: Run test to verify it fails**

```bash
cd packages/whatsapp-crm
npm install
npm test
```
Expected: tests fail with "Cannot find module '../config.js'" or similar.

- [ ] **Step 4.5: Implement config.js**

`packages/whatsapp-crm/src/config.js`:
```js
let cfg = {
  apiBaseUrl: '',
  wsBaseUrl: '',
  getToken: () => null,
  onUnauthorized: () => {},
}

export function configureCrm(partial) {
  cfg = { ...cfg, ...partial }
}

export function getCrmConfig() {
  return cfg
}
```

- [ ] **Step 4.6: Implement index.js entry**

`packages/whatsapp-crm/src/index.js`:
```js
export { configureCrm, getCrmConfig } from './config.js'
```

- [ ] **Step 4.7: Run tests to verify they pass**

```bash
npm test
```
Expected: all 4 tests pass.

- [ ] **Step 4.8: Commit**

```bash
git add packages/whatsapp-crm/
git commit -m "feat: scaffold @spacelink/whatsapp-crm package with configureCrm

Adds package.json, vitest config, and a host-injectable configuration
module (apiBaseUrl, wsBaseUrl, getToken, onUnauthorized) with tests."
```

---

## Task 5: Port API client + WebSocket hook into package

**Files:**
- Create: `packages/whatsapp-crm/src/api.js`
- Create: `packages/whatsapp-crm/src/ws.js`
- Create: `packages/whatsapp-crm/src/crmState.js`
- Create: `packages/whatsapp-crm/src/__tests__/api.test.js`
- Modify: `packages/whatsapp-crm/src/index.js`
- Reference (read-only): `apps/crm-web/src/api.js`, `apps/crm-web/src/ws.js`, `apps/sli-lg/client/src/whatsapp-crm/{api,ws,crmState}.js`

- [ ] **Step 5.1: Read both existing api.js files to identify canonical surface**

Open `apps/crm-web/src/api.js` and `apps/sli-lg/client/src/whatsapp-crm/api.js`. Record the exported names (e.g., `conversationsApi`, `leadsApi`, `chatApi`, `mediaApi`, `authApi`, `usersApi`). The crm-web copy is canonical.

- [ ] **Step 5.2: Write failing test for api.js token injection**

`packages/whatsapp-crm/src/__tests__/api.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { configureCrm } from '../config.js'
import { request } from '../api.js'

describe('api request()', () => {
  let lastFetch

  beforeEach(() => {
    lastFetch = null
    global.fetch = vi.fn(async (url, opts) => {
      lastFetch = { url, opts }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    configureCrm({
      apiBaseUrl: 'https://api.test',
      wsBaseUrl: 'wss://api.test',
      getToken: () => 'TKN-123',
      onUnauthorized: () => {},
    })
  })

  it('prepends apiBaseUrl to path', async () => {
    await request('/api/conversations')
    expect(lastFetch.url).toBe('https://api.test/api/conversations')
  })

  it('attaches Authorization: Bearer <token>', async () => {
    await request('/api/conversations')
    expect(lastFetch.opts.headers.Authorization).toBe('Bearer TKN-123')
  })

  it('omits Authorization header when getToken returns null', async () => {
    configureCrm({ getToken: () => null })
    await request('/api/public')
    expect(lastFetch.opts.headers.Authorization).toBeUndefined()
  })

  it('invokes onUnauthorized on 401 responses', async () => {
    let called = 0
    configureCrm({ onUnauthorized: () => { called++ } })
    global.fetch = vi.fn(async () => new Response('nope', { status: 401 }))
    await expect(request('/api/secure')).rejects.toThrow()
    expect(called).toBe(1)
  })
})
```

- [ ] **Step 5.3: Run test to verify it fails**

```bash
cd packages/whatsapp-crm
npm test
```
Expected: fails — `api.js` not present.

- [ ] **Step 5.4: Implement api.js**

Copy the body of `apps/crm-web/src/api.js` into `packages/whatsapp-crm/src/api.js`. Then refactor the auth-handling section. Replace any local token-reading code (e.g., `localStorage.getItem(...)` or `axios.defaults.headers.Authorization = ...`) with the pattern below.

`packages/whatsapp-crm/src/api.js` (skeleton — keep the existing endpoint-shape exports from the canonical file):
```js
import { getCrmConfig } from './config.js'

export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const { apiBaseUrl, getToken, onUnauthorized } = getCrmConfig()
  const token = getToken()
  const finalHeaders = { ...headers }
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json'
  }
  if (token) finalHeaders.Authorization = `Bearer ${token}`

  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: finalHeaders,
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
  })

  if (res.status === 401) {
    onUnauthorized()
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} ${text}`)
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

// Carry over the endpoint groupings exactly as crm-web defines them.
// Example (adapt to the canonical file):
export const authApi = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
}

export const conversationsApi = {
  list: ({ phone, limit, offset } = {}) => {
    const params = new URLSearchParams()
    if (phone) params.set('phone', phone)
    if (limit != null) params.set('limit', String(limit))
    if (offset != null) params.set('offset', String(offset))
    const qs = params.toString()
    return request(`/api/conversations${qs ? `?${qs}` : ''}`)
  },
  get: (id) => request(`/api/conversations/${id}`),
}

export const chatApi = {
  sendText: (id, text) => request(`/api/chat/${id}/send-text`, { method: 'POST', body: { text } }),
  sendMedia: (id, formData) => request(`/api/chat/${id}/send-media`, { method: 'POST', body: formData }),
}

export const leadsApi = {
  takeover: (id) => request(`/api/leads/${id}/takeover`, { method: 'PUT' }),
  resumeAi: (id) => request(`/api/leads/${id}/takeover`, { method: 'DELETE' }),
  assign:   (id, agentId) => request(`/api/leads/${id}/assign?agent_id=${agentId}`, { method: 'PUT' }),
}

export const mediaApi = {
  url: (mediaId) => {
    const { apiBaseUrl } = getCrmConfig()
    return `${apiBaseUrl}/api/media/${mediaId}`
  },
}

export const usersApi = {
  list:   () => request('/api/users'),
  create: (payload) => request('/api/users', { method: 'POST', body: payload }),
  update: (id, payload) => request(`/api/users/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
}
```

If the canonical `crm-web/src/api.js` exports additional groupings, copy them in unchanged except for the auth/token line.

- [ ] **Step 5.5: Run tests to verify they pass**

```bash
npm test
```
Expected: all api tests pass.

- [ ] **Step 5.6: Implement crmState.js**

Copy `apps/sli-lg/client/src/whatsapp-crm/crmState.js` content. If it sets a token directly, refactor to delegate to `configureCrm`:

`packages/whatsapp-crm/src/crmState.js`:
```js
import { configureCrm } from './config.js'

// Legacy helper for hosts that prefer a setter pattern.
// New hosts should call configureCrm({ getToken: () => ... }) directly.
let _token = null
export let crmToken = null

export function setCrmToken(token) {
  _token = token
  crmToken = token
  configureCrm({ getToken: () => _token })
}

export function clearCrmToken() {
  _token = null
  crmToken = null
  configureCrm({ getToken: () => null })
}
```

- [ ] **Step 5.7: Implement ws.js**

Open `apps/crm-web/src/ws.js`. Copy into `packages/whatsapp-crm/src/ws.js`. Replace any reference to a fixed WebSocket URL or local token retrieval with:

```js
import { useEffect, useRef } from 'react'
import { getCrmConfig } from './config.js'

export function useCrmWebSocket(onEvent) {
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

  useEffect(() => {
    const { wsBaseUrl, getToken } = getCrmConfig()
    const token = getToken()
    if (!token || !wsBaseUrl) return

    const url = `${wsBaseUrl}/ws?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)

    ws.onmessage = (evt) => {
      try { onEventRef.current?.(JSON.parse(evt.data)) }
      catch { /* ignore non-JSON */ }
    }

    return () => ws.close()
  }, [])
}
```

If the canonical crm-web `ws.js` has reconnect logic, ping/pong handling, or additional hooks (e.g., `useTypingIndicator`), port those exactly — only swap the URL+token derivation.

- [ ] **Step 5.8: Update index.js to re-export the new modules**

`packages/whatsapp-crm/src/index.js`:
```js
export { configureCrm, getCrmConfig } from './config.js'
export {
  request,
  authApi,
  conversationsApi,
  chatApi,
  leadsApi,
  mediaApi,
  usersApi,
} from './api.js'
export { useCrmWebSocket } from './ws.js'
export { setCrmToken, clearCrmToken, crmToken } from './crmState.js'
```
(Adjust the api re-export list to match what `api.js` actually exports.)

- [ ] **Step 5.9: Run tests again**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 5.10: Commit**

```bash
git add packages/whatsapp-crm/
git commit -m "feat(whatsapp-crm): port api client, ws hook, crmState into shared package

API client reads token via getCrmConfig().getToken() at send-time and calls
onUnauthorized() on 401. WebSocket URL is built from wsBaseUrl + token at
connect-time. Legacy setCrmToken/clearCrmToken helpers preserved."
```

---

## Task 6: Port presentational components + theme tokens

**Files:**
- Create: `packages/whatsapp-crm/src/tokens.css`
- Create: `packages/whatsapp-crm/src/MessageBubble.jsx`
- Create: `packages/whatsapp-crm/src/TakeoverBanner.jsx`
- Create: `packages/whatsapp-crm/src/MediaUpload.jsx`
- Create: `packages/whatsapp-crm/src/ChatPanel.jsx`
- Create: `packages/whatsapp-crm/src/ConversationList.jsx`
- Modify: `packages/whatsapp-crm/src/index.js`
- Reference (read-only, canonical = crm-web): `apps/crm-web/src/components/{ChatPanel,ConversationList,MessageBubble,TakeoverBanner,MediaUpload}.jsx`

- [ ] **Step 6.1: Create tokens.css with default CSS variables**

`packages/whatsapp-crm/src/tokens.css`:
```css
:root {
  --crm-bg: #ffffff;
  --crm-fg: #111827;
  --crm-muted: #6b7280;
  --crm-border: #e5e7eb;
  --crm-accent: #f97316;
  --crm-accent-fg: #ffffff;
  --crm-bubble-me-bg: var(--crm-accent);
  --crm-bubble-me-fg: var(--crm-accent-fg);
  --crm-bubble-them-bg: #f3f4f6;
  --crm-bubble-them-fg: var(--crm-fg);
  --crm-input-bg: #ffffff;
  --crm-input-border: var(--crm-border);
  --crm-unread-bg: var(--crm-accent);
  --crm-unread-fg: var(--crm-accent-fg);
}
```

- [ ] **Step 6.2: Port MessageBubble.jsx**

Copy `apps/crm-web/src/components/MessageBubble.jsx` into `packages/whatsapp-crm/src/MessageBubble.jsx` verbatim, then replace all hard-coded Tailwind colour classes with CSS-var variants:

| Before | After |
|--------|-------|
| `bg-orange-500` | `bg-[var(--crm-bubble-me-bg)]` |
| `text-white` (on me-bubble) | `text-[var(--crm-bubble-me-fg)]` |
| `bg-gray-100` (them-bubble) | `bg-[var(--crm-bubble-them-bg)]` |
| `text-gray-900` (them-bubble) | `text-[var(--crm-bubble-them-fg)]` |
| `text-gray-500` (timestamp/muted) | `text-[var(--crm-muted)]` |
| `border-gray-200` | `border-[var(--crm-border)]` |

If there are media-preview branches that call something like `mediaApi.url(id)`, ensure the import path is `./api.js` (relative within the package), not the old app path.

- [ ] **Step 6.3: Port TakeoverBanner.jsx**

Same procedure. Map background/foreground/border to CSS vars. Replace `bg-amber-50` / `text-amber-900` / etc. — pick the closest semantic var (`--crm-accent` for the action button, `--crm-muted` for secondary text, `--crm-border` for the separator).

If the component calls `leadsApi.resumeAi()`, the import becomes `import { leadsApi } from './api.js'`.

- [ ] **Step 6.4: Port MediaUpload.jsx**

Same procedure. Imports change to `./api.js`.

- [ ] **Step 6.5: Port ChatPanel.jsx**

Same procedure. ChatPanel imports `MessageBubble`, `TakeoverBanner`, `MediaUpload` — change paths to `./MessageBubble.jsx`, etc. Imports of `chatApi`, `leadsApi`, `conversationsApi` become `./api.js`. WebSocket hook becomes `./ws.js`.

If ChatPanel internally uses `useAuth()` from the host's AuthContext, **remove** that — instead accept any per-user props the parent already supplies (e.g., `currentUserId`), or read from `getCrmConfig()` if it must be global. The package must not import from any app.

- [ ] **Step 6.6: Port ConversationList.jsx**

Same procedure. Replace any router import (`useNavigate` from `react-router-dom`) with a `onSelectConversation(id)` callback prop. The package must not depend on a router.

If the original component receives router-derived params (e.g., active conversation id from URL), instead require the parent to pass `activeId` as a prop.

- [ ] **Step 6.7: Update index.js exports**

`packages/whatsapp-crm/src/index.js`:
```js
export { configureCrm, getCrmConfig } from './config.js'
export {
  request,
  authApi,
  conversationsApi,
  chatApi,
  leadsApi,
  mediaApi,
  usersApi,
} from './api.js'
export { useCrmWebSocket } from './ws.js'
export { setCrmToken, clearCrmToken, crmToken } from './crmState.js'

export { default as MessageBubble }   from './MessageBubble.jsx'
export { default as TakeoverBanner }  from './TakeoverBanner.jsx'
export { default as MediaUpload }     from './MediaUpload.jsx'
export { default as ChatPanel }       from './ChatPanel.jsx'
export { default as ConversationList } from './ConversationList.jsx'
```

- [ ] **Step 6.8: Smoke-render via vitest**

`packages/whatsapp-crm/src/__tests__/components.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import MessageBubble from '../MessageBubble.jsx'
import TakeoverBanner from '../TakeoverBanner.jsx'

describe('component smoke', () => {
  it('renders MessageBubble with text', () => {
    const { getByText } = render(
      <MessageBubble message={{ id: 1, body: 'hello', direction: 'in', created_at: new Date().toISOString() }} />
    )
    expect(getByText('hello')).toBeTruthy()
  })

  it('renders TakeoverBanner', () => {
    const { container } = render(
      <TakeoverBanner pausedUntil={null} onResume={() => {}} />
    )
    expect(container.firstChild).toBeTruthy()
  })
})
```

Adjust prop names to match what the ported components actually expect. Goal: render-without-crash, not behavior coverage.

- [ ] **Step 6.9: Run tests**

```bash
cd packages/whatsapp-crm
npm test
```
Expected: all tests pass.

- [ ] **Step 6.10: Commit**

```bash
git add packages/whatsapp-crm/
git commit -m "feat(whatsapp-crm): port presentational components with CSS-var theming

MessageBubble, TakeoverBanner, MediaUpload, ChatPanel, ConversationList moved
into the shared package. Hard-coded Tailwind colour classes replaced with
--crm-* CSS variable references. Components are router/auth-agnostic;
host apps pass callbacks (onSelectConversation) and active state as props."
```

---

## Task 7: Set up npm workspaces at repo root

**Files:**
- Create: `package.json` (repo root)
- Modify: `apps/crm-web/package.json` (add to workspace; bump React to 19)
- Modify: `apps/sli-lg/client/package.json` (no change beyond becoming a workspace member)
- Create: `.npmrc` at root if needed

- [ ] **Step 7.1: Create root package.json**

Repo root `package.json`:
```json
{
  "name": "spacelink-monorepo",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "apps/crm-web",
    "apps/sli-lg/client",
    "packages/*"
  ]
}
```

- [ ] **Step 7.2: Bump apps/crm-web/package.json to React 19**

In `apps/crm-web/package.json`, update:
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```
Add `@spacelink/whatsapp-crm` as a workspace dependency:
```json
{
  "dependencies": {
    "@spacelink/whatsapp-crm": "*"
  }
}
```

- [ ] **Step 7.3: Add @spacelink/whatsapp-crm to sli-lg/client**

In `apps/sli-lg/client/package.json`, add under `dependencies`:
```json
{
  "@spacelink/whatsapp-crm": "*"
}
```

- [ ] **Step 7.4: Wipe local node_modules and reinstall at root**

```bash
rm -rf node_modules apps/crm-web/node_modules apps/sli-lg/client/node_modules packages/whatsapp-crm/node_modules
rm -f apps/crm-web/package-lock.json apps/sli-lg/client/package-lock.json packages/whatsapp-crm/package-lock.json
npm install
```
Expected: a single root `node_modules` plus app-level `node_modules` symlinks. `package-lock.json` at root.

- [ ] **Step 7.5: Verify symlink to shared package**

```bash
ls -la apps/crm-web/node_modules/@spacelink/whatsapp-crm
ls -la apps/sli-lg/client/node_modules/@spacelink/whatsapp-crm
```
Expected: both are symlinks pointing to `packages/whatsapp-crm`.

If the OS or Windows policy refuses symlinks, the workspace install falls back to a copy. Verify the version line matches `0.1.0`.

- [ ] **Step 7.6: Build both web apps**

```bash
npm --workspace apps/crm-web run build
npm --workspace apps/sli-lg/client run build
```
Expected: both succeed. (crm-web may emit React 18→19 deprecation warnings; warnings are OK, errors are not.)

- [ ] **Step 7.7: Run package tests**

```bash
npm --workspace packages/whatsapp-crm test
```
Expected: pass.

- [ ] **Step 7.8: Commit**

```bash
git add package.json package-lock.json apps/crm-web/package.json apps/sli-lg/client/package.json
git commit -m "feat: enable npm workspaces; link @spacelink/whatsapp-crm into both apps

Root workspaces config covers apps/crm-web, apps/sli-lg/client, and
packages/*. crm-web bumped React 18 → 19 to match sli-lg/client."
```

---

## Task 8: Wire apps/crm-web to use shared package

**Files:**
- Modify: `apps/crm-web/src/context/AuthContext.jsx` (calls configureCrm)
- Modify: `apps/crm-web/src/main.jsx` or `App.jsx` (imports tokens.css)
- Modify: `apps/crm-web/src/pages/Dashboard.jsx` (imports from shared package)
- Modify: `apps/crm-web/src/pages/AdminUsers.jsx` (imports from shared package)
- Delete: `apps/crm-web/src/api.js`, `apps/crm-web/src/ws.js`
- Delete: `apps/crm-web/src/components/ChatPanel.jsx`, `ConversationList.jsx`, `MessageBubble.jsx`, `TakeoverBanner.jsx`, `MediaUpload.jsx`

- [ ] **Step 8.1: Import tokens.css at app entry**

In `apps/crm-web/src/main.jsx`, add near the existing `index.css` import:
```jsx
import '@spacelink/whatsapp-crm/tokens.css'
import './index.css'
```
Order matters — `tokens.css` first so app CSS can override.

- [ ] **Step 8.2: Wire configureCrm in AuthContext**

In `apps/crm-web/src/context/AuthContext.jsx`, add at the top of the file:
```jsx
import { configureCrm } from '@spacelink/whatsapp-crm'

// Read once from existing config / env / hardcoded values used by the prior api.js
const API_BASE = 'https://wa-slilg.avlokai.com'
const WS_BASE  = 'wss://wa-slilg.avlokai.com'
```
Inside the provider, where `accessToken` state lives, add an effect:
```jsx
useEffect(() => {
  configureCrm({
    apiBaseUrl: API_BASE,
    wsBaseUrl: WS_BASE,
    getToken: () => accessToken,
    onUnauthorized: () => {
      // existing logout/refresh handler
      logoutOrRefresh()
    },
  })
}, [accessToken])
```
Use the exact base URLs already used by the old `apps/crm-web/src/api.js`. If those came from a constant elsewhere, import that constant instead.

- [ ] **Step 8.3: Repoint Dashboard.jsx imports**

In `apps/crm-web/src/pages/Dashboard.jsx`, replace:
```jsx
import ConversationList from '../components/ConversationList'
import ChatPanel from '../components/ChatPanel'
import { conversationsApi } from '../api'
import { useCrmWebSocket } from '../ws'
```
with:
```jsx
import {
  ConversationList,
  ChatPanel,
  conversationsApi,
  useCrmWebSocket,
} from '@spacelink/whatsapp-crm'
```

If Dashboard previously relied on `ConversationList` reading the active id from the router, switch to local state:
```jsx
const [activeId, setActiveId] = useState(null)

<ConversationList activeId={activeId} onSelectConversation={setActiveId} />
{activeId && <ChatPanel conversationId={activeId} />}
```

- [ ] **Step 8.4: Repoint AdminUsers.jsx imports**

In `apps/crm-web/src/pages/AdminUsers.jsx`, replace `import { usersApi } from '../api'` with `import { usersApi } from '@spacelink/whatsapp-crm'`. UserManagement component stays local.

- [ ] **Step 8.5: Delete duplicate files**

```bash
git rm apps/crm-web/src/api.js apps/crm-web/src/ws.js
git rm apps/crm-web/src/components/ChatPanel.jsx \
       apps/crm-web/src/components/ConversationList.jsx \
       apps/crm-web/src/components/MessageBubble.jsx \
       apps/crm-web/src/components/TakeoverBanner.jsx \
       apps/crm-web/src/components/MediaUpload.jsx
```

- [ ] **Step 8.6: Build to verify no broken imports**

```bash
npm --workspace apps/crm-web run build
```
Expected: build succeeds with no module-not-found errors.

- [ ] **Step 8.7: Manual smoke test against staging**

Start dev server: `npm --workspace apps/crm-web run dev`. In browser:
1. Navigate to `/login`, log in with valid credentials.
2. Verify Dashboard loads conversation list.
3. Click a conversation — chat history loads.
4. Send a text message — appears in own bubble.
5. Send media (image) — uploads + appears.
6. Trigger takeover on a lead — banner appears with paused-until time.
7. Resume AI — banner disappears.
8. Confirm WebSocket events arrive: open browser devtools network → WS → see incoming `new_message` frames.

Record any failures. If any fail, fix before commit.

- [ ] **Step 8.8: Commit**

```bash
git add -A
git commit -m "refactor(crm-web): consume @spacelink/whatsapp-crm

Replaces local copies of api/ws/ChatPanel/ConversationList/MessageBubble/
TakeoverBanner/MediaUpload with imports from the shared package.
AuthContext now calls configureCrm so the package picks up the JWT
on token change."
```

---

## Task 9: Wire apps/sli-lg/client to use shared package

**Files:**
- Modify: `apps/sli-lg/client/src/main.jsx` (calls configureCrm + imports tokens.css)
- Modify: `apps/sli-lg/client/src/index.css` (--crm-* var bridge)
- Modify: `apps/sli-lg/client/src/whatsapp-crm/WhatsAppDrawer.jsx` (imports from shared package)
- Delete: `apps/sli-lg/client/src/whatsapp-crm/{ChatPanel,MessageBubble,TakeoverBanner,MediaUpload,api,ws,crmState}.{jsx,js}` — keep only `WhatsAppDrawer.jsx`

- [ ] **Step 9.1: Import tokens.css and call configureCrm**

In `apps/sli-lg/client/src/main.jsx`, add near the top:
```jsx
import '@spacelink/whatsapp-crm/tokens.css'
import { configureCrm } from '@spacelink/whatsapp-crm'
import {
  WHATSAPP_API_BASE_URL,
  WHATSAPP_WS_BASE_URL,
  WHATSAPP_ADMIN_TOKEN,
} from './config/endpoints.js'

configureCrm({
  apiBaseUrl: WHATSAPP_API_BASE_URL,
  wsBaseUrl: WHATSAPP_WS_BASE_URL,
  getToken: () => WHATSAPP_ADMIN_TOKEN,
  onUnauthorized: () => {
    // SLI-LG has no real auth flow; surface to console for now.
    console.warn('[whatsapp-crm] 401 from wa-slilg backend')
  },
})
```
Order: `tokens.css` import before `index.css` (which is the next line in main.jsx).

- [ ] **Step 9.2: Add CRM-var bridge to index.css**

In `apps/sli-lg/client/src/index.css`, find the `:root { ... }` block that declares brand tokens (`--brand-ink`, `--brand-accent`, `--brand-muted`, `--brand-soft`). After it (still inside `:root` or as a sibling block), add:
```css
:root {
  --crm-fg: var(--brand-ink);
  --crm-muted: var(--brand-muted);
  --crm-accent: var(--brand-accent);
  --crm-accent-fg: #ffffff;
  --crm-bubble-me-bg: var(--brand-accent);
  --crm-bubble-them-bg: var(--brand-soft);
  --crm-border: rgba(0, 0, 0, 0.08);
}
```
If SLI-LG declares a dark mode block (`[data-theme='dark']`), mirror these overrides for dark:
```css
[data-theme='dark'] {
  --crm-fg: #f3f4f6;
  --crm-muted: #9ca3af;
  --crm-bubble-them-bg: #1f2937;
  --crm-border: rgba(255, 255, 255, 0.08);
}
```

- [ ] **Step 9.3: Repoint WhatsAppDrawer.jsx**

In `apps/sli-lg/client/src/whatsapp-crm/WhatsAppDrawer.jsx`, replace local imports:
```jsx
import { setCrmToken, clearCrmToken, crmToken } from './crmState'
import { conversationsApi } from './api'
import ChatPanel from './ChatPanel'
```
with:
```jsx
import {
  setCrmToken,
  clearCrmToken,
  crmToken,
  conversationsApi,
  ChatPanel,
} from '@spacelink/whatsapp-crm'
```

The `ensureCrmToken()` helper that hardcodes `SpaceLink@7426` stays (preexisting behavior preserved per spec).

- [ ] **Step 9.4: Delete duplicate files**

```bash
git rm apps/sli-lg/client/src/whatsapp-crm/ChatPanel.jsx \
       apps/sli-lg/client/src/whatsapp-crm/MessageBubble.jsx \
       apps/sli-lg/client/src/whatsapp-crm/TakeoverBanner.jsx \
       apps/sli-lg/client/src/whatsapp-crm/MediaUpload.jsx \
       apps/sli-lg/client/src/whatsapp-crm/api.js \
       apps/sli-lg/client/src/whatsapp-crm/ws.js \
       apps/sli-lg/client/src/whatsapp-crm/crmState.js
```
After this, the only file remaining in that directory is `WhatsAppDrawer.jsx`.

- [ ] **Step 9.5: Build to verify**

```bash
npm --workspace apps/sli-lg/client run build
```
Expected: build succeeds.

- [ ] **Step 9.6: Manual smoke test**

Start: `npm --workspace apps/sli-lg/client run dev`. In browser:
1. Open the SLI-LG admin page (`/admin`) — log in with the existing client-side password.
2. Click an action that opens `WhatsAppDrawer` for a lead with a known WhatsApp phone.
3. Verify the drawer:
   - Resolves the lead via `conversationsApi.list({ phone })`.
   - Renders `ChatPanel` with message history.
   - Sends a text successfully.
   - Receives WS new_message frames (open devtools → WS).
4. Visual check: bubbles use SLI-LG brand accent (orange-ish), not the package default — confirms CSS-var bridge works.
5. If dark mode is supported, toggle and verify bubbles re-theme.

- [ ] **Step 9.7: Commit**

```bash
git add -A
git commit -m "refactor(sli-lg): consume @spacelink/whatsapp-crm in WhatsAppDrawer

Deletes local copies of chat components, api.js, ws.js, crmState.js.
Drawer keeps SLI-LG-specific shell logic (lead resolution by phone).
configureCrm wired in main.jsx; CRM CSS vars mapped to brand tokens
in index.css so chat UI inherits SLI-LG styling."
```

---

## Task 10: Cleanup, docs, and root README

**Files:**
- Modify: `CLAUDE.md` (repo root — update paths)
- Modify: `README.md` (repo root — full rewrite for monorepo)
- Create: `apps/crm-api/CLAUDE.md` (move backend-only notes here)
- Create: `apps/crm-web/CLAUDE.md` (frontend notes)
- Modify: `apps/sli-lg/CLAUDE.md` (already exists from subtree; add monorepo context)
- Modify: `packages/whatsapp-crm/README.md` (usage docs)

- [ ] **Step 10.1: Rewrite root README**

`README.md` (root) should cover:
- One-paragraph overview (two apps, one shared chat package).
- `npm install` from root.
- Per-app dev commands (`npm --workspace ...`).
- Backend dev: `cd apps/crm-api && uvicorn app.main:app --reload`.
- How to pull SLI-LG updates: `git subtree pull --prefix=apps/sli-lg <remote> <branch>`.
- Where to file changes:
  - chat UI bug → `packages/whatsapp-crm/`
  - CRM backend → `apps/crm-api/app/`
  - SLI-LG lead pages → `apps/sli-lg/client/src/`
  - n8n-python admin/dashboard → `apps/crm-web/src/`
- Link to `docs/superpowers/specs/2026-05-19-projects-merge-design.md`.

- [ ] **Step 10.2: Update root CLAUDE.md to point to per-app CLAUDE.md files**

`CLAUDE.md` (root):
```markdown
# Spacelink Platform — Monorepo

Two web apps + one FastAPI backend + one node backend, sharing a chat-UI package.

## Layout
- `apps/crm-api/`   — FastAPI + Postgres backend (WhatsApp CRM). See `apps/crm-api/CLAUDE.md`.
- `apps/crm-web/`   — n8n-python React CRM dashboard. See `apps/crm-web/CLAUDE.md`.
- `apps/sli-lg/`    — SpaceLink lead-gen (subtree imported). See `apps/sli-lg/CLAUDE.md`.
- `packages/whatsapp-crm/` — shared chat components + API/WS client.

## Common commands
- `npm install` (root) — installs all workspaces.
- `npm --workspace apps/crm-web run dev`
- `npm --workspace apps/sli-lg/client run dev`
- `cd apps/crm-api && uvicorn app.main:app --reload --port 8000`

## DO NOT change (per merge spec)
- DB schemas in `apps/crm-api/schema*.sql`.
- Backend route/business logic in `apps/crm-api/app/`.
- SLI-LG node backend logic in `apps/sli-lg/server.js`, `apps/sli-lg/schema.js`.
- The hardcoded SLI-LG admin token (preexisting; tracked as follow-up).
```

- [ ] **Step 10.3: Create apps/crm-api/CLAUDE.md**

Move the backend-specific sections from the old root CLAUDE.md (API endpoints, env vars, deploy notes that pertain to FastAPI) into `apps/crm-api/CLAUDE.md`.

- [ ] **Step 10.4: Create apps/crm-web/CLAUDE.md**

Document: pages, AuthContext, how to extend dashboard. Note: chat components come from `@spacelink/whatsapp-crm` — do not add chat components here.

- [ ] **Step 10.5: Write packages/whatsapp-crm/README.md**

Cover:
- Purpose (shared CRM chat UI + API/WS client).
- Quick start:
  ```jsx
  import '@spacelink/whatsapp-crm/tokens.css'
  import { configureCrm, ChatPanel } from '@spacelink/whatsapp-crm'

  configureCrm({
    apiBaseUrl: 'https://wa-slilg.avlokai.com',
    wsBaseUrl:  'wss://wa-slilg.avlokai.com',
    getToken:   () => myAuthStore.token,
    onUnauthorized: () => myAuthStore.logout(),
  })
  ```
- Exports list with short descriptions.
- Themable CSS vars (link to `tokens.css`).
- Component prop reference for `ChatPanel`, `ConversationList`, `MessageBubble`, `TakeoverBanner`, `MediaUpload`.
- Tests: `npm --workspace packages/whatsapp-crm test`.

- [ ] **Step 10.6: Final build + test sweep**

```bash
npm install
npm --workspace packages/whatsapp-crm test
npm --workspace apps/crm-web run build
npm --workspace apps/sli-lg/client run build
cd apps/crm-api && pytest -q && cd ../..
```
Expected: all green.

- [ ] **Step 10.7: Commit**

```bash
git add -A
git commit -m "docs: rewrite root README + CLAUDE.md for monorepo layout

Per-app CLAUDE.md files in apps/crm-api/, apps/crm-web/, apps/sli-lg/.
packages/whatsapp-crm/README.md documents configureCrm contract,
exports, themable CSS vars, and component props."
```

---

## Verification (run at end)

- [ ] **V1**: `npm install` at root completes cleanly with no peer-dep errors.
- [ ] **V2**: `npm --workspace packages/whatsapp-crm test` — all unit tests pass.
- [ ] **V3**: `npm --workspace apps/crm-web run build` — green.
- [ ] **V4**: `npm --workspace apps/sli-lg/client run build` — green.
- [ ] **V5**: `cd apps/crm-api && pytest -q` — same pass count as pre-migration baseline.
- [ ] **V6**: PM2 boots FastAPI from new `apps/crm-api/ecosystem.config.js` without path errors (`pm2 start apps/crm-api/ecosystem.config.js && pm2 logs`).
- [ ] **V7**: Manual smoke crm-web (login → conversations → send text + media → takeover → WS event).
- [ ] **V8**: Manual smoke sli-lg drawer (admin → lead → open drawer → chat renders, sends, themed correctly).
- [ ] **V9**: Confirm no behavior change in backend: hit `GET /healthz`, `POST /api/auth/login`, `GET /api/conversations` against the running FastAPI — identical responses to pre-merge.
- [ ] **V10**: Editing `packages/whatsapp-crm/src/MessageBubble.jsx` in dev mode triggers HMR in **both** apps (open both dev servers; change a string; confirm both reload).

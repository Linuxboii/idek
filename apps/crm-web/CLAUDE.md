# crm-web — n8n-python React CRM dashboard

> Part of the Spacelink monorepo. See root `CLAUDE.md` for layout. Backend lives in `apps/crm-api/`.

## Pages
- `src/pages/Login.jsx` — email + password → calls `authApi.login`, stores tokens.
- `src/pages/Dashboard.jsx` — main CRM view: `ConversationList` + `ChatPanel` from `@spacelink/whatsapp-crm`.
- `src/pages/AdminUsers.jsx` — admin-only agent management (uses `UserManagement` component + `usersApi`).

## AuthContext
`src/context/AuthContext.jsx` provides real JWT auth:
- `login(email, password)` — POST `/api/auth/login`, stores `access_token` + `refresh_token` in localStorage.
- Auto-refresh on 401 via `refresh_token`.
- Calls `configureCrm({ apiBaseUrl, wsBaseUrl, getToken, onUnauthorized })` on mount and whenever the token changes, so the shared package always picks up the current token.

## Extending the dashboard
- Add a new page → drop into `src/pages/`, register in `App.jsx` router.
- Need a chat-related component? It probably exists in `@spacelink/whatsapp-crm` — import from there. **Do not** add chat components in this app. If something is missing, add it to `packages/whatsapp-crm/src/` and re-export from `index.js`.
- API calls beyond chat: use the existing `*Api` helpers from `@spacelink/whatsapp-crm` (`leadsApi`, `usersApi`, ...) or extend the package.

## Dev / build
```bash
# from MONOREPO_ROOT
npm --workspace apps/crm-web run dev
npm --workspace apps/crm-web run build
```

Vite dev server proxies `/api` to the production backend (`https://wa-slilg.avlokai.com`) — see `vite.config.js`.

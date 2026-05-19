# @spacelink/whatsapp-crm

Shared CRM chat UI + API/WS client used by `apps/crm-web` and `apps/sli-lg/client`.

The package ships React components (ChatPanel, ConversationList, MessageBubble, TakeoverBanner, MediaUpload), a typed-ish API client (`authApi`, `conversationsApi`, `chatApi`, `leadsApi`, `mediaApi`, `usersApi`), a WebSocket helper, and a single `configureCrm()` contract that lets each host app inject its own auth/token/base-URL.

## Quick start

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

Call `configureCrm` once at app boot (and any time your token rotates). All components and API helpers read from the same internal config.

## Exports

| Export                      | Type        | Description |
|----------------------------|-------------|-------------|
| `configureCrm`             | function    | Sets `apiBaseUrl`, `wsBaseUrl`, `getToken`, `onUnauthorized`. Call before rendering. |
| `getCrmConfig`             | function    | Returns the current config (debugging / SSR). |
| `request`                  | function    | Low-level `fetch` wrapper with auth + 401 handling. |
| `authApi`                  | object      | `login(email, password)`, `refresh(refreshToken)`. |
| `conversationsApi`         | object      | `list()`, `get(leadId)`. |
| `chatApi`                  | object      | `sendText(leadId, text)`, `sendMedia(leadId, file)`. |
| `leadsApi`                 | object      | `takeover(leadId)`, `resumeAI(leadId)`, `assign(leadId, agentId)`. |
| `mediaApi`                 | object      | Media download helper. |
| `mediaUrl(mediaId)`        | function    | Build absolute proxy URL for inline `<img>`/`<audio>`/`<video>`. |
| `usersApi`                 | object      | `list()`, `create()`, `update()`, `delete()` (admin). |
| `useWebSocket` / `useCrmWebSocket` | hooks | Subscribe to `new_message`, `takeover`, `resume_ai`. |
| `setCrmToken` / `clearCrmToken` / `crmToken` | functions | Manual token override (rarely needed; prefer `getToken` callback). |
| `MessageBubble`            | component   | Single message bubble. |
| `TakeoverBanner`           | component   | "Human mode until HH:MM" banner with Resume AI button. |
| `MediaUpload`              | component   | File-picker button that calls `onFile(file)`. |
| `ChatPanel`                | component   | Full chat pane (messages + composer + takeover). |
| `ConversationList`         | component   | Left-rail list with search + filters. |

## Themable CSS vars (`tokens.css`)

Import once: `import '@spacelink/whatsapp-crm/tokens.css'`. Override any of the following on `:root` (or a wrapping element) to retheme without touching the package:

| Var                              | Default     | Used for |
|----------------------------------|-------------|----------|
| `--crm-bg`                       | `#ffffff`   | Panel background, composer row |
| `--crm-fg`                       | `#111827`   | Primary foreground |
| `--crm-muted`                    | `#6b7280`   | Secondary text (timestamps, hints) |
| `--crm-border`                   | `#e5e7eb`   | Borders / dividers |
| `--crm-accent`                   | `#f97316`   | Active filter, send button, outgoing bubble |
| `--crm-accent-fg`                | `#ffffff`   | Foreground on accent surfaces |
| `--crm-bubble-me-bg`             | `var(--crm-accent)` | Outgoing bubble bg |
| `--crm-bubble-me-fg`             | `var(--crm-accent-fg)` | Outgoing bubble fg |
| `--crm-bubble-them-bg`           | `#f3f4f6`   | Incoming bubble bg, message-area bg |
| `--crm-bubble-them-fg`           | `var(--crm-fg)` | Incoming bubble fg |
| `--crm-input-bg`                 | `#ffffff`   | Composer + search inputs |
| `--crm-input-border`             | `var(--crm-border)` | Composer + search input border |
| `--crm-unread-bg`                | `var(--crm-accent)` | Unread-count badge bg |
| `--crm-unread-fg`                | `var(--crm-accent-fg)` | Unread-count badge fg |

## Component prop reference

### `<ChatPanel lead={...} />`
| Prop  | Type | Description |
|-------|------|-------------|
| `lead` | object \| null | The selected lead. Must have `id` and ideally `name`, `phone`, `ai_active`, `ai_paused_until`. When `null`, renders an empty-state placeholder. Internally fetches `/api/conversations/{id}` and re-fetches on every send/takeover. |

### `<ConversationList ... />`
| Prop                  | Type     | Description |
|-----------------------|----------|-------------|
| `activeId` / `selectedId` | id  | Currently-selected lead id (either name accepted; backwards-compat). |
| `onSelectConversation` | `(id, conv) => void` | Preferred selection handler. |
| `onSelect`            | `(conv) => void` | Legacy selection handler (used if `onSelectConversation` not provided). |
| `liveUpdates`         | `{ [leadId]: { lastMessage?, ai_active?, unread_count? } }` | Optional patch map applied to local state for real-time updates from your WS subscription. |

### `<MessageBubble msg={...} />`
| Prop  | Type | Description |
|-------|------|-------------|
| `msg` | object | Message row. Reads `role` (`user` / `assistant` / `agent`), `agent_name`, `message_text`, `media_type` (`image`/`audio`/`video`), `media_id`, `created_at`. Outgoing if role is `assistant` or `agent`. |

### `<TakeoverBanner lead={...} onResume={...} />`
| Prop      | Type        | Description |
|-----------|-------------|-------------|
| `lead`    | object      | Lead with `ai_active` + `ai_paused_until`. Banner only renders when `ai_active === false`. |
| `onResume`| `() => void`| Called after `leadsApi.resumeAI(lead.id)` succeeds — typically updates local state to mark the lead AI-active again. |

### `<MediaUpload onFile={...} />`
| Prop    | Type             | Description |
|---------|------------------|-------------|
| `onFile`| `(file) => void` | Called with the selected `File`. Accepts `image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx`. Resets input after each pick. |

## Tests

```bash
npm --workspace packages/whatsapp-crm test
```

## Build

None. The package is consumed as source via the npm workspace symlink — host apps' Vite build picks up `.jsx` / `.js` directly. No separate build step.

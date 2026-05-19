import { leadsApi } from './api.js'

export default function TakeoverBanner({ lead, onResume }) {
  if (!lead || lead.ai_active) return null

  const until = lead.ai_paused_until
    ? new Date(lead.ai_paused_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const handleResume = async () => {
    try { await leadsApi.resumeAI(lead.id); onResume() } catch { /* ignore */ }
  }

  return (
    <div className="bg-[var(--crm-bg)] border-b border-[var(--crm-border)] px-4 py-2 flex items-center justify-between">
      <span className="text-sm text-[var(--crm-muted)]">
        Human mode{until ? ` until ${until}` : ''}
      </span>
      <button onClick={handleResume}
        className="text-xs bg-[var(--crm-accent)] hover:opacity-90 text-[var(--crm-accent-fg)] px-3 py-1 rounded-full font-medium">
        Resume AI
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { conversationsApi } from './api.js'

export default function ConversationList({ selectedId, activeId, onSelect, onSelectConversation, liveUpdates }) {
  const [convs, setConvs] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  // Backwards-compat: accept either selectedId/onSelect (legacy) or activeId/onSelectConversation
  const currentId = activeId ?? selectedId
  const handlePick = (c) => {
    if (typeof onSelectConversation === 'function') onSelectConversation(c.id, c)
    else if (typeof onSelect === 'function') onSelect(c)
  }

  const load = async () => {
    try {
      const { data } = await conversationsApi.list()
      setConvs(data)
    } catch { /* ignore */ }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!liveUpdates) return
    setConvs(prev => prev.map(c => {
      const upd = liveUpdates[c.id]
      if (!upd) return c
      return {
        ...c,
        last_message: upd.lastMessage ?? c.last_message,
        ai_active: upd.ai_active ?? c.ai_active,
        unread_count: upd.unread_count ?? c.unread_count,
      }
    }))
  }, [liveUpdates])

  const filtered = convs.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
    const matchFilter =
      filter === 'all' ? true :
      filter === 'ai' ? c.ai_active :
      filter === 'human' ? !c.ai_active :
      filter === 'unread' ? c.unread_count > 0 : true
    return matchSearch && matchFilter
  })

  return (
    <div className="flex flex-col h-full bg-[var(--crm-bg)] border-r border-[var(--crm-border)] w-80 flex-shrink-0">
      <div className="p-4 border-b border-[var(--crm-border)]">
        <h2 className="font-bold text-[var(--crm-fg)] text-lg mb-3">Conversations</h2>
        <input
          type="text" placeholder="Search name or phone..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-[var(--crm-input-border)] bg-[var(--crm-input-bg)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--crm-accent)]"
        />
        <div className="flex gap-1 mt-2">
          {['all', 'ai', 'human', 'unread'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-2 py-1 rounded-full font-medium transition-colors
                ${filter === f
                  ? 'bg-[var(--crm-accent)] text-[var(--crm-accent-fg)]'
                  : 'bg-[var(--crm-bubble-them-bg)] text-[var(--crm-muted)] hover:opacity-90'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto flex-1">
        {filtered.map(c => (
          <button key={c.id} onClick={() => handlePick(c)}
            className={`w-full text-left px-4 py-3 border-b border-[var(--crm-border)] hover:bg-[var(--crm-bubble-them-bg)] transition-colors
              ${currentId === c.id ? 'bg-[var(--crm-bubble-them-bg)] border-l-4 border-l-[var(--crm-accent)]' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--crm-fg)] text-sm truncate">{c.name || c.phone}</span>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {c.unread_count > 0 && (
                  <span className="bg-[var(--crm-unread-bg)] text-[var(--crm-unread-fg)] text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {c.unread_count > 9 ? '9+' : c.unread_count}
                  </span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${c.ai_active
                    ? 'bg-[var(--crm-bubble-them-bg)] text-[var(--crm-fg)]'
                    : 'bg-[var(--crm-accent)] text-[var(--crm-accent-fg)]'}`}>
                  {c.ai_active ? 'AI' : 'HU'}
                </span>
              </div>
            </div>
            <p className="text-xs text-[var(--crm-muted)] mt-0.5 truncate">{c.last_message || '-'}</p>
            {c.assigned_agent_name && (
              <p className="text-xs text-[var(--crm-muted)] mt-0.5">-&gt; {c.assigned_agent_name}</p>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-[var(--crm-muted)] text-sm mt-8">No conversations</p>
        )}
      </div>
    </div>
  )
}

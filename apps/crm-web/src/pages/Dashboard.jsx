import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ConversationList, ChatPanel, useWebSocket } from '@spacelink/whatsapp-crm'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [selectedLead, setSelectedLead] = useState(null)
  const [liveUpdates, setLiveUpdates] = useState({})

  const { subscribe, unsubscribe } = useWebSocket(
    useCallback((msg) => {
      if (msg.event === 'new_message') {
        setLiveUpdates(prev => ({
          ...prev,
          [msg.lead_id]: {
            ...(prev[msg.lead_id] || {}),
            lastMessage: msg.message.message_text,
            unread_count: msg.lead_id !== selectedLead?.id
              ? ((prev[msg.lead_id]?.unread_count || 0) + 1)
              : 0,
          },
        }))
      }
      if (msg.event === 'takeover') {
        setLiveUpdates(prev => ({
          ...prev,
          [msg.lead_id]: { ...(prev[msg.lead_id] || {}), ai_active: false },
        }))
      }
      if (msg.event === 'resume_ai') {
        setLiveUpdates(prev => ({
          ...prev,
          [msg.lead_id]: { ...(prev[msg.lead_id] || {}), ai_active: true },
        }))
      }
    }, [selectedLead?.id])
  )

  const handleSelect = (lead) => {
    if (selectedLead?.id) unsubscribe(selectedLead.id)
    setSelectedLead(lead)
    subscribe(lead.id)
    setLiveUpdates(prev => ({
      ...prev,
      [lead.id]: { ...(prev[lead.id] || {}), unread_count: 0 },
    }))
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-green-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0 shadow">
        <span className="font-bold text-lg">WhatsApp CRM</span>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-80">{user?.name} · {user?.role}</span>
          {user?.role === 'admin' && (
            <>
              <Link to="/admin/templates" className="text-sm underline opacity-80 hover:opacity-100">
                Templates
              </Link>
              <Link to="/admin/users" className="text-sm underline opacity-80 hover:opacity-100">
                Agents
              </Link>
            </>
          )}
          <button onClick={logout}
            className="text-sm bg-green-700 hover:bg-green-800 px-3 py-1 rounded-lg">
            Logout
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <ConversationList
          selectedId={selectedLead?.id}
          onSelect={handleSelect}
          liveUpdates={liveUpdates}
        />
        <ChatPanel lead={selectedLead} />
      </div>
    </div>
  )
}

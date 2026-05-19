import { useEffect, useState } from 'react'
import {
  setCrmToken,
  clearCrmToken,
  crmToken,
  conversationsApi,
  ChatPanel,
} from '@spacelink/whatsapp-crm'

function ensureCrmToken() {
  if (crmToken) return
  setCrmToken('SpaceLink@7426')
}

// status: 'idle' | 'loading' | 'ready' | 'not_found' | 'error'

export default function WhatsAppDrawer({ phone, customerName, open, onClose }) {
  const [status, setStatus] = useState('idle')
  const [lead, setLead] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!open || !phone) return

    let cancelled = false

    async function load() {
      setStatus('loading')
      setLead(null)
      setErrorMsg('')

      try {
        ensureCrmToken()
        const { data } = await conversationsApi.list({ phone, limit: 1 })
        if (cancelled) return
        const found = Array.isArray(data) ? data[0] : data?.items?.[0]
        if (!found) {
          setStatus('not_found')
        } else {
          setLead(found)
          setStatus('ready')
        }
      } catch (err) {
        if (cancelled) return
        clearCrmToken()
        setErrorMsg(err.message || 'Failed to connect to WhatsApp CRM')
        setStatus('error')
      }
    }

    load()
    return () => { cancelled = true }
  }, [open, phone, retryKey])

  // Trap Escape key
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`WhatsApp chat — ${customerName || phone}`}
        className="fixed right-0 top-0 z-50 flex h-full w-full flex-col shadow-2xl transition-transform duration-300 ease-out sm:w-[440px]"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 bg-[#075E54] px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
              {(customerName || phone || '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-white leading-tight">
                {customerName || phone}
              </p>
              {customerName && phone && (
                <p className="truncate text-xs text-white/70">{phone}</p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
            aria-label="Close chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden bg-white">
          {status === 'loading' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
              {/* Pulse skeleton */}
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-gray-200" />
                <div className="h-3 w-1/2 animate-pulse rounded-full bg-gray-200" />
                <div className="h-3 w-5/6 animate-pulse rounded-full bg-gray-200" />
              </div>
              <p className="text-sm text-gray-400">Loading conversation…</p>
            </div>
          )}

          {status === 'not_found' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">No conversation found</p>
              <p className="text-xs text-gray-400">{phone} hasn't messaged on WhatsApp yet</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Connection failed</p>
                <p className="mt-1 text-xs text-gray-400">{errorMsg}</p>
              </div>
              <button
                onClick={() => setRetryKey(k => k + 1)}
                className="rounded-full bg-[#075E54] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#128C7E] focus:outline-none focus:ring-2 focus:ring-[#075E54]/40 cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}

          {status === 'ready' && lead && (
            <ChatPanel lead={lead} />
          )}
        </div>
      </div>
    </>
  )
}

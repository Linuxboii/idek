import { useEffect, useRef, useState } from 'react'
import { chatApi, conversationsApi, leadsApi } from './api.js'
import MediaUpload from './MediaUpload.jsx'
import MessageBubble from './MessageBubble.jsx'
import TakeoverBanner from './TakeoverBanner.jsx'

export default function ChatPanel({ lead: initialLead }) {
  const [conv, setConv] = useState(null)
  const [lead, setLead] = useState(initialLead)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef()

  // Voice recording state
  const [recording, setRecording] = useState(false)
  const [recDuration, setRecDuration] = useState(0)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const loadConv = async () => {
    if (!initialLead?.id) return
    try {
      const { data } = await conversationsApi.get(initialLead.id)
      setConv(data)
      setLead({
        ...initialLead,
        ai_active: data.lead.ai_active,
        ai_paused_until: data.lead.ai_paused_until,
      })
    } catch { /* ignore */ }
  }

  useEffect(() => { loadConv() }, [initialLead?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv?.messages?.length])

  const handleSendText = async (e) => {
    e.preventDefault()
    if (!text.trim() || !conv || sending) return
    setSending(true)
    try { await chatApi.sendText(conv.lead.id, text); setText(''); await loadConv() }
    catch { /* ignore */ } finally { setSending(false) }
  }

  const handleSendMedia = async (file) => {
    if (!conv || sending) return
    setSending(true)
    try { await chatApi.sendMedia(conv.lead.id, file); await loadConv() }
    catch { /* ignore */ } finally { setSending(false) }
  }

  const handleTakeover = async () => {
    if (!conv) return
    try {
      await leadsApi.takeover(conv.lead.id)
      setLead(prev => ({ ...prev, ai_active: false }))
    } catch { /* ignore */ }
  }

  // ── Voice recording handlers ──────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const mr = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start()
      recorderRef.current = mr
      setRecording(true)
      setRecDuration(0)
      timerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000)
    } catch (err) {
      console.error('Mic access denied:', err)
    }
  }

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const mr = recorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stream.getTracks().forEach(t => t.stop())
      mr.stop()
    }
    recorderRef.current = null
    setRecording(false)
    setRecDuration(0)
  }

  const cancelRecording = () => {
    stopRecording()
    chunksRef.current = []
  }

  const sendRecording = () => {
    const mr = recorderRef.current
    if (!mr || !conv) return
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const file = new File([blob], 'voice.webm', { type: 'audio/webm' })
      chunksRef.current = []
      setSending(true)
      try {
        await chatApi.sendMedia(conv.lead.id, file, '', true)
        await loadConv()
      } catch { /* ignore */ } finally { setSending(false) }
    }
    stopRecording()
  }

  const fmtDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  // ─────────────────────────────────────────────────────────────────────

  if (!initialLead) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--crm-muted)] bg-[var(--crm-bubble-them-bg)]">
        <div className="text-center">
          <p className="text-4xl mb-2">[chat]</p>
          <p>Select a conversation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-[var(--crm-bg)]">
      <div className="px-4 py-3 border-b border-[var(--crm-border)] flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[var(--crm-fg)]">{lead?.name || lead?.phone}</h3>
          <p className="text-xs text-[var(--crm-muted)]">{lead?.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          {lead?.ai_active && (
            <button onClick={handleTakeover}
              className="text-xs bg-[var(--crm-bubble-them-bg)] hover:opacity-90 text-[var(--crm-fg)] px-3 py-1 rounded-full font-medium transition-colors">
              Take Over
            </button>
          )}
          <span className={`text-xs px-2 py-1 rounded-full font-medium
            ${lead?.ai_active
              ? 'bg-[var(--crm-bubble-them-bg)] text-[var(--crm-fg)]'
              : 'bg-[var(--crm-accent)] text-[var(--crm-accent-fg)]'}`}>
            {lead?.ai_active ? 'AI Active' : 'Human'}
          </span>
        </div>
      </div>
      <TakeoverBanner
        lead={lead}
        onResume={() => setLead(prev => ({ ...prev, ai_active: true, ai_paused_until: null }))}
      />
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-[var(--crm-bubble-them-bg)]">
        {conv?.messages?.map((m, i) => <MessageBubble key={m.id || i} msg={m} />)}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      {recording ? (
        <div className="px-4 py-3 border-t border-[var(--crm-border)] flex items-center gap-3 bg-[var(--crm-bg)]">
          <button onClick={cancelRecording} title="Cancel"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--crm-muted)' }}>
            ✕
          </button>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: '#ef4444', animation: 'crm-pulse 1s ease-in-out infinite',
          }} />
          <span className="text-sm text-[var(--crm-fg)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtDur(recDuration)}
          </span>
          <span className="text-xs text-[var(--crm-muted)] flex-1">Recording…</span>
          <button onClick={sendRecording} title="Send voice note"
            className="bg-[var(--crm-accent)] hover:opacity-90 text-[var(--crm-accent-fg)] rounded-full w-9 h-9 flex items-center justify-center text-sm flex-shrink-0">
            ▶
          </button>
          <style>{`@keyframes crm-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
        </div>
      ) : (
        <form onSubmit={handleSendText}
          className="px-4 py-3 border-t border-[var(--crm-border)] flex items-center gap-2 bg-[var(--crm-bg)]">
          <MediaUpload onFile={handleSendMedia} />
          <button type="button" onClick={startRecording} title="Record voice note"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--crm-muted)', flexShrink: 0 }}>
            🎙️
          </button>
          <input type="text" value={text} onChange={e => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border border-[var(--crm-input-border)] bg-[var(--crm-input-bg)] rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--crm-accent)]" />
          <button type="submit" disabled={sending || !text.trim()}
            className="bg-[var(--crm-accent)] hover:opacity-90 text-[var(--crm-accent-fg)] rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-50 flex-shrink-0 text-sm">
            &gt;
          </button>
        </form>
      )}
    </div>
  )
}

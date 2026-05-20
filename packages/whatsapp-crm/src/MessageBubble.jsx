import { mediaUrl } from './api.js'

function MediaPreview({ mediaType, mediaId }) {
  const src = mediaUrl(mediaId)
  if (mediaType === 'image')
    return <img src={src} alt="" style={{ maxWidth: '260px', borderRadius: '8px', marginTop: '4px', display: 'block' }} />
  if (mediaType === 'audio')
    return <audio controls src={src} style={{ marginTop: '4px', maxWidth: '260px' }} />
  if (mediaType === 'video')
    return <video controls src={src} style={{ maxWidth: '260px', borderRadius: '8px', marginTop: '4px' }} />
  // document
  return (
    <a href={src} target="_blank" rel="noreferrer"
       style={{
         display: 'flex', alignItems: 'center', gap: '8px',
         padding: '8px 12px', marginTop: '4px', borderRadius: '8px',
         background: 'rgba(255,255,255,0.08)', textDecoration: 'none',
         color: 'inherit', fontSize: '13px',
       }}>
      <span style={{ fontSize: '20px' }}>📄</span>
      <span style={{ textDecoration: 'underline' }}>Download file</span>
    </a>
  )
}

/* Placeholder labels that should not be shown alongside a media preview */
const PLACEHOLDER_RE = /^\[(Image|Video|Audio|Document|audio:|image:|video:)/i

export default function MessageBubble({ msg }) {
  const isOut = msg.role === 'assistant' || msg.role === 'agent'
  const label = msg.role === 'agent' ? (msg.agent_name || 'Agent') : msg.role === 'assistant' ? 'AI' : null

  const hasMedia = msg.media_type && msg.media_id
  const text = msg.message_text || ''
  const showText = text && !(hasMedia && PLACEHOLDER_RE.test(text.trim()))

  return (
    <div className={`flex flex-col mb-2 ${isOut ? 'items-end' : 'items-start'}`}>
      {label && <span className="text-xs text-[var(--crm-muted)] mb-0.5 px-1">{label}</span>}
      <div className={`max-w-sm px-3 py-2 rounded-2xl text-sm
        ${isOut
          ? 'bg-[var(--crm-bubble-me-bg)] text-[var(--crm-bubble-me-fg)] rounded-br-sm'
          : 'bg-[var(--crm-bubble-them-bg)] text-[var(--crm-bubble-them-fg)] rounded-bl-sm'}`}>
        {hasMedia && <MediaPreview mediaType={msg.media_type} mediaId={msg.media_id} />}
        {showText && <p className="whitespace-pre-wrap break-words" style={hasMedia ? { marginTop: '6px' } : undefined}>{text}</p>}
        {!hasMedia && !showText && <p className="whitespace-pre-wrap break-words">[Empty message]</p>}
      </div>
      <span className="text-xs text-[var(--crm-muted)] mt-0.5 px-1">
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

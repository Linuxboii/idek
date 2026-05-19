import { mediaUrl } from './api.js'

function MediaPreview({ mediaType, mediaId }) {
  const src = mediaUrl(mediaId)
  if (mediaType === 'image') return <img src={src} alt="" className="max-w-xs rounded-lg mt-1" />
  if (mediaType === 'audio') return <audio controls src={src} className="mt-1 max-w-xs" />
  if (mediaType === 'video') return <video controls src={src} className="max-w-xs rounded-lg mt-1" />
  return <a href={src} target="_blank" rel="noreferrer" className="underline text-blue-300 text-xs">Download file</a>
}

export default function MessageBubble({ msg }) {
  const isOut = msg.role === 'assistant' || msg.role === 'agent'
  const label = msg.role === 'agent' ? (msg.agent_name || 'Agent') : msg.role === 'assistant' ? 'AI' : null

  return (
    <div className={`flex flex-col mb-2 ${isOut ? 'items-end' : 'items-start'}`}>
      {label && <span className="text-xs text-[var(--crm-muted)] mb-0.5 px-1">{label}</span>}
      <div className={`max-w-sm px-3 py-2 rounded-2xl text-sm
        ${isOut
          ? 'bg-[var(--crm-bubble-me-bg)] text-[var(--crm-bubble-me-fg)] rounded-br-sm'
          : 'bg-[var(--crm-bubble-them-bg)] text-[var(--crm-bubble-them-fg)] rounded-bl-sm'}`}>
        {msg.media_type && msg.media_id
          ? <MediaPreview mediaType={msg.media_type} mediaId={msg.media_id} />
          : <p className="whitespace-pre-wrap break-words">{msg.message_text}</p>
        }
      </div>
      <span className="text-xs text-[var(--crm-muted)] mt-0.5 px-1">
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

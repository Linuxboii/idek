import { Link } from 'react-router-dom'

export function LeadForm({ showFillPrompt = false }) {
  const callNumber = import.meta.env.VITE_PUBLIC_CALL_NUMBER?.replace(/\D/g, '')
  const whatsappNumber = import.meta.env.VITE_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '')

  return (
    <div className="glass-card animate-rise relative overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-x-10 top-0 h-24 rounded-full bg-brand-accent/12 blur-3xl" />
      <div className="relative">
        <p className="text-kicker">Contact</p>
        <h2 className="mt-3 font-display text-3xl font-bold text-brand-ink">
          Get in touch.
        </h2>
        <p className="mt-3 text-sm leading-6 text-brand-muted">
          Call, message, or open the dashboard.
        </p>

        {showFillPrompt ? (
          <div className="mt-4 rounded-2xl border border-brand-accent/35 bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-ink">
            Form submission is disabled.
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {callNumber ? (
            <a className="button-primary w-full text-center" href={`tel:${callNumber}`}>
              Call Sales Team
            </a>
          ) : null}

          {whatsappNumber ? (
            <a
              className="button-secondary w-full text-center"
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open WhatsApp
            </a>
          ) : null}

          <Link className="button-secondary w-full text-center" to="/admin">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

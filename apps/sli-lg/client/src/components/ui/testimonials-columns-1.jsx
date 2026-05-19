import React from 'react'

export function TestimonialsColumn({ className = '', testimonials, duration = 16 }) {
  return (
    <div className={`reviews-column ${className}`}>
      <div
        className="reviews-track flex flex-col gap-6 pb-6"
        style={{ '--reviews-duration': `${duration}s` }}
      >
        {Array.from({ length: 2 }).map((_, index) => (
          <React.Fragment key={index}>
            {testimonials.map(({ text, name }) => (
              <article className="reviews-marquee-card" key={`${name}-${index}`}>
                <div className="text-4xl leading-none text-brand-accent">&ldquo;</div>
                <p className="mt-4 text-sm leading-7 text-brand-muted">{text}</p>
                <div className="mt-6 border-t border-brand-ink/10 pt-4">
                  <p className="font-semibold text-brand-ink">{name}</p>
                </div>
              </article>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}


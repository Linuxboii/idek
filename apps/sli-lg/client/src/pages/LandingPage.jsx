import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LeadForm } from '../components/LeadForm'
import { TestimonialsColumn } from '../components/ui/testimonials-columns-1'

const benefits = ['Buying', 'Renting', 'Selling']

const highlights = [
  { value: '20+', label: 'Years of Experience' },
  { value: '100%', label: 'Client Satisfaction' },
  { value: 'End-to-End', label: 'Solutions' },
]

const navigationItems = [
  { label: 'Properties', href: '#properties' },
  { label: 'About', href: '#features' },
  { label: 'Process', href: '#process' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'Contact', href: '#lead-form' },
]

const featureCards = [
  {
    title: 'Buying & Selling',
    description: 'We help you find the ideal office space or property to buy or sell.',
  },
  {
    title: 'Real estate advisory',
    description: 'Expert advice on your real estate investments and property planning.',
  },
  {
    title: 'Leasing management',
    description: 'Comprehensive leasing and rental solutions tailored for you.',
  },
  {
    title: 'Legal compliance',
    description: 'Guiding you through all necessary legal obligations securely.',
  },
]

const whySpaceReasons = [
  {
    title: 'Honesty and Integrity',
    stat: 'Transparent Real Estate',
    detail: 'We are working to transform this industry through honesty, integrity, and exceptional service.',
  },
  {
    title: 'Expert Leadership',
    stat: '20+ years expertise',
    detail: 'Led by Mr. Karuna Kumar Vakalapudi with decades of competence in construction and finance.',
  },
  {
    title: 'Comprehensive Solutions',
    stat: 'End-to-End service',
    detail: 'Specialised end-to-end solutions for all your property, leasing, and investment needs.',
  },
]

const projects = [
  {
    title: 'Premium Apartments',
    location: 'Hyderabad',
    size: 'Various sizes',
    status: 'Available',
    image:
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Interior of a premium modern apartment block',
    description: 'Explore our curated list of premium apartments across Hyderabad.',
    tags: ['Luxury', 'City Center', 'Modern amenities'],
  },
  {
    title: 'Premium Villas',
    location: 'Hyderabad',
    size: 'Spacious layouts',
    status: 'Available',
    image:
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Exterior view of a luxury premium villa',
    description: 'Spacious and luxurious villas for those who demand the best.',
    tags: ['Independent', 'Gated community', 'Premium lifestyle'],
  },
  {
    title: 'Office Space',
    location: 'Hyderabad',
    size: 'Flexible sizes',
    status: 'Available',
    image:
      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Modern open plan office space',
    description: 'Find the ideal office space tailored to meet your unique business goals.',
    tags: ['Commercial', 'IT corridors', 'Business hubs'],
  },
]

const process = [
  'Review projects.',
  'Contact the team.',
  'Open the dashboard.',
]

const metrics = [
  ['18+', 'Projects tracked'],
  ['4.8/5', 'Buyer rating'],
  ['90 min', 'Response time'],
]

const reviewTestimonials = [
  {
    name: 'Rama Krishna',
    text: 'Kumar helped us shortlist the right apartment quickly and negotiated a fair price without pressure.',
  },
  {
    name: 'Jagadish A',
    text: 'Every site visit was planned clearly, and the team explained location value, access roads, and pricing with complete transparency.',
  },
  {
    name: 'Satish Kumar',
    text: 'The purchase process felt simple from the first call to documentation. We knew exactly what was happening at each step.',
  },
  {
    name: 'Meena Rao',
    text: 'They understood our budget and showed only practical options near schools, offices, and daily conveniences.',
  },
  {
    name: 'Anil Reddy',
    text: 'SpaceLink Infra gave us honest advice on plot potential, approvals, and resale prospects before we made a decision.',
  },
  {
    name: 'Priya Nair',
    text: 'We were moving from another city, and their local knowledge made choosing the right Hyderabad neighbourhood much easier.',
  },
  {
    name: 'Naveen Varma',
    text: 'The team compared villas, apartments, and open plots patiently, helping us choose what matched our long-term plans.',
  },
  {
    name: 'Kavya Sharma',
    text: 'Documentation, payment milestones, and handover details were handled with care. Nothing felt rushed or unclear.',
  },
  {
    name: 'Rahul Menon',
    text: 'Their guidance helped us identify a commercial space with better access, visibility, and rental potential.',
  },
]

const firstTestimonialColumn = reviewTestimonials.slice(0, 3)
const secondTestimonialColumn = reviewTestimonials.slice(3, 6)
const thirdTestimonialColumn = reviewTestimonials.slice(6, 9)

const signatureShowcaseImages = [
  {
    src: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80',
    alt: 'AI concept render of high-rise building towers over a premium urban plot',
  },
  {
    src: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80',
    alt: 'AI concept render of modern avenue buildings around a development-ready land parcel',
  },
  {
    src: 'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1200&q=80',
    alt: 'AI concept render of mixed-use towers and plotted residential zones',
  },
]

// SVG icons for mobile bottom nav
function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function IconStar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h.01M9 16h6" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

export function LandingPage() {
  const clickToCall = import.meta.env.VITE_PUBLIC_CALL_NUMBER?.replace(/\D/g, '')
  const [showFillPrompt, setShowFillPrompt] = useState(false)
  const [activeNavLabel, setActiveNavLabel] = useState('Properties')
  const [activeWhyReason, setActiveWhyReason] = useState(0)
  const [activeMobileNav, setActiveMobileNav] = useState('properties')

  // Scroll reveal via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -48px 0px' },
    )

    document.querySelectorAll('.reveal, .reveal-scale').forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  function handleNavItemClick(label) {
    setActiveNavLabel(label)
  }

  function handleVisitSite(event) {
    event.preventDefault()
    setShowFillPrompt(true)

    const leadFormSection = document.getElementById('lead-form')
    if (leadFormSection) {
      leadFormSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const mobileNavItems = [
    { key: 'properties', label: 'Properties', href: '#properties', icon: <IconHome /> },
    { key: 'features', label: 'About', href: '#features', icon: <IconStar /> },
    { key: 'process', label: 'Process', href: '#process', icon: <IconList /> },
    { key: 'contact', label: 'Contact', href: '#lead-form', icon: <IconPhone /> },
    { key: 'admin', label: 'Admin', href: '/admin', isLink: true, icon: <IconGrid /> },
  ]

  return (
    <div className="landing-body overflow-x-hidden lg:pb-10">

      {/* ── HEADER ────────────────────────────────────── */}
      <header className="shell py-4 sm:py-6">
        <div className="nav-shell glass-card px-5 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-xl font-bold text-brand-ink">SpaceLink Infra</p>
              <p className="nav-brand-tagline text-sm text-brand-muted">Open plots in Hyderabad</p>
            </div>

            {/* Mobile: compact action */}
            <div className="flex items-center gap-2 lg:hidden">
              {clickToCall ? (
                <a className="button-primary px-4 py-2 text-xs" href={`tel:${clickToCall}`}>
                  Call Now
                </a>
              ) : (
                <a className="button-secondary px-4 py-2 text-xs" href="#lead-form">
                  Contact
                </a>
              )}
            </div>

            {/* Desktop: full nav rail + action buttons */}
            <div className="hidden lg:flex flex-1 items-center justify-between gap-4">
              <nav className="nav-rail" id="main-navigation">
                {navigationItems.map((item) => (
                  <a
                    key={item.href}
                    className={`nav-chip ${activeNavLabel === item.label ? 'nav-chip-active' : ''}`}
                    href={item.href}
                    onClick={() => handleNavItemClick(item.label)}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              <div className="flex flex-wrap items-center gap-3">
                <Link className="button-secondary" to="/admin">
                  Lead Dashboard
                </Link>
                {clickToCall ? (
                  <a className="button-primary" href={`tel:${clickToCall}`}>
                    Click to Call
                  </a>
                ) : (
                  <a className="button-primary" href="#lead-form">
                    Contact Options
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main>

        {/* ── HERO ──────────────────────────────────────── */}
        <section className="shell pb-10 pt-4 sm:pt-6 sm:pb-14" id="overview">
          <div className="hero-grid glass-card relative overflow-hidden p-6 sm:p-10 lg:p-12">
            <div className="absolute -left-24 top-10 h-48 w-48 rounded-full bg-orange-200/50 blur-3xl" />
            <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-sky-200/50 blur-3xl" />

            <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div className="animate-rise">
                <div className="badge-ring inline-flex rounded-full border border-brand-accent/20 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-brand-accent">
                  Hyderabad Real Estate
                </div>
                <p className="mt-5 text-kicker">SpaceLink Infra</p>
                <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-tight text-brand-ink sm:text-5xl lg:text-6xl">
                  Comprehensive real estate solutions.
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-brand-muted">
                  Space Link provides specialised services including buying, renting, and selling properties all around Hyderabad.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a className="button-primary" href="#lead-form">
                    Contact Options
                  </a>
                  <a className="button-secondary" href="#properties">
                    View Properties
                  </a>
                  {clickToCall ? (
                    <a className="button-secondary" href={`tel:${clickToCall}`}>
                      Call Now
                    </a>
                  ) : null}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  {benefits.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-brand-ink/10 bg-white/80 px-4 py-2 text-sm font-semibold text-brand-ink"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {highlights.map((item, index) => (
                    <div
                      key={item.label}
                      className="animate-fade rounded-3xl border border-brand-ink/10 bg-white/85 p-5"
                      style={{ animationDelay: `${index * 120}ms` }}
                    >
                      <p className="font-display text-3xl font-bold text-brand-ink">{item.value}</p>
                      <p className="mt-2 text-sm leading-6 text-brand-muted">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div id="lead-form" className="lg:pl-4">
                <LeadForm showFillPrompt={showFillPrompt} />
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ──────────────────────────────────── */}
        <section className="shell pb-8 sm:pb-12" id="features">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="glass-card reveal p-8">
              <p className="text-kicker">Why SpaceLink Infra</p>
              <h2 className="section-title mt-3">Clear, fast, reliable.</h2>

              <div className="mt-6 grid gap-3">
                {whySpaceReasons.map((reason, index) => (
                  <button
                    key={reason.title}
                    className={`reason-chip ${activeWhyReason === index ? 'reason-chip-active' : ''}`}
                    onClick={() => setActiveWhyReason(index)}
                    type="button"
                  >
                    <span className="text-sm font-bold uppercase tracking-[0.18em] text-brand-accent/80">
                      0{index + 1}
                    </span>
                    <span className="ml-3 font-semibold text-brand-ink">{reason.title}</span>
                  </button>
                ))}
              </div>

              <article className="reason-panel mt-5 rounded-3xl border border-brand-ink/10 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-muted">
                  {whySpaceReasons[activeWhyReason].stat}
                </p>
                <p className="mt-3 text-sm leading-7 text-brand-ink">
                  {whySpaceReasons[activeWhyReason].detail}
                </p>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-brand-ink/8">
                  <div
                    className="h-full rounded-full bg-brand-accent transition-all duration-500"
                    style={{ width: `${((activeWhyReason + 1) / whySpaceReasons.length) * 100}%` }}
                  />
                </div>
              </article>

              <div className="mt-5 flex flex-wrap gap-2">
                {benefits.map((benefit) => (
                  <span
                    key={benefit}
                    className="rounded-full border border-brand-ink/10 bg-brand-soft px-3 py-2 text-xs font-semibold text-brand-ink"
                  >
                    {benefit}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 content-start">
              {featureCards.map((card, index) => (
                <article
                  key={card.title}
                  className="reveal reveal-scale feature-panel hover-lift rounded-3xl border border-brand-ink/10 p-6"
                  style={{ '--reveal-delay': `${index * 90}ms` }}
                >
                  <div className="feature-badge">Feature</div>
                  <h3 className="mt-5 font-display text-2xl font-bold text-brand-ink">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-brand-muted">{card.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── PROPERTIES ────────────────────────────────── */}
        <section className="shell pb-8 sm:pb-12" id="properties">
          <div className="glass-card reveal p-8 sm:p-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-kicker">Property Types</p>
                <h2 className="section-title mt-3">Available properties.</h2>
              </div>

              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-ink">
                  Apartments
                </span>
                <span className="rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-ink">
                  Villas
                </span>
                <span className="rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-ink">
                  Commercial
                </span>
              </div>
            </div>

            <div className="mt-8 prop-scroll-wrap">
              {projects.map((project, index) => (
                <article
                  key={project.title}
                  className="prop-scroll-item reveal project-card hover-lift rounded-3xl p-6"
                  style={{ '--reveal-delay': `${index * 110}ms` }}
                >
                  <div className="project-image-frame group relative mb-5 min-h-52 overflow-hidden rounded-3xl">
                    <img
                      alt={project.imageAlt}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      src={project.image}
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,33,47,0.05),rgba(18,33,47,0.5))]" />
                    <div className="absolute bottom-3 left-3 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                      Site preview
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-accent">
                        {project.location}
                      </p>
                      <h3 className="mt-3 font-display text-2xl font-bold text-brand-ink">
                        {project.title}
                      </h3>
                    </div>
                    <span className="rounded-full border border-brand-accent/25 bg-white/80 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-accent">
                      {project.status}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-brand-muted">{project.description}</p>

                  <div className="mt-5 rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-muted">
                      Plot size range
                    </p>
                    <p className="mt-2 font-display text-2xl font-bold text-brand-ink">
                      {project.size}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-brand-ink/10 bg-white/70 px-3 py-2 text-xs font-semibold text-brand-ink"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── PROCESS ───────────────────────────────────── */}
        <section className="shell pb-8 sm:pb-12" id="process">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="glass-card reveal p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-kicker">How It Works</p>
                  <h2 className="section-title mt-3">How it works.</h2>
                </div>
                <span className="rounded-full bg-red-50 px-4 py-2 text-sm font-bold text-red-600">
                  Limited inventory
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {process.map((step, index) => (
                  <div
                    key={step}
                    className="reveal rounded-3xl border border-brand-ink/10 bg-white p-5"
                    style={{ '--reveal-delay': `${index * 110}ms` }}
                  >
                    <p className="font-display text-2xl font-bold text-brand-accent">0{index + 1}</p>
                    <p className="mt-3 text-sm leading-6 text-brand-muted">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="metric-stack reveal rounded-4xl p-8 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-100">
                Metrics
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
                Quick view.
              </h2>

              <div className="mt-8 grid gap-4">
                {metrics.map(([value, label], index) => (
                  <div
                    key={label}
                    className="reveal rounded-[24px] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur-sm"
                    style={{ '--reveal-delay': `${index * 130}ms` }}
                  >
                    <p className="font-display text-3xl font-bold">{value}</p>
                    <p className="mt-2 text-sm leading-6 text-white/70">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── SHOWCASE ──────────────────────────────────── */}
        <section className="shell pb-8 sm:pb-12">
          <div className="showcase-panel reveal relative overflow-hidden rounded-4xl border border-brand-ink/10 p-6 shadow-[0_24px_80px_rgba(18,33,47,0.08)] sm:p-8 lg:p-10">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(239,125,52,0.18),transparent_60%)]" />
            <div className="relative">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-kicker">Showcase</p>
                  <h2 className="section-title mt-3">
                    Larger plot showcase.
                  </h2>
                </div>

                <div className="flex flex-wrap gap-3">
                  <span className="rounded-full border border-brand-ink/10 bg-white/80 px-4 py-2 text-sm font-semibold text-brand-ink">
                    Larger frontage
                  </span>
                  <span className="rounded-full border border-brand-ink/10 bg-white/80 px-4 py-2 text-sm font-semibold text-brand-ink">
                    Development-ready parcels
                  </span>
                </div>
              </div>

              <div className="mt-8">
                <article className="showcase-hero group relative overflow-hidden rounded-[28px] p-6 sm:p-8">
                  <div className="absolute right-6 top-6 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-white/90">
                    Plot demo
                  </div>

                  <div className="relative grid gap-6">
                    <div className="grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
                      <div className="showcase-image-card relative min-h-80 overflow-hidden rounded-3xl">
                        <img
                          src={signatureShowcaseImages[0].src}
                          alt={signatureShowcaseImages[0].alt}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,19,29,0.12),rgba(7,19,29,0.45))]" />
                      </div>

                      <div className="grid gap-4">
                        <div className="showcase-image-card relative min-h-38 overflow-hidden rounded-3xl">
                          <img
                            src={signatureShowcaseImages[1].src}
                            alt={signatureShowcaseImages[1].alt}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,19,29,0.08),rgba(7,19,29,0.72))]" />
                        </div>

                        <div className="showcase-image-card relative min-h-38 overflow-hidden rounded-3xl">
                          <img
                            src={signatureShowcaseImages[2].src}
                            alt={signatureShowcaseImages[2].alt}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,19,29,0.08),rgba(7,19,29,0.72))]" />
                        </div>
                      </div>
                    </div>

                    <div className="relative">
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-100">
                        Signature parcel
                      </p>
                      <h3 className="mt-4 font-display text-3xl font-bold text-white sm:text-4xl">
                        Premium large-format plots.
                      </h3>

                      <a className="button-primary mt-6" href="#lead-form" onClick={handleVisitSite}>
                        Contact Team
                      </a>

                      <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
                        {[
                          ['1,200 sq. yd.', 'Prime buildable area'],
                          ['30 m roads', 'Easy access'],
                          ['3 formats', 'Residential or mixed-use'],
                        ].map(([value, label]) => (
                          <div
                            key={label}
                            className="rounded-[22px] border border-white/15 bg-white/10 p-4 backdrop-blur-sm transition duration-300 group-hover:-translate-y-1"
                          >
                            <p className="font-display text-2xl font-bold text-white">{value}</p>
                            <p className="mt-2 text-sm leading-6 text-white/70">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        {/* ── TESTIMONIALS ──────────────────────────────── */}
        <section className="shell pb-8 sm:pb-12" id="testimonials">
          <div className="glass-card reveal overflow-hidden p-8 sm:p-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-kicker">Testimonials</p>
              <h2 className="section-title mt-3">What buyers say.</h2>
              <p className="mt-4 text-sm leading-7 text-brand-muted">
                Real estate guidance that keeps choices clear, practical, and easy to act on.
              </p>
            </div>

            <div className="reviews-marquee mt-10 flex justify-center gap-6 overflow-hidden">
              <TestimonialsColumn testimonials={firstTestimonialColumn} duration={15} />
              <TestimonialsColumn
                testimonials={secondTestimonialColumn}
                className="hidden md:block"
                duration={19}
              />
              <TestimonialsColumn
                testimonials={thirdTestimonialColumn}
                className="hidden lg:block"
                duration={17}
              />
            </div>
          </div>
        </section>

        {/* ── CTA BAND ──────────────────────────────────── */}
        <section className="shell" id="contact">
          <div className="cta-band reveal rounded-4xl px-6 py-8 sm:px-8 sm:py-10">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-100">
                  Contact
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
                  Ready to talk?
                </h2>
              </div>

              <div className="flex flex-wrap gap-3 lg:justify-end">
                <a className="button-primary" href="#lead-form">
                  Contact Options
                </a>
                {clickToCall ? (
                  <a className="button-secondary border-white/20 bg-white/10 text-white hover:text-white" href={`tel:${clickToCall}`}>
                    Call Sales Team
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── MOBILE BOTTOM NAVIGATION ──────────────────── */}
      <nav className="mobile-bottom-nav lg:hidden" aria-label="Site navigation">
        <div className="mobile-bottom-nav-inner">
          {mobileNavItems.map((item) => {
            const isActive = activeMobileNav === item.key
            const cls = `mobile-nav-item${isActive ? ' mobile-nav-item-active' : ''}`

            if (item.isLink) {
              return (
                <Link
                  key={item.key}
                  to={item.href}
                  className={cls}
                  onClick={() => setActiveMobileNav(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              )
            }

            return (
              <a
                key={item.key}
                href={item.href}
                className={cls}
                onClick={() => setActiveMobileNav(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            )
          })}
        </div>
      </nav>

    </div>
  )
}

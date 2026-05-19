import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import MessageBubble from '../MessageBubble.jsx'
import TakeoverBanner from '../TakeoverBanner.jsx'
import { configureCrm } from '../config.js'

describe('component smoke', () => {
  beforeEach(() => {
    configureCrm({
      apiBaseUrl: 'https://api.test',
      wsBaseUrl: 'wss://api.test',
      getToken: () => 'TKN',
      onUnauthorized: () => {},
    })
    global.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
  })

  it('renders MessageBubble with text', () => {
    const { container } = render(
      <MessageBubble msg={{ id: 1, message_text: 'hello', role: 'user', created_at: new Date().toISOString() }} />
    )
    expect(container.textContent.includes('hello')).toBe(true)
  })

  it('renders TakeoverBanner', () => {
    const { container } = render(
      <TakeoverBanner lead={{ id: 1, ai_active: false, ai_paused_until: null }} onResume={() => {}} />
    )
    expect(container.firstChild).toBeTruthy()
  })
})

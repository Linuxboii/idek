import { describe, it, expect, beforeEach, vi } from 'vitest'
import { configureCrm } from '../config.js'
import { request } from '../api.js'

describe('api request()', () => {
  let lastFetch

  beforeEach(() => {
    lastFetch = null
    global.fetch = vi.fn(async (url, opts) => {
      lastFetch = { url, opts }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    configureCrm({
      apiBaseUrl: 'https://api.test',
      wsBaseUrl: 'wss://api.test',
      getToken: () => 'TKN-123',
      onUnauthorized: () => {},
    })
  })

  it('prepends apiBaseUrl to path', async () => {
    await request('/api/conversations')
    expect(lastFetch.url).toBe('https://api.test/api/conversations')
  })

  it('attaches Authorization: Bearer <token>', async () => {
    await request('/api/conversations')
    expect(lastFetch.opts.headers.Authorization).toBe('Bearer TKN-123')
  })

  it('omits Authorization header when getToken returns null', async () => {
    configureCrm({ getToken: () => null })
    await request('/api/public')
    expect(lastFetch.opts.headers.Authorization).toBeUndefined()
  })

  it('invokes onUnauthorized on 401 responses', async () => {
    let called = 0
    configureCrm({ onUnauthorized: () => { called++ } })
    global.fetch = vi.fn(async () => new Response('nope', { status: 401 }))
    await expect(request('/api/secure')).rejects.toThrow()
    expect(called).toBe(1)
  })
})

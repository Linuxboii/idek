import { describe, it, expect, beforeEach } from 'vitest'
import { configureCrm, getCrmConfig } from '../config.js'

describe('configureCrm', () => {
  beforeEach(() => {
    configureCrm({
      apiBaseUrl: '',
      wsBaseUrl: '',
      getToken: () => null,
      onUnauthorized: () => {},
    })
  })

  it('returns default config before configuration', () => {
    const cfg = getCrmConfig()
    expect(cfg.apiBaseUrl).toBe('')
    expect(cfg.getToken()).toBeNull()
  })

  it('merges partial updates into current config', () => {
    configureCrm({ apiBaseUrl: 'https://api.example.com' })
    const cfg = getCrmConfig()
    expect(cfg.apiBaseUrl).toBe('https://api.example.com')
    expect(typeof cfg.getToken).toBe('function')
  })

  it('preserves getToken closure across calls', () => {
    let token = 'abc'
    configureCrm({ getToken: () => token })
    expect(getCrmConfig().getToken()).toBe('abc')
    token = 'xyz'
    expect(getCrmConfig().getToken()).toBe('xyz')
  })

  it('calls onUnauthorized when invoked', () => {
    let called = 0
    configureCrm({ onUnauthorized: () => { called++ } })
    getCrmConfig().onUnauthorized()
    expect(called).toBe(1)
  })
})

import { getCrmConfig } from './config.js'

/**
 * Core fetch wrapper. Returns parsed body directly (NOT an axios-shaped envelope).
 * Use requestAxios() for the axios-shaped { data } envelope expected by
 * existing consumers ported from crm-web / sli-lg.
 */
export async function request(path, { method = 'GET', body, headers = {}, params } = {}) {
  const { apiBaseUrl, getToken, onUnauthorized } = getCrmConfig()
  const token = getToken()
  const finalHeaders = { ...headers }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && body !== null && !isFormData) {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json'
  }
  if (token) finalHeaders.Authorization = `Bearer ${token}`

  let url = `${apiBaseUrl}${path}`
  if (params && typeof params === 'object') {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += (url.includes('?') ? '&' : '?') + s
  }

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: isFormData ? body : (body !== undefined && body !== null ? JSON.stringify(body) : undefined),
  })

  if (res.status === 401) {
    onUnauthorized()
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} ${text}`)
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

/**
 * Axios-shaped wrapper — returns { data } to match the response shape
 * existing consumers (apps/crm-web, apps/sli-lg) expect.
 */
async function req(path, opts) {
  const data = await request(path, opts)
  return { data }
}

export const authApi = {
  login: (email, password) =>
    req('/api/auth/login', { method: 'POST', body: { email, password } }),
}

export const conversationsApi = {
  // Accepts either positional args (limit, offset) OR an object form
  // ({ limit, offset, phone }). Object form supports the phone filter
  // used by sli-lg's WhatsAppDrawer.
  list: (...args) => {
    let limit = 50
    let offset = 0
    let phone
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      ({ limit = 50, offset = 0, phone } = args[0])
    } else {
      const [a = 50, b = 0] = args
      limit = a
      offset = b
    }
    const params = { limit, offset }
    if (phone) params.phone = phone
    return req('/api/conversations', { params })
  },
  get: (id) => req(`/api/conversations/${id}`),
}

export const leadsApi = {
  takeover: (id) => req(`/api/leads/${id}/takeover`, { method: 'PUT' }),
  resumeAI: (id) => req(`/api/leads/${id}/takeover`, { method: 'DELETE' }),
  assign: (id, agentId) =>
    req(`/api/leads/${id}/assign`, { method: 'PUT', params: { agent_id: agentId } }),
}

export const chatApi = {
  sendText: (leadId, text) =>
    req(`/api/chat/${leadId}/send-text`, { method: 'POST', body: { text } }),
  sendMedia: (leadId, file, caption = '') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('caption', caption)
    return req(`/api/chat/${leadId}/send-media`, { method: 'POST', body: fd })
  },
}

export const usersApi = {
  list: () => req('/api/users'),
  create: (data) => req('/api/users', { method: 'POST', body: data }),
  update: (id, data) => req(`/api/users/${id}`, { method: 'PUT', body: data }),
  deactivate: (id) => req(`/api/users/${id}`, { method: 'DELETE' }),
}

// SLI-LG named export
export function mediaUrl(mediaId) {
  const { apiBaseUrl } = getCrmConfig()
  return `${apiBaseUrl}/api/media/${mediaId}`
}

export const mediaApi = {
  url: mediaUrl,
}

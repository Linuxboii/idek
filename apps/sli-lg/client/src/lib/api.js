import {
  LEADS_API_BASE_URL,
  WHATSAPP_ADMIN_TOKEN,
  WHATSAPP_API_BASE_URL,
} from '../config/endpoints'

const API_BASE_URL = LEADS_API_BASE_URL.replace(/\/$/, '')
const WHATSAPP_BASE_URL = WHATSAPP_API_BASE_URL.replace(/\/$/, '')

async function request(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const error = new Error(payload.message ?? 'Unable to reach the lead API right now.')
    error.status = response.status
    throw error
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response
}

async function whatsappRequest(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(WHATSAPP_ADMIN_TOKEN ? { Authorization: `Bearer ${WHATSAPP_ADMIN_TOKEN}` } : {}),
    ...(options.headers ?? {}),
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${WHATSAPP_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const error = new Error(payload.message ?? payload.error ?? 'Unable to reach the WhatsApp API right now.')
    error.status = response.status
    throw error
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response
}

function normalizeCollection(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  if (Array.isArray(payload?.items)) {
    return payload.items
  }

  return []
}

export function getApiBaseUrl() {
  return API_BASE_URL
}

export function getWhatsAppApiBaseUrl() {
  return WHATSAPP_BASE_URL
}

export async function getHealth() {
  return request('/')
}

export async function getTemplateJobs(limit = 10) {
  const payload = await whatsappRequest(`/api/jobs?limit=${encodeURIComponent(limit)}`)
  return normalizeCollection(payload?.jobs ?? payload)
}

export async function getTemplateJob(jobId) {
  return whatsappRequest(`/api/jobs/${encodeURIComponent(jobId)}`)
}

export async function getLeads() {
  const payload = await request('/leads')
  return normalizeCollection(payload)
}

export async function searchLeads(query) {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return getLeads()
  }

  const payload = await request(`/search?q=${encodeURIComponent(trimmedQuery)}`)
  return normalizeCollection(payload)
}

export async function getLeadDetail(leadId) {
  const [detail, insights] = await Promise.all([
    request(`/leads/${leadId}`),
    request(`/insights/${leadId}`).catch(() => ({}))
  ]);

  if (detail && detail.lead) {
    // Merge insights into lead
    detail.lead = { ...detail.lead, ...insights };

    // If backend doesn't provide exact counts, calculate them from messages
    if (detail.messages && Array.isArray(detail.messages)) {
      if (detail.lead.messages_received === undefined) {
        detail.lead.messages_received = detail.messages.filter(m => m.role === 'user').length;
      }
      if (detail.lead.messages_sent === undefined) {
        detail.lead.messages_sent = detail.messages.filter(m => m.role !== 'user').length;
      }
      if (detail.lead.exact_message_count === undefined) {
        detail.lead.exact_message_count = detail.messages.length;
      }
    }
  }

  return detail;
}

export async function importLeads(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE_URL}/import-leads`, {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error ?? 'Failed to import leads');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

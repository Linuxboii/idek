import { useCallback, useEffect, useRef } from 'react'
import { getCrmConfig } from './config.js'

/**
 * React hook for the CRM WebSocket connection.
 * URL is built from getCrmConfig().wsBaseUrl + getToken() at connect-time.
 * Includes exponential-backoff reconnect (max 5 attempts, capped at 30s).
 */
export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const retryCount = useRef(0)
  const onMsgRef = useRef(onMessage)

  useEffect(() => {
    onMsgRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    const { wsBaseUrl, getToken } = getCrmConfig()
    const token = getToken()
    if (!token || !wsBaseUrl) return undefined

    const base = wsBaseUrl.replace(/\/$/, '')
    let cancelled = false

    function connect() {
      if (cancelled) return null

      const socket = new WebSocket(`${base}/ws?token=${encodeURIComponent(token)}`)

      socket.onopen = () => { retryCount.current = 0 }

      socket.onmessage = (e) => {
        try { onMsgRef.current?.(JSON.parse(e.data)) } catch { /* ignore bad JSON */ }
      }

      socket.onclose = () => {
        if (cancelled || retryCount.current >= 5) return
        const delay = Math.min(1000 * 2 ** retryCount.current, 30000)
        retryCount.current++
        setTimeout(connect, delay)
      }

      ws.current = socket
      return socket
    }

    const socket = connect()
    return () => {
      cancelled = true
      retryCount.current = 99
      socket?.close()
      ws.current = null
    }
  }, [])

  const subscribe = useCallback((leadId) => {
    ws.current?.send(JSON.stringify({ action: 'subscribe', lead_id: leadId }))
  }, [])

  const unsubscribe = useCallback((leadId) => {
    ws.current?.send(JSON.stringify({ action: 'unsubscribe', lead_id: leadId }))
  }, [])

  return { subscribe, unsubscribe }
}

// Alias for consumers that prefer the explicit name.
export const useCrmWebSocket = useWebSocket

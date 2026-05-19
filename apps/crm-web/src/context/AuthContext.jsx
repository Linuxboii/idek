import { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'
import { configureCrm } from '@spacelink/whatsapp-crm'

const API_BASE = 'https://wa-slilg.avlokai.com'
const WS_BASE = 'wss://wa-slilg.avlokai.com'

const AuthContext = createContext(null)

// Port of old api.js refresh-token logic.
async function refreshAccessToken() {
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) return null
  try {
    const { data } = await axios.post(`${API_BASE}/api/auth/login`, {}, {
      headers: { Authorization: `Bearer ${refresh}` },
    })
    if (data?.access_token) {
      localStorage.setItem('access_token', data.access_token)
      return data.access_token
    }
  } catch { /* fall through */ }
  return null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user')) } catch { return null }
  })
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('access_token'))

  const login = (userData, access, refresh) => {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
    localStorage.setItem('crm_user', JSON.stringify(userData))
    setAccessToken(access)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('crm_user')
    setAccessToken(null)
    setUser(null)
  }

  useEffect(() => {
    configureCrm({
      apiBaseUrl: API_BASE,
      wsBaseUrl: WS_BASE,
      getToken: () => localStorage.getItem('access_token'),
      onUnauthorized: async () => {
        const fresh = await refreshAccessToken()
        if (fresh) {
          setAccessToken(fresh)
          return
        }
        logout()
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
      },
    })
  }, [accessToken])

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

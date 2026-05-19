const ADMIN_AUTH_STORAGE_KEY = 'spacelink-admin-auth'
const ADMIN_PASSWORD = 'SpaceLink@7426'

export function isAdminAuthenticated() {
  return window.localStorage.getItem(ADMIN_AUTH_STORAGE_KEY) === 'true'
}

export function authenticateAdmin(password) {
  const isValidPassword = password === ADMIN_PASSWORD

  if (isValidPassword) {
    window.localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, 'true')
  }

  return isValidPassword
}

export function clearAdminAuthentication() {
  window.localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY)
}

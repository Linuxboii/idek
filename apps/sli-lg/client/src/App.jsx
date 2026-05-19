import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AdminPage } from './pages/AdminPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { isAdminAuthenticated } from './lib/auth'

function ProtectedAdminRoute() {
  const location = useLocation()

  return isAdminAuthenticated() ? <Outlet /> : <Navigate replace state={{ from: location }} to="/login" />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedAdminRoute />}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

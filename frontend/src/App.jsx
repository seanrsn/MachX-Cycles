import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore, isTokenExpired } from './store/authStore'
import Login from './pages/Login'
import AdminLayout from './components/layout/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Bikes from './pages/admin/Bikes'
import BikeForm from './pages/admin/BikeForm'
import Orders from './pages/admin/Orders'
import OrderDetail from './pages/admin/OrderDetail'
import Promotions from './pages/admin/Promotions'
import Settings from './pages/admin/Settings'
import Home from './pages/store/Home'
import Shop from './pages/store/Shop'
import BikeDetail from './pages/store/BikeDetail'
import Checkout from './pages/store/Checkout'
import OrderConfirmation from './pages/store/OrderConfirmation'
import OrderLookup from './pages/store/OrderLookup'
import About from './pages/store/About'
import Contact from './pages/store/Contact'
import Support from './pages/store/Support'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function RequireAuth({ children }) {
  const token  = useAuthStore(s => s.idToken)
  const logout = useAuthStore(s => s.logout)
  const location = useLocation()

  // Re-check expiry on focus + every 30s while the tab is open. Forces a
  // re-render so an expired token kicks the user back to /login even if they
  // never trigger an API call.
  const [, tick] = useState(0)
  useEffect(() => {
    const onFocus = () => tick(n => n + 1)
    const id = setInterval(onFocus, 30_000)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [])

  if (!token || isTokenExpired(token)) {
    if (token) logout()  // stale token — clear it before redirecting
    return <Navigate to="/login" replace state={{ from: location.pathname, expired: !!token }} />
  }
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Public storefront */}
        <Route path="/"                  element={<Home />} />
        <Route path="/shop"              element={<Shop />} />
        <Route path="/bikes/:id"         element={<BikeDetail />} />
        <Route path="/checkout"          element={<Checkout />} />
        <Route path="/order-confirmation" element={<OrderConfirmation />} />
        <Route path="/track-order"       element={<OrderLookup />} />
        <Route path="/about"             element={<About />} />
        <Route path="/contact"           element={<Contact />} />
        <Route path="/support"           element={<Support />} />

        {/* Auth */}
        <Route path="/login" element={<Login />} />

        {/* Admin (protected) */}
        <Route
          path="/admin"
          element={<RequireAuth><AdminLayout /></RequireAuth>}
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"      element={<Dashboard />} />
          <Route path="bikes"          element={<Bikes />} />
          <Route path="bikes/new"      element={<BikeForm />} />
          <Route path="bikes/:id/edit" element={<BikeForm />} />
          <Route path="orders"         element={<Orders />} />
          <Route path="orders/:id"     element={<OrderDetail />} />
          <Route path="promotions"     element={<Promotions />} />
          <Route path="settings"       element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

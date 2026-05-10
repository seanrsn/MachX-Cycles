import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import { useAuthStore, isTokenExpired } from './store/authStore'

// Eager: home page (LCP route — shouldn't block on a chunk fetch)
import Home from './pages/store/Home'

// Lazy: every other route. Cuts initial bundle dramatically — Stripe SDK,
// Cognito SDK, and admin pages all become separate chunks loaded on-demand.
const Shop              = lazy(() => import('./pages/store/Shop'))
const BikeDetail        = lazy(() => import('./pages/store/BikeDetail'))
const Checkout          = lazy(() => import('./pages/store/Checkout'))
const OrderConfirmation = lazy(() => import('./pages/store/OrderConfirmation'))
const OrderLookup       = lazy(() => import('./pages/store/OrderLookup'))
const About             = lazy(() => import('./pages/store/About'))
const Contact           = lazy(() => import('./pages/store/Contact'))
const Support           = lazy(() => import('./pages/store/Support'))
const Login             = lazy(() => import('./pages/Login'))
const NotFound          = lazy(() => import('./pages/store/NotFound'))
const AdminLayout       = lazy(() => import('./components/layout/AdminLayout'))
const Dashboard         = lazy(() => import('./pages/admin/Dashboard'))
const Bikes             = lazy(() => import('./pages/admin/Bikes'))
const BikeForm          = lazy(() => import('./pages/admin/BikeForm'))
const Orders            = lazy(() => import('./pages/admin/Orders'))
const OrderDetail       = lazy(() => import('./pages/admin/OrderDetail'))
const Promotions        = lazy(() => import('./pages/admin/Promotions'))
const Settings          = lazy(() => import('./pages/admin/Settings'))

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

// Lightweight loading screen for lazy chunks. Skeleton-style so it doesn't flash white.
function ChunkFallback() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-10 h-10 border-3 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<ChunkFallback />}>
        <Routes>
          {/* Public storefront */}
          <Route path="/"                  element={<Home />} />
          <Route path="/shop"                element={<Shop />} />
          <Route path="/shop/:categorySlug"  element={<Shop />} />
          {/* Bike URLs: /bikes/123-cannondale-supersix-medium (slug). Bare /bikes/123
              still works — BikeDetail strips the leading numeric ID for the lookup. */}
          <Route path="/bikes/:slug"       element={<BikeDetail />} />
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

          {/* Explicit /404 route so prerender can capture the NotFound HTML —
              CloudFront's CustomErrorResponse maps S3 404s to /404/index.html
              with HTTP status 404. The catch-all below renders the same
              component client-side for any unknown path. */}
          <Route path="/404" element={<NotFound />} />
          <Route path="*"    element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { lookupOrder } from '../../api/public'
import { safeJsonLd } from '../../utils/safeJsonLd'
import { Search, Package, Truck, ExternalLink } from 'lucide-react'

const CARRIER_LABELS = {
  BIKEFLIGHTS: 'BikeFlights',
  UPS:         'UPS',
  FEDEX:       'FedEx',
  USPS:        'USPS',
  OTHER:       'Carrier',
}
import Navbar from '../../components/store/Navbar'

// Friendly labels + (optional) helper text per event type, so the customer
// timeline reads like a story instead of a raw enum dump.
const EVENT_LABEL = {
  created:          'Order placed',
  payment_received: 'Payment received',
  shipped:          'Shipped',
  delivered:        'Delivered',
  cancelled:        'Cancelled',
  refunded:         'Refunded',
}

function fmtEventTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  const now    = Date.now()
  const diffMs = now - dt.getTime()
  if (diffMs >= 0 && diffMs < 60_000)        return 'Just now'
  if (diffMs >= 0 && diffMs < 3600_000)      return `${Math.floor(diffMs / 60_000)} min ago`
  return dt.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

const STATUS_COLOR = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function OrderLookup() {
  const [email, setEmail]         = useState('')
  const [orderNum, setOrderNum]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [order, setOrder]         = useState(null)
  const [error, setError]         = useState('')

  async function handleLookup(e) {
    e.preventDefault()
    if (!email || !orderNum) { setError('Please enter both email and order number.'); return }
    setLoading(true); setError(''); setOrder(null)
    try {
      const data = await lookupOrder(email, orderNum)
      // Backend returns { order: {...}, items: [...], events?: [...], pending_materialization? }
      // Flatten so the existing JSX (which reads order.X) works whether the data
      // came from the orders table or the in-flight checkout_sessions fallback.
      const flat = {
        ...(data.order || {}),
        items:  data.items || [],
        events: data.events || [],
        pending_materialization: data.pending_materialization || false,
      }
      setOrder(flat)
    } catch (err) {
      setError(err.message === 'Request failed: 404' ? 'Order not found. Check your email and order number.' : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Track Your Order | MachX Cycles</title>
        <meta name="description" content="Look up your MachX Cycles order status with your email and order number." />
        <link rel="canonical" href="https://machxcycles.com/track-order" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Track Your Order | MachX Cycles" />
        <meta property="og:description" content="Look up your order status." />
        <meta property="og:url" content="https://machxcycles.com/track-order" />
        <meta property="og:image" content="https://machxcycles.com/MachXPic.jpg" />
        <meta name="twitter:title" content="Track Your Order | MachX Cycles" />
        <meta name="twitter:description" content="Look up your order status." />
        <meta name="twitter:image" content="https://machxcycles.com/MachXPic.jpg" />
        <script type="application/ld+json">
          {safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home",        "item": "https://machxcycles.com/" },
              { "@type": "ListItem", "position": 2, "name": "Track Order", "item": "https://machxcycles.com/track-order" }
            ]
          })}
        </script>
      </Helmet>
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl mx-gradient-bg flex items-center justify-center shadow-lg shadow-pink-900/20">
            <Package size={24} className="text-white" strokeWidth={2.25} />
          </div>
          <p className="text-pink-600 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">Track Order</p>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
            Find your <span className="mx-gradient-text">ride.</span>
          </h1>
          <p className="text-gray-500 mt-2">Enter your email and order number to check status.</p>
        </div>

        <form onSubmit={handleLookup} className="bg-white rounded-2xl ring-1 ring-gray-200/80 p-6 space-y-4 shadow-sm">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Order Number</label>
            <input
              value={orderNum}
              onChange={e => setOrderNum(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500 font-mono"
              placeholder="MX-XXXXXXXX"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full mx-gradient-btn disabled:bg-pink-400 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Search size={18} />
            {loading ? 'Looking up…' : 'Look Up Order'}
          </button>
        </form>

        {/* Order result */}
        {order && (
          <div className="mt-6 bg-white rounded-2xl ring-1 ring-gray-200/80 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">{order.order_number}</p>
                <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${STATUS_COLOR[order.status] || 'bg-gray-100 text-gray-700'}`}>
                {order.status}
              </span>
            </div>

            {order.items?.length > 0 && (
              <div className="px-6 py-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Items</p>
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-700">
                    <span>{item.bike_name || 'Bike'}</span>
                    <span className="font-medium">${parseFloat(item.unit_price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
              <div className="flex justify-between font-bold text-gray-900">
                <span>Total</span>
                <span>${parseFloat(order.total ?? order.total_amount ?? 0).toFixed(2)}</span>
              </div>
            </div>

            {order.tracking_number && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gradient-to-r from-pink-50/40 to-orange-50/40">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm shrink-0">
                    <Truck size={20} className="text-pink-600" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Shipped via {CARRIER_LABELS[order.tracking_carrier] || 'Carrier'}</p>
                    <p className="font-mono text-sm text-gray-900 break-all">{order.tracking_number}</p>
                    {order.estimated_delivery && (
                      <p className="text-xs text-gray-600 mt-1">Estimated delivery: <span className="font-semibold">{new Date(order.estimated_delivery).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span></p>
                    )}
                    {order.tracking_url && (
                      <a
                        href={order.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-pink-600 hover:text-pink-700"
                      >
                        Track shipment <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {order.events?.length > 0 && (
              <div className="px-6 py-4 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-700 mb-3">Timeline</p>
                <div className="space-y-3">
                  {order.events.map((ev, i) => {
                    const label = EVENT_LABEL[ev.event_type] || ev.event_type?.replace(/_/g, ' ')
                    return (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <div className="w-2 h-2 rounded-full bg-pink-600 mt-1.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-gray-900 font-medium">{label}</p>
                            <p className="text-gray-400 text-xs whitespace-nowrap">{fmtEventTime(ev.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { lookupOrder } from '../../api/public'
import { Search, Package } from 'lucide-react'
import Navbar from '../../components/store/Navbar'

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
      setOrder(data)
    } catch (err) {
      setError(err.message === 'Request failed: 404' ? 'Order not found. Check your email and order number.' : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
              placeholder="MX-20260222-A1B2"
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
                    <span>{item.bike_name || 'Bike'} × {item.quantity}</span>
                    <span className="font-medium">${parseFloat(item.unit_price * item.quantity).toFixed(2)}</span>
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

            {order.events?.length > 0 && (
              <div className="px-6 py-4 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-700 mb-3">History</p>
                <div className="space-y-2">
                  {order.events.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-pink-600 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-gray-900 capitalize font-medium">{ev.event_type?.replace(/_/g, ' ')}</p>
                        {(ev.message || ev.notes) && <p className="text-gray-500">{ev.message || ev.notes}</p>}
                        <p className="text-gray-400 text-xs">{new Date(ev.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

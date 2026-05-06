import { useLocation, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { CheckCircle, ArrowRight, Mail, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { useCartStore } from '../../store/cartStore'
import Navbar from '../../components/store/Navbar'

export default function OrderConfirmation() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clearCart = useCartStore(s => s.clearCart)
  
  const [status, setStatus] = useState('loading') // loading, success, failed, pending
  const [order, setOrder] = useState(null)
  
  useEffect(() => {
    // Check for Stripe redirect parameters
    const redirectStatus = searchParams.get('redirect_status')
    const paymentIntent = searchParams.get('payment_intent')
    const orderNumber = searchParams.get('order_number')
    const total = searchParams.get('total')
    
    // Case 1: Redirect from Stripe (Klarna, Affirm, etc.)
    if (redirectStatus) {
      if (redirectStatus === 'succeeded') {
        setStatus('success')
        setOrder({ order_number: orderNumber, total })
        clearCart()
      } else if (redirectStatus === 'processing') {
        setStatus('pending')
        setOrder({ order_number: orderNumber, total })
        clearCart()
      } else {
        // failed, requires_action, etc.
        setStatus('failed')
      }
      return
    }
    
    // Case 2: Direct navigation from checkout (card payment)
    if (state?.fromCheckout && state?.order) {
      setStatus('success')
      setOrder(state.order)
      clearCart()
      return
    }
    
    // Case 3: Direct URL access without proper state
    if (!state?.fromCheckout && !redirectStatus) {
      // Redirect to homepage - shouldn't access this page directly
      navigate('/')
      return
    }
    
    setStatus('failed')
  }, [searchParams, state, clearCart, navigate])

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <Loader2 size={48} className="mx-auto text-pink-600 animate-spin mb-4" />
          <p className="text-gray-600">Verifying payment...</p>
        </div>
      </div>
    )
  }

  // Failed state
  if (status === 'failed') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <XCircle size={64} className="mx-auto text-red-500 mb-6" />
          <h1 className="text-3xl font-black text-gray-900 mb-2">Payment Failed</h1>
          <p className="text-gray-500 mb-6">
            Your payment could not be processed. Please try again.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to="/checkout"
              className="inline-flex items-center justify-center gap-2 mx-gradient-btn text-white px-8 py-3.5 rounded-xl font-semibold transition-colors"
            >
              Return to Checkout <ArrowRight size={18} />
            </Link>
            <Link
              to="/shop"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:border-pink-500 hover:text-pink-600 px-8 py-3.5 rounded-xl font-semibold transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Pending state (payment processing)
  if (status === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <AlertCircle size={64} className="mx-auto text-amber-500 mb-6" />
          <h1 className="text-3xl font-black text-gray-900 mb-2">Payment Processing</h1>
          {order?.order_number && (
            <p className="text-gray-500 mb-1">
              Order <span className="font-semibold text-gray-800">{order.order_number}</span>
            </p>
          )}
          <p className="text-gray-500 mb-6">
            Your payment is being processed. This may take a few minutes.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-8 text-sm text-amber-800">
            <p>We'll send you an email once your payment is confirmed. You can also check your order status using the Track Order page.</p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              to="/track-order"
              className="inline-flex items-center justify-center gap-2 mx-gradient-btn text-white px-8 py-3.5 rounded-xl font-semibold transition-colors"
            >
              Track Order <ArrowRight size={18} />
            </Link>
            <Link
              to="/shop"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:border-pink-500 hover:text-pink-600 px-8 py-3.5 rounded-xl font-semibold transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <CheckCircle size={64} className="mx-auto text-green-500 mb-6" />
        <h1 className="text-3xl font-black text-gray-900 mb-2">Payment Confirmed!</h1>
        {order?.order_number && (
          <p className="text-gray-500 mb-1">
            Order <span className="font-semibold text-gray-800">{order.order_number}</span>
          </p>
        )}
        {order?.total != null && (
          <p className="text-2xl font-bold text-gray-900 mb-6">
            ${parseFloat(order.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-left mb-8 space-y-3 text-sm text-gray-700">
          <div className="flex items-start gap-3">
            <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />
            <span>Your payment was processed successfully</span>
          </div>
          <div className="flex items-start gap-3">
            <Mail size={16} className="text-pink-600 mt-0.5 shrink-0" />
            <span>A confirmation email is on its way to you</span>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />
            <span>Your order is now being processed</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            to="/track-order"
            className="inline-flex items-center justify-center gap-2 mx-gradient-btn text-white px-8 py-3.5 rounded-xl font-semibold transition-colors"
          >
            Track Order <ArrowRight size={18} />
          </Link>
          <Link
            to="/shop"
            className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:border-pink-500 hover:text-pink-600 px-8 py-3.5 rounded-xl font-semibold transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  )
}

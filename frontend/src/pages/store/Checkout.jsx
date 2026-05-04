import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trash2, Bike, ShoppingCart, ChevronRight, Lock, Loader2 } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

import { getShippingRates, createOrder } from '../../api/public'
import { useCartStore, selectSubtotal } from '../../store/cartStore'
import Navbar from '../../components/store/Navbar'

const _stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = _stripeKey.startsWith('pk_') ? loadStripe(_stripeKey) : null

const STEPS = ['Cart', 'Details', 'Shipping', 'Payment']

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors
            ${i <= step ? 'bg-pink-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {i < step ? '✓' : i + 1}
          </div>
          <span className={`ml-1 text-xs font-medium hidden sm:inline ${i === step ? 'text-gray-900' : 'text-gray-400'}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`w-6 sm:w-10 h-0.5 mx-1 ${i < step ? 'bg-pink-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 0: Cart ───────────────────────────────────────────────────────────────

function CartStep({ items, onRemove, onQty, subtotal, onNext }) {
  if (items.length === 0) return (
    <div className="text-center py-16">
      <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
      <p className="text-gray-500 mb-4">Your cart is empty</p>
      <Link to="/shop" className="inline-block bg-pink-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-pink-700 transition-colors">
        Shop Now
      </Link>
    </div>
  )

  return (
    <div className="space-y-4">
      {items.map(item => (
        <div key={item.variantId} className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
            {item.imageUrl
              ? <img src={item.imageUrl} alt={item.bikeName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Bike size={24} className="text-gray-300" /></div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{item.bikeName}</p>
            <p className="text-sm text-gray-500">{item.variantLabel}</p>
            <p className="font-bold text-gray-900 mt-1">
              ${(item.price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onQty(item.variantId, item.quantity - 1)} className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-700 hover:border-pink-500">−</button>
            <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
            <button onClick={() => onQty(item.variantId, item.quantity + 1)} className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-700 hover:border-pink-500">+</button>
            <button onClick={() => onRemove(item.variantId)} className="ml-1 text-gray-400 hover:text-red-500 p-1"><Trash2 size={15} /></button>
          </div>
        </div>
      ))}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between text-gray-700 mb-1">
          <span>Subtotal</span>
          <span className="font-semibold">${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
        <p className="text-xs text-gray-500">Shipping calculated in next step</p>
      </div>

      <button onClick={onNext} className="w-full bg-pink-600 hover:bg-pink-700 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
        Continue <ChevronRight size={18} />
      </button>
    </div>
  )
}

// ── Step 1: Contact + Address ──────────────────────────────────────────────────

function DetailsStep({ form, onChange, onNext, onBack }) {
  const [err, setErr] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!form.name || !form.email || !form.line1 || !form.city || !form.state || !form.zip) {
      setErr('Please fill in all required fields.'); return
    }
    if (!/\S+@\S+\.\S+/.test(form.email)) { setErr('Enter a valid email address.'); return }
    setErr(''); onNext()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{err}</div>}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h3 className="font-semibold text-gray-900">Contact Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input value={form.name} onChange={e => onChange('name', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="Alex Johnson" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => onChange('email', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="alex@example.com" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
            <input type="tel" value={form.phone} onChange={e => onChange('phone', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="+1 (555) 000-0000" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h3 className="font-semibold text-gray-900">Shipping Address</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 *</label>
            <input value={form.line1} onChange={e => onChange('line1', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="123 Main St" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
            <input value={form.line2} onChange={e => onChange('line2', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="Apt, Suite, etc." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input value={form.city} onChange={e => onChange('city', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="New York" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
              <input value={form.state} onChange={e => onChange('state', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="NY" maxLength={2} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
              <input value={form.zip} onChange={e => onChange('zip', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="10001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input value={form.country} onChange={e => onChange('country', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="US" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="flex-1 border border-gray-300 text-gray-700 py-3.5 rounded-xl font-semibold hover:border-pink-500 transition-colors">Back</button>
        <button type="submit" className="flex-grow bg-pink-600 hover:bg-pink-700 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
          Continue <ChevronRight size={18} />
        </button>
      </div>
    </form>
  )
}

// ── Step 2: Shipping Method ────────────────────────────────────────────────────

function ShippingStep({ selected, onSelect, onNext, onBack }) {
  const { data, isLoading } = useQuery({ queryKey: ['shipping-rates'], queryFn: getShippingRates })
  const rates = data?.rates || data?.shipping_rates || []

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="font-semibold text-gray-900">Shipping Method</h3>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          rates.map(r => (
            <label key={r.id} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors
              ${selected?.id === r.id ? 'border-pink-600 bg-pink-50' : 'border-gray-200 hover:border-pink-300'}`}>
              <input type="radio" checked={selected?.id === r.id} onChange={() => onSelect(r)} className="accent-pink-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{r.name}</p>
                {r.estimated_days && <p className="text-xs text-gray-500">{r.estimated_days}</p>}
              </div>
              <span className="font-semibold text-gray-900">
                {parseFloat(r.price) === 0 ? 'Free' : `$${parseFloat(r.price).toFixed(2)}`}
              </span>
            </label>
          ))
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 border border-gray-300 text-gray-700 py-3.5 rounded-xl font-semibold hover:border-pink-500 transition-colors">Back</button>
        <button onClick={onNext} disabled={!selected} className="flex-grow bg-pink-600 hover:bg-pink-700 disabled:bg-gray-300 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
          Continue to Payment <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Payment Form (inside Elements with clientSecret) ───────────────────

function PaymentForm({ orderInfo, onSuccess, onBack }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setError('')

    const { error: submitErr } = await elements.submit()
    if (submitErr) {
      setError(submitErr.message || 'Please complete the payment form.')
      setProcessing(false)
      return
    }

    const { error: confirmErr } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order-confirmation?order_number=${orderInfo.order_number}&total=${orderInfo.total}`,
      },
      redirect: 'if_required',
    })

    if (confirmErr) {
      setError(confirmErr.message || 'Payment failed. Please try again.')
      setProcessing(false)
      return
    }

    // Payment succeeded without redirect (card payments)
    onSuccess(orderInfo)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Order summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900">Order Summary</h3>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Order #{orderInfo.order_number}</span>
        </div>
        <div className="flex justify-between font-bold text-gray-900 text-lg border-t border-gray-100 pt-3">
          <span>Total</span>
          <span>${parseFloat(orderInfo.total).toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Element */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Lock size={14} className="text-gray-400" /> Payment Method
        </p>
        <PaymentElement 
          options={{
            layout: 'tabs',
            business: { name: 'MachX Cycles' },
          }}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={processing}
          className="flex-1 border border-gray-300 text-gray-700 py-3.5 rounded-xl font-semibold hover:border-pink-500 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={processing || !stripe}
          className="flex-grow bg-pink-600 hover:bg-pink-700 disabled:bg-pink-400 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {processing ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Processing...
            </>
          ) : (
            `Pay $${parseFloat(orderInfo.total).toFixed(2)}`
          )}
        </button>
      </div>

      <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1">
        <Lock size={10} /> Payments secured by Stripe
      </p>
    </form>
  )
}

// ── Step 3 Wrapper: Creates order then shows PaymentForm ───────────────────────

function PaymentStep({ items, form, shipping, subtotal, onBack, onSuccess }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orderInfo, setOrderInfo] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)

  const shippingCost = shipping ? parseFloat(shipping.price ?? 0) : 0

  useEffect(() => {
    async function initPayment() {
      try {
        const res = await createOrder({
          customer_name: form.name,
          customer_email: form.email,
          customer_phone: form.phone || null,
          shipping_address: {
            line1: form.line1,
            line2: form.line2 || null,
            city: form.city,
            state: form.state,
            zip: form.zip,
            country: form.country,
          },
          shipping_rate_id: shipping.id,
          items: items.map(i => ({ variant_id: i.variantId, quantity: i.quantity })),
        })

        if (!res.client_secret) {
          throw new Error('Could not initialize payment. Please try again.')
        }

        setOrderInfo({
          order_number: res.order_number,
          total: res.total,
        })
        setClientSecret(res.client_secret)
      } catch (err) {
        setError(err.message || 'Failed to create order. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    initPayment()
  }, [])

  if (loading) {
    return (
      <div className="text-center py-16">
        <Loader2 size={40} className="mx-auto text-pink-600 animate-spin mb-4" />
        <p className="text-gray-600">Setting up your payment...</p>
      </div>
    )
  }

  if (error) {
    // Parse error for better UX
    const isStockError = error.toLowerCase().includes('stock') || error.toLowerCase().includes('insufficient')
    const isVariantError = error.toLowerCase().includes('variant') && error.toLowerCase().includes('not found')
    
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-800 mb-2">
            {isStockError ? '⚠️ Item Out of Stock' : isVariantError ? '⚠️ Item Unavailable' : '❌ Order Failed'}
          </h3>
          <p className="text-red-700 text-sm mb-3">{error}</p>
          {isStockError && (
            <p className="text-red-600 text-xs">
              Another customer may have purchased this item. Please update your cart and try again.
            </p>
          )}
          {isVariantError && (
            <p className="text-red-600 text-xs">
              This item is no longer available. Please remove it from your cart.
            </p>
          )}
        </div>
        <button
          onClick={onBack}
          className="w-full border border-gray-300 text-gray-700 py-3.5 rounded-xl font-semibold hover:border-pink-500 transition-colors"
        >
          ← Go Back to Shipping
        </button>
        <Link
          to="/checkout"
          onClick={() => window.location.reload()}
          className="block w-full text-center bg-pink-600 text-white py-3.5 rounded-xl font-semibold hover:bg-pink-700 transition-colors"
        >
          Return to Cart
        </Link>
      </div>
    )
  }

  if (!clientSecret || !stripePromise) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3">
        Payment system unavailable. Please try again later.
      </div>
    )
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#db2777',
            borderRadius: '8px',
          },
        },
      }}
    >
      <PaymentForm orderInfo={orderInfo} onSuccess={onSuccess} onBack={onBack} />
    </Elements>
  )
}

// ── Main Checkout ──────────────────────────────────────────────────────────────

export default function Checkout() {
  const navigate = useNavigate()
  const items = useCartStore(s => s.items)
  const subtotal = useCartStore(selectSubtotal)
  const removeItem = useCartStore(s => s.removeItem)
  const updateQty = useCartStore(s => s.updateQuantity)
  const clearCart = useCartStore(s => s.clearCart)

  const [step, setStep] = useState(0)
  const [shipping, setShipping] = useState(null)
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    line1: '', line2: '', city: '', state: '', zip: '', country: 'US',
  })

  function onChange(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handlePaymentSuccess(order) {
    clearCart()
    navigate('/order-confirmation', { state: { fromCheckout: true, order } })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">Checkout</h1>
        <StepIndicator step={step} />

        {step === 0 && (
          <CartStep
            items={items}
            onRemove={removeItem}
            onQty={updateQty}
            subtotal={subtotal}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <DetailsStep
            form={form}
            onChange={onChange}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <ShippingStep
            selected={shipping}
            onSelect={setShipping}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <PaymentStep
            items={items}
            form={form}
            shipping={shipping}
            subtotal={subtotal}
            onBack={() => setStep(2)}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    </div>
  )
}

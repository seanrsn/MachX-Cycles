import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Truck } from 'lucide-react'
import { getOrder, updateOrder } from '../../api/admin'
import { Badge, Button, Spinner } from '../../components/common'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fmtDate = d => d ? new Date(d).toLocaleString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit',
}) : '—'

// Pretty event-type labels for the admin audit log. Anything not in the map
// falls back to the snake_cased raw type (still readable, just less polished).
const EVENT_LABEL = {
  created:                  'Order placed',
  payment_received:         'Payment received',
  'payment_intent.succeeded': 'Payment received',  // legacy rows
  status_change:            'Status updated',
  shipped:                  'Shipped',
  delivered:                'Delivered',
  cancelled:                'Cancelled',
  refunded:                 'Refunded',
  admin_release_reservation:'Reservation released',
}

const STATUS_OPTIONS  = ['pending','confirmed','processing','shipped','ready_for_pickup','completed','cancelled']
const CARRIER_OPTIONS = [
  { value: '',            label: 'Select carrier…' },
  { value: 'BIKEFLIGHTS', label: 'BikeFlights' },
  { value: 'UPS',         label: 'UPS' },
  { value: 'FEDEX',       label: 'FedEx' },
  { value: 'USPS',        label: 'USPS' },
  { value: 'OTHER',       label: 'Other' },
]

export default function OrderDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [status, setStatus] = useState('')
  const [notes,  setNotes]  = useState('')
  const [edited, setEdited] = useState(false)

  // Shipping form (separate from generic save so admin understands the
  // "Mark as Shipped" action triggers a customer email)
  const [trackingNumber,    setTrackingNumber]    = useState('')
  const [trackingCarrier,   setTrackingCarrier]   = useState('')
  const [estimatedDelivery, setEstimatedDelivery] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin-order', id],
    queryFn:  () => getOrder(id),
    onSuccess: o => {
      setStatus(o.status)
      setNotes(o.notes || '')
      setTrackingNumber(o.tracking_number || '')
      setTrackingCarrier(o.tracking_carrier || '')
      setEstimatedDelivery(o.estimated_delivery ? o.estimated_delivery.slice(0, 10) : '')
    },
  })

  const saveMut = useMutation({
    mutationFn: () => updateOrder(id, { status, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order', id] })
      qc.invalidateQueries({ queryKey: ['admin-orders'] })
      setEdited(false)
    },
  })

  const shipMut = useMutation({
    mutationFn: () => updateOrder(id, {
      tracking_number:    trackingNumber.trim(),
      tracking_carrier:   trackingCarrier,
      estimated_delivery: estimatedDelivery || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order', id] })
      qc.invalidateQueries({ queryKey: ['admin-orders'] })
    },
  })

  const alreadyShipped = !!order?.tracking_number
  const canShip = trackingNumber.trim().length >= 4 && trackingCarrier

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!order)    return <div className="text-center py-16 text-gray-400">Order not found.</div>

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/orders')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{order.order_number}</h1>
          <p className="text-sm text-gray-500">{fmtDate(order.created_at)}</p>
        </div>
        <Badge status={order.status} label={order.status.replace(/_/g, ' ')} />
        <Badge status={order.payment_status} label={order.payment_status.replace(/_/g, ' ')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Customer</h2>
          <div className="space-y-1 text-sm text-gray-700">
            <div><span className="text-gray-400">Name:</span> {order.customer_name}</div>
            <div><span className="text-gray-400">Email:</span> {order.customer_email}</div>
            <div><span className="text-gray-400">Phone:</span> {order.customer_phone || '—'}</div>
            <div><span className="text-gray-400">Fulfillment:</span> {order.fulfillment_type}</div>
            <div><span className="text-gray-400">Payment type:</span> {order.payment_type}</div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Pricing</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmt(order.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span>{fmt(order.shipping_fee)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{fmt(order.discount_amount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{fmt(order.tax)}</span></div>
            <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span><span>{fmt(order.total)}</span>
            </div>
            {order.payment_type === 'reservation' && (
              <>
                <div className="flex justify-between text-green-700"><span>Paid (deposit)</span><span>{fmt(order.reservation_fee)}</span></div>
                <div className="flex justify-between text-orange-700"><span>Balance due</span><span>{fmt(order.amount_due)}</span></div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Items</h2>
        <div className="space-y-3">
          {order.items?.map(item => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium text-gray-900">{item.bike_name}</div>
                <div className="text-gray-400">
                  {[item.frame_size, item.material].filter(Boolean).join(' · ')}
                  {item.bike_id && <> · Bike #{item.bike_id}</>}
                </div>
              </div>
              <div className="font-semibold">{fmt(item.unit_price * item.quantity)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Shipping — paste tracking number to mark shipped + email customer */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Truck size={18} className="text-pink-600" /> Shipping
          </h2>
          {alreadyShipped && (
            <Badge status="shipped" label={`Shipped ${fmtDate(order.shipped_at)}`} />
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
            <select
              value={trackingCarrier}
              onChange={e => setTrackingCarrier(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {CARRIER_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tracking number</label>
            <input
              type="text"
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="Paste tracking number from carrier"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Estimated delivery <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="date"
              value={estimatedDelivery}
              onChange={e => setEstimatedDelivery(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        {!alreadyShipped && (
          <p className="text-xs text-gray-500">
            Saving will mark the order as shipped, set the timestamp, and email the customer with the tracking link.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => shipMut.mutate()}
            loading={shipMut.isPending}
            disabled={!canShip || shipMut.isPending}
          >
            <Truck size={15} /> {alreadyShipped ? 'Update Tracking' : 'Mark as Shipped'}
          </Button>
          {shipMut.isSuccess && <span className="text-sm text-green-600">Saved.</span>}
          {shipMut.isError  && <span className="text-sm text-red-600">{shipMut.error?.message || 'Save failed'}</span>}
        </div>
      </div>

      {/* Update status + notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Update Order</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setEdited(true) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); setEdited(true) }}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Internal notes…"
            />
          </div>
        </div>
        {edited && (
          <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
            <Save size={15} /> Save Changes
          </Button>
        )}
      </div>

      {/* Audit log */}
      {order.events?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Audit Log</h2>
          <div className="space-y-2.5">
            {order.events.map(ev => {
              const label = EVENT_LABEL[ev.event_type] || ev.event_type?.replace(/[._]/g, ' ')
              // Hide the message when it's just a restatement of the label
              const showMsg = ev.message && ev.message.trim().toLowerCase() !== label.toLowerCase()
              return (
                <div key={ev.id} className="text-sm flex items-baseline gap-3">
                  <span className="text-gray-400 text-xs whitespace-nowrap tabular-nums w-32 shrink-0">{fmtDate(ev.created_at)}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-gray-700">{label}</span>
                    {showMsg && <span className="text-gray-500"> — {ev.message}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

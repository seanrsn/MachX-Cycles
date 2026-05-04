import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { getOrder, updateOrder } from '../../api/admin'
import { Badge, Button, Spinner } from '../../components/common'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fmtDate = d => d ? new Date(d).toLocaleString('en-US') : '—'

const STATUS_OPTIONS = ['pending','confirmed','processing','shipped','ready_for_pickup','completed','cancelled']

export default function OrderDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [status, setStatus] = useState('')
  const [notes,  setNotes]  = useState('')
  const [edited, setEdited] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin-order', id],
    queryFn:  () => getOrder(id),
    onSuccess: o => { setStatus(o.status); setNotes(o.notes || '') },
  })

  const saveMut = useMutation({
    mutationFn: () => updateOrder(id, { status, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order', id] })
      qc.invalidateQueries({ queryKey: ['admin-orders'] })
      setEdited(false)
    },
  })

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
                <div className="text-gray-400">{item.frame_size} / {item.color} · SKU: {item.sku} · Qty: {item.quantity}</div>
              </div>
              <div className="font-semibold">{fmt(item.unit_price * item.quantity)}</div>
            </div>
          ))}
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
          <div className="space-y-3">
            {order.events.map(ev => (
              <div key={ev.id} className="text-sm flex gap-3">
                <span className="text-gray-400 whitespace-nowrap">{fmtDate(ev.created_at)}</span>
                <div>
                  <span className="font-medium text-gray-700">{ev.event_type}</span>
                  {ev.message && <span className="text-gray-500"> — {ev.message}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

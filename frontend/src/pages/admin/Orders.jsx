import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { getOrders } from '../../api/admin'
import { PageHeader, Badge, Spinner } from '../../components/common'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const STATUS_OPTIONS = ['', 'pending', 'confirmed', 'processing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled']

export default function Orders() {
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [page, setPage]       = useState(1)
  const navigate              = useNavigate()

  const params = { page, limit: 20, ...(search && { search }), ...(status && { status }) }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', params],
    queryFn:  () => getOrders(params),
  })

  const orders = data?.orders || []
  const total  = data?.total  || 0
  const pages  = data?.pages  || 1

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" subtitle={`${total} total`} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search email or order #"
            className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 w-56"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No orders found.</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Payment</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(o => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/admin/orders/${o.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{o.order_number}</div>
                      <div className="text-xs text-gray-400">{o.item_count} item{o.item_count !== 1 ? 's' : ''} · {o.fulfillment_type}</div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="text-gray-900">{o.customer_name}</div>
                      <div className="text-xs text-gray-400">{o.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{fmtDate(o.created_at)}</td>
                    <td className="px-4 py-3"><Badge status={o.status} label={o.status.replace(/_/g, ' ')} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><Badge status={o.payment_status} label={o.payment_status.replace(/_/g, ' ')} /></td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Page {page} of {pages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >← Prev</button>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

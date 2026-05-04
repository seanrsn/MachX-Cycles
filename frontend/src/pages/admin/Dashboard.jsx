import { useQuery } from '@tanstack/react-query'
import { ShoppingBag, DollarSign, TrendingUp } from 'lucide-react'
import { getDashboard } from '../../api/admin'
import { StatCard, Badge, Spinner } from '../../components/common'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  getDashboard,
    refetchInterval: 60_000,
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
      Failed to load dashboard: {error.message}
    </div>
  )

  const d = data || {}
  const statuses = d.orders_by_status || {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back. Here's what's happening today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Today's Orders"
          value={d.today_orders ?? 0}
          icon={ShoppingBag}
          color="blue"
        />
        <StatCard
          label="Today's Revenue"
          value={fmt(d.today_revenue)}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          label="Month Orders"
          value={d.month_orders ?? 0}
          icon={TrendingUp}
          color="pink"
        />
        <StatCard
          label="Month Revenue"
          value={fmt(d.month_revenue)}
          icon={DollarSign}
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Orders by Status</h2>
          {Object.keys(statuses).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No orders yet</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(statuses).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between py-1">
                  <Badge status={status} label={status.replace(/_/g, ' ')} />
                  <span className="text-sm font-semibold text-gray-700">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Orders</h2>
          {!d.recent_orders?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {d.recent_orders.map(o => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-gray-900">{o.order_number}</div>
                    <div className="text-xs text-gray-400">{o.customer_name} · {fmtDate(o.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{fmt(o.total)}</div>
                    <Badge status={o.status} label={o.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

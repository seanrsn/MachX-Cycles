export default function StatCard({ label, value, sub, icon: Icon, color = 'pink' }) {
  const colors = {
    pink:   'bg-pink-50 text-pink-600',
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  }
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 font-medium">{label}</span>
        {Icon && (
          <div className={`p-2 rounded-lg ${colors[color]}`}>
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

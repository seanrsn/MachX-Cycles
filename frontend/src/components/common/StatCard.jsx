export default function StatCard({ label, value, sub, icon: Icon, color = 'pink' }) {
  // All cards in the brand family — pink primary, orange accent
  const tiles = {
    pink:     'bg-pink-50 text-pink-600',
    blue:     'bg-pink-50 text-pink-600',
    green:    'bg-pink-50 text-pink-600',
    yellow:   'bg-orange-50 text-orange-600',
    gradient: 'mx-gradient-bg text-white shadow-md shadow-pink-200',
    accent:   'bg-orange-50 text-orange-600',
  }
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm ring-1 ring-gray-200/70 hover:shadow-md hover:ring-pink-200 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 font-medium">{label}</span>
        {Icon && (
          <div className={`p-2 rounded-lg ${tiles[color]}`}>
            <Icon size={18} strokeWidth={2.25} />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

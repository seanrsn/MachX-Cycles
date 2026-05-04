const VARIANTS = {
  green:  'bg-green-100 text-green-800',
  red:    'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue:   'bg-blue-100 text-blue-800',
  gray:   'bg-gray-100 text-gray-700',
  pink:   'bg-pink-100 text-pink-700',
  purple: 'bg-purple-100 text-purple-700',
}

const STATUS_MAP = {
  pending:          'yellow',
  confirmed:        'blue',
  processing:       'blue',
  shipped:          'purple',
  ready_for_pickup: 'purple',
  completed:        'green',
  cancelled:        'red',
  paid:             'green',
  unpaid:           'yellow',
  refund_pending:   'yellow',
  refunded:         'gray',
  refund_failed:    'red',
  active:           'green',
  inactive:         'gray',
}

export default function Badge({ label, variant, status }) {
  const v = variant || STATUS_MAP[status] || 'gray'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${VARIANTS[v]}`}>
      {label || status}
    </span>
  )
}

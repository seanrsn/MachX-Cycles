import Spinner from './Spinner'

const VARIANTS = {
  primary:   'bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white shadow-md shadow-pink-500/20 hover:shadow-pink-500/30',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm',
  danger:    'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-md shadow-red-500/20',
  ghost:     'hover:bg-gray-100 text-gray-500 hover:text-gray-700',
}

export default function Button({
  children, variant = 'primary', loading = false,
  className = '', size = 'md', ...props
}) {
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
  return (
    <button
      disabled={loading || props.disabled}
      className={`
        inline-flex items-center gap-2 font-semibold rounded-xl transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${VARIANTS[variant]} ${sizeClass} ${className}
      `}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}

import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Bike, ShoppingBag, Tag, Settings, X, Zap
} from 'lucide-react'

const nav = [
  { to: '/admin/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/admin/bikes',      label: 'Bikes',        icon: Bike },
  { to: '/admin/orders',     label: 'Orders',       icon: ShoppingBag },
  { to: '/admin/promotions', label: 'Promotions',   icon: Tag },
  { to: '/admin/settings',   label: 'Settings',     icon: Settings },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-64 z-30 flex flex-col
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `} style={{ background: '#0a0a0f' }}>

        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <div className="text-[15px] font-bold leading-tight">
                <span className="text-white">MachX</span>
                <span className="text-pink-400"> Cycles</span>
              </div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest">Admin</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/30 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-gradient-to-r from-pink-600/25 to-pink-600/5 text-pink-400 border border-pink-500/20'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} className={isActive ? 'text-pink-400' : ''} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom gradient line */}
        <div className="h-px mx-4 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="px-4 py-4">
          <div className="rounded-xl bg-gradient-to-r from-pink-600/10 to-rose-600/5 border border-pink-500/15 px-4 py-3">
            <p className="text-[11px] text-white/30 leading-relaxed">Premium pre-owned bikes, shipped nationwide.</p>
          </div>
        </div>
      </aside>
    </>
  )
}

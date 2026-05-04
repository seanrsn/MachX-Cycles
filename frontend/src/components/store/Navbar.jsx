import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShoppingCart, Menu, X } from 'lucide-react'
import { useCartStore } from '../../store/cartStore'

const NAV_LINKS = [
  { label: 'Shopping', href: '/shop' },
  { label: 'About', href: '/about' },
  { label: 'Support', href: '/support' },
  { label: 'Contact', href: '/contact' },
]

export default function Navbar() {
  const location = useLocation()
  const itemCount = useCartStore(s => s.items.reduce((sum, i) => sum + i.quantity, 0))
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
    <header className="bg-gray-950 border-b border-gray-800 pt-[env(safe-area-inset-top)]">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          {/* Logo */}
          <Link to="/" className="shrink-0">
            <img 
              src="/logo.png" 
              alt="MachX Cycles" 
              className="h-14 sm:h-16 w-auto"
            />
          </Link>

          {/* Right side - nav + cart together */}
          <div className="flex items-center gap-8">
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map(link => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`text-base font-medium transition-colors hover:text-pink-500 ${
                    location.pathname === link.href ? 'text-pink-500' : 'text-gray-300'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            
            {/* Cart */}
            <Link to="/checkout" className="relative p-2 text-gray-300 hover:text-pink-500 transition-colors">
              <ShoppingCart size={22} />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-pink-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 text-gray-300 hover:text-pink-500 transition-colors"
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-800 py-4 space-y-1 bg-gray-950">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                  location.pathname === link.href
                    ? 'bg-pink-950 text-pink-500'
                    : 'text-gray-300 hover:bg-gray-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/track-order"
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-3 rounded-lg text-base font-medium text-gray-300 hover:bg-gray-900"
            >
              Track Order
            </Link>
          </div>
        )}
      </nav>
    </header>
    </>
  )
}

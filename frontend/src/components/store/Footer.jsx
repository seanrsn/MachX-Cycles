import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <img 
              src="/logo.png" 
              alt="MachX Cycles" 
              className="h-10 w-auto mb-3"
            />
            <p className="text-gray-400 text-sm leading-relaxed">
              Premium pre-owned bikes at unbeatable prices.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wide text-gray-400 mb-4">Shop</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/shop" className="text-gray-300 hover:text-white transition-colors">All Bikes</Link></li>
              <li><Link to="/shop?category=1" className="text-gray-300 hover:text-white transition-colors">Road</Link></li>
              <li><Link to="/shop?category=2" className="text-gray-300 hover:text-white transition-colors">Mountain</Link></li>
              <li><Link to="/shop?category=6" className="text-gray-300 hover:text-white transition-colors">E-Bikes</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wide text-gray-400 mb-4">Support</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/support" className="text-gray-300 hover:text-white transition-colors">Return Policy</Link></li>
              <li><Link to="/support" className="text-gray-300 hover:text-white transition-colors">FAQ</Link></li>
              <li><Link to="/support" className="text-gray-300 hover:text-white transition-colors">Shipping</Link></li>
              <li><Link to="/track-order" className="text-gray-300 hover:text-white transition-colors">Track Order</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wide text-gray-400 mb-4">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/about" className="text-gray-300 hover:text-white transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="text-gray-300 hover:text-white transition-colors">Contact</Link></li>
              <li><a href="tel:+17182184464" className="text-gray-300 hover:text-white transition-colors">(718) 218-4464</a></li>
              <li><a href="mailto:info@machxcycles.com" className="text-gray-300 hover:text-white transition-colors">info@machxcycles.com</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} MachX Cycles. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <span>3149 Emmons Ave, Brooklyn, NY</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

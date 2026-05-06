import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { ArrowRight, Bike, CheckCircle, Truck, Search, Shield, Headphones, Trophy, RotateCcw } from 'lucide-react'
import { getBikes, getCategories } from '../../api/public'
import Navbar from '../../components/store/Navbar'
import Footer from '../../components/store/Footer'

function BikeCard({ bike }) {
  const img = bike.images?.[0]?.url || null
  const price = bike.min_variant_price ?? bike.base_price
  const msrp = bike.msrp
  const discount = msrp && parseFloat(msrp) > parseFloat(price)
    ? Math.round((1 - parseFloat(price) / parseFloat(msrp)) * 100)
    : null
  return (
    <Link to={`/bikes/${bike.id}`} className="group bg-white rounded-2xl overflow-hidden ring-1 ring-gray-200/80 hover:ring-pink-200 hover:shadow-xl hover:shadow-pink-100/40 transition-all duration-300 hover:-translate-y-1">
      <div className="aspect-[4/3] bg-gray-100 overflow-hidden relative">
        {img
          ? <img src={img} alt={bike.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><Bike size={48} className="text-gray-300" /></div>
        }
        {discount && (
          <span className="absolute top-3 left-3 mx-gradient-bg text-white text-[11px] font-bold px-2.5 py-1 rounded-full tracking-wider shadow-md shadow-pink-900/20">
            {discount}% OFF
          </span>
        )}
      </div>
      <div className="p-4">
        <span className="text-xs font-medium text-pink-600 uppercase tracking-wide">{bike.category_name}</span>
        <h3 className="font-semibold text-gray-900 mt-0.5 truncate">{bike.name}</h3>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">${parseFloat(price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            {msrp && parseFloat(msrp) > parseFloat(price) && (
              <span className="text-sm text-gray-400 line-through">${parseFloat(msrp).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            )}
          </div>
          <span className="text-pink-600 group-hover:translate-x-1 transition-transform">
            <ArrowRight size={16} />
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function Home() {
  const { data: featuredData } = useQuery({ queryKey: ['public-featured'], queryFn: () => getBikes({ featured: 1, limit: 8 }) })
  const { data: categoriesData } = useQuery({ queryKey: ['public-categories'], queryFn: getCategories })

  const bikes      = featuredData?.bikes || []
  const categories = categoriesData?.categories || []

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>MachX Cycles | Premium Pre-Owned Performance Bikes</title>
        <meta name="description" content="Shop premium pre-owned road, mountain, and e-bikes at unbeatable prices. Every bike inspected, certified, and ships ride-ready. Premium performance without the premium price tag." />
        <link rel="canonical" href="https://machxcycles.com/" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "MachX Cycles",
            "url": "https://machxcycles.com",
            "logo": "https://machxcycles.com/logo.png",
            "description": "Premium pre-owned performance bikes at unbeatable prices",
            "sameAs": []
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "MachX Cycles",
            "url": "https://machxcycles.com"
          })}
        </script>
      </Helmet>
      <Navbar />

      {/* Hero */}
      <div className="relative bg-gray-950 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-25"
          style={{ backgroundImage: 'radial-gradient(ellipse at 75% 50%, #ec4899 0%, transparent 55%), radial-gradient(ellipse at 95% 90%, #f97316 0%, transparent 60%)' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="max-w-2xl">
            <p className="text-pink-400 font-semibold text-sm uppercase tracking-widest mb-4">Premium Pre-Owned</p>
            <h1 className="text-5xl sm:text-6xl font-black leading-tight mb-6">
              Ride Beyond<br />
              <span className="mx-gradient-text">Your Limits</span>
            </h1>
            <p className="text-gray-400 text-lg mb-8 leading-relaxed">
              Premium performance without the premium price tag. Top-tier bikes from Trek, Specialized, and Cannondale — inspected, tuned, and ships ride-ready.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/shop" className="mx-gradient-btn inline-flex items-center gap-2 text-white px-8 py-3.5 rounded-xl font-semibold shadow-lg shadow-pink-900/40 hover:shadow-pink-900/60 hover:-translate-y-0.5">
                Shop Now <ArrowRight size={18} />
              </Link>
              <Link to="/track-order" className="inline-flex items-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-8 py-3.5 rounded-xl font-semibold transition-colors">
                Track Order
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Value props */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: Search, title: 'Inspected & Certified', sub: 'Multi-point quality check' },
              { icon: Shield, title: 'Secure Checkout', sub: 'Encrypted & protected' },
              { icon: Headphones, title: 'Expert Support', sub: 'Real people, fast replies' },
            ].map(({ icon: Icon, title, sub }) => (
              <div key={title} className="flex items-center gap-3">
                <div className="p-2 bg-pink-50 rounded-lg"><Icon size={20} className="text-pink-600" /></div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{title}</p>
                  <p className="text-gray-500 text-xs">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Shop by Category</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <Link to="/shop" className="shrink-0 px-5 py-2.5 rounded-full border-2 border-pink-600 text-pink-600 font-semibold text-sm hover:bg-pink-600 hover:text-white transition-colors">All</Link>
            {categories.map(c => (
              <Link key={c.id} to={`/shop?category=${c.id}`} className="shrink-0 px-5 py-2.5 rounded-full border border-gray-300 text-gray-700 font-medium text-sm hover:border-pink-600 hover:text-pink-600 transition-colors">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Featured bikes */}
      {bikes.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Just Arrived</h2>
            <Link to="/shop" className="text-pink-600 font-medium text-sm hover:text-pink-700 flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {bikes.map(b => <BikeCard key={b.id} bike={b} />)}
          </div>
        </div>
      )}

      {/* Dark zone — Difference + CTA flow as one continuous section into the footer */}
      <div className="relative overflow-hidden text-white" style={{ background: '#0a0a0f' }}>
        {/* Ambient backdrop glow — reads through both Difference and CTA */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-[800px] h-[500px]"
            style={{ background: 'radial-gradient(ellipse, rgba(236,72,153,0.18) 0%, transparent 70%)' }} />
          <div className="absolute top-1/2 right-0 w-[700px] h-[500px]"
            style={{ background: 'radial-gradient(ellipse, rgba(249,115,22,0.12) 0%, transparent 70%)' }} />
        </div>

        {/* The MachX Difference */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <h2 className="text-3xl sm:text-4xl font-black text-white text-center mb-4">
            The MachX <span className="mx-gradient-text">Difference</span>
          </h2>
          <p className="text-gray-400 text-center max-w-2xl mx-auto mb-12">
            Every bike is hand-selected, professionally inspected, and tuned before it ships.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: Trophy,    stat: 'Save Big', label: 'Premium Brands',      sub: 'Trek, Specialized, Cannondale & more' },
              { icon: Truck,     stat: 'Free',     label: 'Nationwide Shipping', sub: 'Every order ships on us' },
              { icon: RotateCcw, stat: '30 Days',  label: 'Easy Returns',        sub: 'Shop with confidence', link: true },
            ].map(({ icon: Icon, stat, label, sub, link }) => (
              <div key={label} className="bg-white/[0.04] border border-white/10 rounded-2xl p-7 hover:bg-white/[0.06] hover:border-pink-500/30 transition-all duration-300">
                <Icon size={22} className="text-pink-400 mb-5" strokeWidth={1.75} />
                <div className="text-4xl font-black mx-gradient-text mb-1 leading-none pb-1">{stat}</div>
                <p className="font-semibold text-white text-base">{label}</p>
                <p className="text-gray-400 text-sm mt-1">{sub}</p>
                {link && (
                  <Link to="/support" className="text-pink-400 hover:text-pink-300 text-xs font-medium mt-2 inline-block transition-colors">
                    See return policy →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA — contained gradient card, lives inside the same dark zone */}
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="relative mx-gradient-bg rounded-2xl p-10 sm:p-14 text-center overflow-hidden shadow-2xl shadow-pink-900/40">
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="absolute top-0 right-0 w-72 h-72 opacity-25 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)', transform: 'translate(35%, -35%)' }} />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-black mb-4 tracking-tight">Ready to save?</h2>
              <p className="text-pink-100/90 mb-8 text-base sm:text-lg">Browse our selection of certified pre-owned bikes.</p>
              <Link to="/shop" className="inline-flex items-center gap-2 bg-white text-pink-600 hover:bg-pink-50 px-8 py-3.5 rounded-xl font-semibold transition-colors shadow-xl">
                Shop All Bikes <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

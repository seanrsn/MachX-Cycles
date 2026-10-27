import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { ArrowRight, Bike, CheckCircle, Truck, Search, Shield, Headphones, Trophy, RotateCcw, Star, Wrench, Calendar, Plus } from 'lucide-react'
import { getBikes, getCategories } from '../../api/public'
import Navbar from '../../components/store/Navbar'
import Footer from '../../components/store/Footer'
import { bikePath } from '../../utils/bikePath'
import { safeJsonLd } from '../../utils/safeJsonLd'
import { categoryPath } from '../../utils/categorySlug'

function BikeCard({ bike }) {
  const img = bike.images?.[0]?.url || null
  const price = bike.base_price
  const msrp = bike.msrp
  const discount = msrp && parseFloat(msrp) > parseFloat(price)
    ? Math.round((1 - parseFloat(price) / parseFloat(msrp)) * 100)
    : null
  return (
    <Link to={bikePath(bike)} className="group bg-white rounded-2xl overflow-hidden ring-1 ring-gray-200/80 hover:ring-pink-200 hover:shadow-xl hover:shadow-pink-100/40 transition-all duration-300 hover:-translate-y-1">
      {/* 4:5 portrait container + object-contain: matches typical phone-photo
          aspect, never crops the bike. See BikeCard in Shop.jsx for rationale. */}
      <div className="aspect-[4/5] bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden relative">
        {img
          ? <img
              src={img}
              alt={`${bike.name} — pre-owned`}
              loading="lazy"
              decoding="async"
              width="640"
              height="800"
              className="w-full h-full object-contain group-hover:scale-[1.04] transition-transform duration-300"
            />
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

const PAGE_SIZE  = 8    // bikes revealed per "Show more"
const PICKS_MAX  = 4    // Staff Picks row cap
const FETCH_MAX  = 48   // API hard cap per request; home page derives per-type counts from this one fetch

function CountBadge({ value, tone = 'dark' }) {
  const tones = {
    dark:    'bg-gray-900 text-white',
    light:   'bg-gray-100 text-gray-600',
    muted:   'bg-gray-100 text-gray-400',
    onBrand: 'bg-white/20 text-white',
  }
  return (
    <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-semibold tabular-nums ${tones[tone]}`}>
      {value}
    </span>
  )
}

/* One pill in the type row. A real filter (button), not a link.
   Empty types render as a dashed, non-interactive pill so there are no dead ends. */
function TypePill({ label, count, active, disabled, onClick }) {
  const base = 'shrink-0 inline-flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-full text-sm font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2'
  if (disabled) {
    return (
      <span className={`${base} border-dashed border-gray-300 text-gray-400 bg-transparent cursor-default select-none`}
            title={`No ${label.toLowerCase()} bikes in stock right now`}>
        {label}
        <CountBadge value={0} tone="muted" />
      </span>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${base} ${active
        ? 'mx-gradient-bg border-transparent text-white shadow-md shadow-pink-900/20'
        : 'bg-white border-gray-300 text-gray-700 hover:border-pink-600 hover:text-pink-600'}`}
    >
      {label}
      <CountBadge value={count} tone={active ? 'onBrand' : 'light'} />
    </button>
  )
}

function SkeletonGrid({ n = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl ring-1 ring-gray-200/80 overflow-hidden animate-pulse">
          <div className="aspect-[4/5] bg-gray-100" />
          <div className="p-4 space-y-2">
            <div className="h-3 w-12 bg-gray-100 rounded" />
            <div className="h-4 w-3/4 bg-gray-100 rounded" />
            <div className="h-4 w-1/3 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Home() {
  // One fetch feeds both sections: Staff Picks (featured flag) and the All Bikes
  // grid with its per-type counts. Keyed under 'public-bikes' so admin saves
  // (which invalidate that prefix) refresh the home page too.
  const { data: bikesData, isLoading: bikesLoading } = useQuery({
    queryKey: ['public-bikes', 'home'],
    queryFn:  () => getBikes({ limit: FETCH_MAX, sort: 'newest' }),
  })
  const { data: categoriesData } = useQuery({ queryKey: ['public-categories'], queryFn: getCategories })

  const bikes      = bikesData?.bikes || []
  const total      = bikesData?.total ?? bikes.length   // accurate even past FETCH_MAX
  const categories = categoriesData?.categories || []

  const picks = useMemo(() => bikes.filter(b => b.featured).slice(0, PICKS_MAX), [bikes])
  const countsByType = useMemo(() => {
    const m = {}
    for (const b of bikes) m[b.category_id] = (m[b.category_id] || 0) + 1
    return m
  }, [bikes])

  // Stocked types lead the row (alphabetical), empty ones trail, so a phone
  // never opens on a row of dashed zeros.
  const orderedCategories = useMemo(() => [...categories].sort((a, b) => {
    const sa = countsByType[a.id] ? 0 : 1, sb = countsByType[b.id] ? 0 : 1
    return sa - sb || a.name.localeCompare(b.name)
  }), [categories, countsByType])

  const [activeType, setActiveType]     = useState(null)      // null = all types
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const selectType = (id) => { setActiveType(id); setVisibleCount(PAGE_SIZE) }

  const filtered      = activeType == null ? bikes : bikes.filter(b => b.category_id === activeType)
  const filteredTotal = activeType == null ? total : filtered.length
  const visible       = filtered.slice(0, visibleCount)
  const remaining     = filtered.length - visible.length           // what another click can reveal
  const beyondFetch   = filteredTotal - filtered.length            // only >0 past FETCH_MAX
  const activeCat     = activeType == null ? null : categories.find(c => c.id === activeType)
  const activeLabel   = activeCat ? activeCat.name.toLowerCase() : null
  const picksCols     = picks.length >= 4 ? 'lg:grid-cols-4' : picks.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2 max-w-3xl'

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Pre-Owned Performance Bikes in Brooklyn, NY | MachX Cycles</title>
        <meta name="description" content="Certified pre-owned road, mountain, and e-bikes — Trek, Specialized, Cannondale, and more. Every bike inspected and tuned in our Brooklyn shop. Nationwide shipping." />
        <link rel="canonical" href="https://machxcycles.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Pre-Owned Performance Bikes in Brooklyn, NY | MachX Cycles" />
        <meta property="og:description" content="Certified pre-owned road, mountain, and e-bikes. Inspected, tuned, and ready to ride. Ships nationwide from Brooklyn." />
        <meta property="og:url" content="https://machxcycles.com/" />
        <meta property="og:image" content="https://machxcycles.com/MachXPic.jpg" />
        <meta name="twitter:title" content="Pre-Owned Performance Bikes in Brooklyn, NY | MachX Cycles" />
        <meta name="twitter:description" content="Certified pre-owned road, mountain, and e-bikes. Ships nationwide from Brooklyn." />
        <meta name="twitter:image" content="https://machxcycles.com/MachXPic.jpg" />
        <script type="application/ld+json">
          {safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BicycleStore",
            "name": "MachX Cycles",
            "url": "https://machxcycles.com/",
            "logo": "https://machxcycles.com/logo.png",
            "image": "https://machxcycles.com/MachXPic.jpg",
            "description": "Certified pre-owned performance bicycles. Inspected, tuned, and ride-ready. Ships nationwide from Brooklyn, NY.",
            "telephone": "+1-718-218-4464",
            "email": "hello@machxcycles.com",
            "priceRange": "$$-$$$",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "3149 Emmons Ave",
              "addressLocality": "Brooklyn",
              "addressRegion": "NY",
              "postalCode": "11235",
              "addressCountry": "US"
            },
            "openingHoursSpecification": [
              { "@type": "OpeningHoursSpecification", "dayOfWeek": "Wednesday", "opens": "18:30", "closes": "20:30" },
              { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Thursday","Friday"], "opens": "10:00", "closes": "18:00" },
              { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Saturday","Sunday"], "opens": "10:00", "closes": "16:00" }
            ],
            "parentOrganization": {
              "@type": "BicycleStore",
              "name": "Brooklyn Bikery",
              "url": "https://brooklynbikery.com",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "3149 Emmons Ave",
                "addressLocality": "Brooklyn",
                "addressRegion": "NY",
                "postalCode": "11235",
                "addressCountry": "US"
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.9",
                "reviewCount": "200"
              }
            },
            "sameAs": []
          })}
        </script>
        <script type="application/ld+json">
          {safeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "MachX Cycles",
            "url": "https://machxcycles.com/",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://machxcycles.com/shop?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
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

            {/* Trust strip — Brooklyn Bikery partnership */}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <Wrench size={14} className="text-gray-400" strokeWidth={1.75} />
                Powered by{' '}
                <a
                  href="https://brooklynbikery.com"
                  target="_blank"
                  rel="noopener"
                  className="font-semibold text-gray-300 hover:text-white transition-colors"
                >
                  Brooklyn Bikery
                </a>
              </span>
              <span className="flex items-center gap-1.5">
                <Star size={14} className="text-yellow-500 fill-yellow-500" />
                <span><span className="text-gray-300 font-semibold">4.9</span> from 200+ Google reviews</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={14} className="text-gray-400" strokeWidth={1.75} />
                Brooklyn shop since <span className="text-gray-300 font-semibold">2020</span>
              </span>
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

      {/* Staff Picks: bikes flagged Featured in admin */}
      {picks.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-2" aria-labelledby="staff-picks">
          <div className="mb-6">
            <h2 id="staff-picks" className="text-2xl font-bold text-gray-900">Staff Picks</h2>
            <p className="text-gray-500 text-sm mt-1">Hand-selected by our mechanics.</p>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${picksCols} gap-6`}>
            {picks.map(b => <BikeCard key={b.id} bike={b} />)}
          </div>
        </section>
      )}

      {/* All bikes: every in-stock bike, filterable by type, revealed in batches */}
      {(bikesLoading || bikes.length > 0) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12" aria-labelledby="all-bikes">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h2 id="all-bikes" className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
                All bikes
                {!bikesLoading && <CountBadge value={total} tone="dark" />}
              </h2>
              <p className="text-gray-500 text-sm mt-1">Everything in stock right now, newest first. Pick a type to narrow it down.</p>
            </div>
            <Link to="/shop" className="hidden sm:inline-flex items-center gap-1 shrink-0 text-pink-600 font-medium text-sm hover:text-pink-700">
              Open full shop <ArrowRight size={14} />
            </Link>
          </div>

          {/* Type row: a real filter for the grid below */}
          {!bikesLoading && categories.length > 0 && (
            <div role="group" aria-label="Filter by bike type"
                 className="flex gap-2.5 overflow-x-auto pb-3 mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
              <TypePill label="All" count={total} active={activeType == null} onClick={() => selectType(null)} />
              {orderedCategories.map(c => (
                <TypePill
                  key={c.id}
                  label={c.name}
                  count={countsByType[c.id] || 0}
                  active={activeType === c.id}
                  disabled={!countsByType[c.id]}
                  onClick={() => selectType(c.id)}
                />
              ))}
            </div>
          )}

          {bikesLoading ? (
            <SkeletonGrid n={4} />
          ) : visible.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {visible.map(b => <BikeCard key={b.id} bike={b} />)}
            </div>
          ) : (
            <div className="rounded-2xl ring-1 ring-gray-200/80 bg-white px-6 py-12 text-center">
              <p className="font-semibold text-gray-900">No {activeLabel} bikes in stock right now.</p>
              <button type="button" onClick={() => selectType(null)} className="mt-2 text-pink-600 font-medium text-sm hover:text-pink-700">
                Show all {total} bikes
              </button>
            </div>
          )}

          {/* Reveal control / end of list */}
          {!bikesLoading && visible.length > 0 && (
            <div className="mt-8 flex flex-col items-center gap-3">
              {remaining > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(n => n + PAGE_SIZE)}
                    className="w-full sm:w-auto sm:min-w-[22rem] inline-flex items-center justify-center gap-2 bg-white ring-1 ring-gray-300 hover:ring-pink-600 hover:text-pink-600 text-gray-900 px-8 py-3.5 rounded-xl font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
                  >
                    <Plus size={18} /> Show {Math.min(PAGE_SIZE, remaining)} more
                  </button>
                  <p className="text-xs text-gray-500 tabular-nums" aria-live="polite">
                    Showing {visible.length} of {filteredTotal}{activeLabel ? ` ${activeLabel}` : ''} bikes
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-600 text-center" aria-live="polite">
                  {beyondFetch > 0
                    ? <>Showing {visible.length} of {filteredTotal}. </>
                    : <>That&apos;s all {filteredTotal}{activeLabel ? ` ${activeLabel}` : ''} bikes in stock. </>}
                  <Link to={activeCat ? categoryPath(activeCat) : '/shop'}
                        className="text-pink-600 font-medium hover:text-pink-700 inline-flex items-center gap-1">
                    {beyondFetch > 0 ? 'See the rest in the shop' : 'Need a size or price filter? Open the shop'} <ArrowRight size={14} />
                  </Link>
                </p>
              )}
            </div>
          )}
        </section>
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

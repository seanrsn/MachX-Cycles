import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { safeJsonLd } from '../../utils/safeJsonLd'
import { Search, DollarSign, Users, CheckCircle, ArrowRight } from 'lucide-react'
import Navbar from '../../components/store/Navbar'
import Footer from '../../components/store/Footer'

const VALUES = [
  {
    icon: DollarSign,
    title: 'Unbeatable Value',
    desc: 'Premium bikes at 40-60% off retail. We source the best pre-owned inventory so you can ride more for less.',
  },
  {
    icon: Search,
    title: 'Thoroughly Inspected',
    desc: 'Every bike goes through our multi-point inspection. We check everything so you can buy with confidence.',
  },
  {
    icon: Users,
    title: 'Rider-Focused',
    desc: "We're cyclists too. We know what matters and we only list bikes we'd be proud to ride ourselves.",
  },
  {
    icon: CheckCircle,
    title: 'Certified Quality',
    desc: 'Tuned, cleaned, and ships ride-ready. Just attach the pedals and stem — 10 minutes and you\'re rolling.',
  },
]

export default function About() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>About MachX Cycles — Brooklyn Pre-Owned Bike Shop</title>
        <meta name="description" content="MachX Cycles is Brooklyn's premium pre-owned bike shop. Every bike we sell is hand-inspected, tuned, and ready to ride. Learn about our process and commitment." />
        <link rel="canonical" href="https://machxcycles.com/about" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="About MachX Cycles — Brooklyn Pre-Owned Bike Shop" />
        <meta property="og:description" content="Brooklyn's premium pre-owned bike shop. Every bike inspected, tuned, and ride-ready." />
        <meta property="og:url" content="https://machxcycles.com/about" />
        <meta property="og:image" content="https://machxcycles.com/MachXPic.jpg" />
        <meta name="twitter:title" content="About MachX Cycles — Brooklyn Pre-Owned Bike Shop" />
        <meta name="twitter:description" content="Brooklyn's premium pre-owned bike shop." />
        <meta name="twitter:image" content="https://machxcycles.com/MachXPic.jpg" />
        <script type="application/ld+json">
          {safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home",  "item": "https://machxcycles.com/" },
              { "@type": "ListItem", "position": 2, "name": "About", "item": "https://machxcycles.com/about" }
            ]
          })}
        </script>
        <script type="application/ld+json">
          {safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "MachX Cycles",
            "url": "https://machxcycles.com/",
            "logo": "https://machxcycles.com/logo.png",
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
              }
            }
          })}
        </script>
      </Helmet>
      <Navbar />

      {/* Hero */}
      <section className="relative text-white overflow-hidden" style={{ background: '#0a0a0f' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -right-32 w-[700px] h-[700px] rounded-full opacity-25"
            style={{ background: 'radial-gradient(circle, #ec4899 0%, transparent 60%)' }} />
          <div className="absolute top-1/3 -right-72 w-[500px] h-[500px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #f97316 0%, transparent 65%)' }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-3xl">
            <p className="text-pink-400 font-semibold text-sm uppercase tracking-widest mb-4">Our Story</p>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6 tracking-tight">
              Premium performance.<br />
              <span className="mx-gradient-text">Smarter prices.</span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              MachX Cycles is <a href="https://brooklynbikery.com" target="_blank" rel="noopener" className="text-white font-semibold hover:text-pink-300 transition-colors">Brooklyn Bikery</a>'s
              online used-bike shop. The same Brooklyn mechanics who've been
              wrenching, fitting, and selling bikes since 2020 (with a 4.9★ rating from 200+
              Google reviews) now ship inspected, tuned bikes nationwide — at prices that
              beat retail.
            </p>
          </div>
        </div>
      </section>

      {/* Origin story */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-3xl">
          <p className="text-pink-600 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">Why Pre-Owned</p>
          <h2 className="text-3xl font-black text-gray-900 mb-6 tracking-tight">
            New bikes <span className="mx-gradient-text">depreciate fast.</span>
          </h2>
          <div className="space-y-4 text-gray-600 leading-relaxed text-lg">
            <p>
              Let's be honest: bikes depreciate the moment they leave the shop. That
              $8,000 carbon road bike? Someone bought it, forgot about it, and now it's worth half what they paid. Their loss
              is your gain.
            </p>
            <p>
              We source quality pre-owned bikes from top brands like Trek,
              Specialized, Cannondale, and Giant. Every bike goes through our inspection
              process before it hits our site. If it doesn't meet our standards, we don't
              sell it.
            </p>
            <p>
              Every bike on MachX is sourced, inspected, and tuned out of the
              Brooklyn Bikery shop floor at 3149 Emmons Ave. The same mechanics who service
              the neighborhood's bikes are the ones dialing in yours before it ships. No
              surprises, no disappointments — just great bikes at great prices.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-14">
            <p className="text-pink-600 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">What Sets Us Apart</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4 tracking-tight">
              A better way to <span className="mx-gradient-text">buy pre-owned.</span>
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              We're not just flipping bikes — we're building a transparent, quality-first marketplace where the right bike finds the right rider.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl ring-1 ring-gray-200/80 hover:ring-pink-200 hover:shadow-xl hover:shadow-pink-100/40 transition-all duration-300 hover:-translate-y-1 p-6">
                <Icon size={22} className="text-pink-500 mb-5" strokeWidth={1.75} />
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Process */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-14">
          <p className="text-pink-600 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">The Process</p>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
            Our <span className="mx-gradient-text">inspection</span> standard.
          </h2>
        </div>
        <div className="grid md:grid-cols-4 gap-5">
          {[
            { step: '01', title: 'Source',  desc: 'We find quality pre-owned bikes from trusted sources' },
            { step: '02', title: 'Inspect', desc: 'Multi-point inspection covers frame, components, and wear' },
            { step: '03', title: 'Certify', desc: 'Only bikes that pass our standards get listed' },
            { step: '04', title: 'Ship',    desc: 'Tuned, cleaned, and carefully packed for delivery' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-white rounded-2xl ring-1 ring-gray-200/80 p-6 hover:ring-pink-200 hover:shadow-xl hover:shadow-pink-100/40 transition-all duration-300 hover:-translate-y-1">
              <span className="text-3xl font-black mx-gradient-text leading-none">{step}</span>
              <h3 className="font-bold text-gray-900 text-lg mt-3 mb-2">{title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Policies */}
      <section className="relative overflow-hidden text-white" style={{ background: '#0a0a0f' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-[700px] h-[400px]"
            style={{ background: 'radial-gradient(ellipse, rgba(236,72,153,0.15) 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[300px]"
            style={{ background: 'radial-gradient(ellipse, rgba(249,115,22,0.10) 0%, transparent 70%)' }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-14 max-w-2xl mx-auto">
            <p className="text-pink-400 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">Our Policies</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4 tracking-tight">
              Built on <span className="mx-gradient-text">transparency.</span>
            </h2>
            <p className="text-gray-400 leading-relaxed">
              Here's exactly what you get when you buy from MachX.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {[
              { stat: '30 Days', label: 'Return Window' },
              { stat: '100%',    label: 'Inspected' },
              { stat: 'Real',    label: 'Photos & Specs' },
            ].map(({ stat, label }) => (
              <div key={label} className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 text-center hover:bg-white/[0.06] hover:border-pink-500/30 transition-all duration-300">
                <span className="block text-3xl font-black mx-gradient-text leading-none pb-1">{stat}</span>
                <span className="block text-gray-400 text-sm mt-2">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/support" className="inline-flex items-center gap-1.5 text-pink-400 hover:text-pink-300 text-sm font-semibold transition-colors">
              See full return policy <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

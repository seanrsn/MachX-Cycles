import { Helmet } from 'react-helmet-async'
import { Search, DollarSign, Users, CheckCircle } from 'lucide-react'
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
        <title>About Us | MachX Cycles</title>
        <meta name="description" content="MachX Cycles - Brooklyn's premier pre-owned bike shop. Premium performance bikes at unbeatable prices. Learn about our inspection process and commitment to value." />
        <link rel="canonical" href="https://machxcycles.com/about" />
      </Helmet>
      <Navbar />

      {/* Hero */}
      <section className="bg-gray-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-3xl">
            <p className="text-pink-400 font-semibold text-sm uppercase tracking-widest mb-4">Our Story</p>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6">
              Premium performance.<br />
              <span className="text-pink-500">Smarter prices.</span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              MachX Cycles started with a simple idea: you shouldn't have to pay full retail
              to ride a great bike. We source, inspect, and certify premium pre-owned bikes
              so you can get more ride for your money.
            </p>
          </div>
        </div>
      </section>

      {/* Origin story */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Why Pre-Owned Makes Sense</h2>
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
              Based in Brooklyn, we've built a reputation for honest listings, accurate
              descriptions, and bikes that show up dialed in and ready to roll. No surprises, no
              disappointments — just great bikes at great prices.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-white border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">What Sets Us Apart</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              We're not just flipping bikes. We're building a better way to buy pre-owned
              — with transparency, quality, and real value.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-pink-100 text-pink-600 rounded-2xl mb-4">
                  <Icon size={28} />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Process */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Our Inspection Process</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { step: '01', title: 'Source', desc: 'We find quality pre-owned bikes from trusted sources' },
            { step: '02', title: 'Inspect', desc: 'Multi-point inspection covers frame, components, and wear' },
            { step: '03', title: 'Certify', desc: 'Only bikes that pass our standards get listed' },
            { step: '04', title: 'Ship', desc: 'Tuned, cleaned, and carefully packed for delivery' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-white rounded-2xl border border-gray-200 p-6">
              <span className="text-pink-600 font-bold text-sm">{step}</span>
              <h3 className="font-bold text-gray-900 text-lg mt-2 mb-2">{title}</h3>
              <p className="text-gray-600 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Policies */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="bg-gray-950 rounded-3xl text-white p-8 sm:p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Our Policies</h2>
          <p className="text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            We believe in transparency. Here's exactly what you get when you buy from MachX.
          </p>
          <div className="flex flex-wrap justify-center gap-8 text-sm">
            <div className="text-center">
              <span className="text-pink-500 text-2xl font-bold block">30 Days</span>
              <span className="text-gray-400">Return Window</span>
            </div>
            <div className="text-center">
              <span className="text-pink-500 text-2xl font-bold block">100%</span>
              <span className="text-gray-400">Inspected</span>
            </div>
            <div className="text-center">
              <span className="text-pink-500 text-2xl font-bold block">Real</span>
              <span className="text-gray-400">Photos & Specs</span>
            </div>
          </div>
          <p className="text-gray-500 text-xs mt-8">
            * Returns subject to 15% restocking fee. Customer covers return shipping. See Support page for full details.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}

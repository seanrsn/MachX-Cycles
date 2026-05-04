import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { RotateCcw, Truck, Search, ChevronDown, ChevronUp, CreditCard, Ruler } from 'lucide-react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/store/Navbar'
import Footer from '../../components/store/Footer'

const POLICIES = [
  {
    icon: RotateCcw,
    title: '30-Day Return Policy',
    color: 'bg-blue-100 text-blue-600',
    content: `
      Not the right fit? You have 30 days to return your bike.
      
      **Conditions:**
      • Bike must be in the same condition as received
      • All original components and accessories included
      • Contact us first to initiate the return
      
      **Process:**
      1. Contact us within 30 days of delivery
      2. We'll provide return shipping instructions
      3. Ship the bike back to us
      4. Refund issued within 5 business days
      
      **Important — Fees Apply:**
      • 15% restocking fee on all returns
      • Customer pays return shipping costs
      
      **Exception:** If your bike arrives damaged, contact us immediately with photos — we'll cover return shipping and issue a full refund.
    `,
  },
  {
    icon: Search,
    title: 'Inspection & Certification',
    color: 'bg-emerald-100 text-emerald-600',
    content: `
      Every bike goes through our multi-point inspection before listing.
      
      **What We Check:**
      • Frame integrity (cracks, dents, carbon damage)
      • Headset, bottom bracket, and wheel bearings
      • Drivetrain wear (chain, cassette, chainrings)
      • Brake pads and rotor condition
      • Wheel trueness and spoke tension
      • Shifting and brake performance
      • Tire condition and pressure
      
      **Before Shipping:**
      Each bike is cleaned, lubed, and tuned. We adjust brakes and derailleurs, and check torque specs.
      
      **Quick Assembly Required:**
      Just attach the pedals and stem when it arrives — about 10 minutes with basic tools.
    `,
  },
  {
    icon: Truck,
    title: 'Shipping & Delivery',
    color: 'bg-purple-100 text-purple-600',
    content: `
      **FREE shipping on all bikes** — nationwide delivery included.
      
      **Shipping Options:**
      • Standard (FREE): 5-7 business days
      • Local Pickup (FREE): Brooklyn, NY
      
      **How Bikes Ship:**
      Professionally packed in bike-specific boxes with foam protection. Front wheel, stem, and pedals are detached for safe shipping.
      
      **Quick Assembly (10 min):**
      • Attach front wheel
      • Install stem and handlebars
      • Screw in pedals
      • Adjust seat height
      • Check tire pressure
      • Ride!
      
      **Tracking:**
      You'll receive tracking info via email when your bike ships. Most bikes ship within 1-2 business days.
    `,
  },
  {
    icon: CreditCard,
    title: 'Payment Options',
    color: 'bg-amber-100 text-amber-600',
    content: `
      We make it easy to pay however works for you.
      
      **Credit & Debit:**
      • Visa, Mastercard, American Express, Discover
      
      **Digital Wallets:**
      • Apple Pay
      • Google Pay
      
      **Buy Now, Pay Later:**
      • Klarna — Pay in 4 interest-free installments
      • Affirm — Finance over 3-12 months
      
      **All transactions are secure and encrypted.**
    `,
  },
  {
    icon: Ruler,
    title: 'Sizing Guide',
    color: 'bg-pink-100 text-pink-600',
    content: 'sizing_chart',
  },
]

const FAQS = [
  {
    q: 'Can I pick up my bike in person?',
    a: 'Yes! Select local pickup at checkout — it\'s free. We\'re located in Brooklyn, NY and will have your bike ready. We\'ll contact you to arrange a pickup time.',
  },
  {
    q: 'How long until my order ships?',
    a: 'Most bikes ship within 1-2 business days. You\'ll receive tracking info via email as soon as it ships.',
  },
  {
    q: 'What if my bike arrives damaged?',
    a: 'Contact us immediately with photos of the damage. Shipping damage is rare, but if it happens we\'ll work with you to resolve it quickly.',
  },
  {
    q: 'Do you offer warranties?',
    a: 'Our bikes are pre-owned and sold as-is. However, every bike is thoroughly inspected before shipping. If something isn\'t as described, contact us within 30 days.',
  },
  {
    q: 'Can I reserve a bike before buying?',
    a: 'Not currently — our inventory moves fast. If you see a bike you love, we recommend purchasing it before it\'s gone.',
  },
]

const SIZING_DATA = [
  { frame: '13"', size: 'XS', minHeight: '4\'10"', maxHeight: '5\'2"' },
  { frame: '15"', size: 'S', minHeight: '5\'2"', maxHeight: '5\'6"' },
  { frame: '17"', size: 'M', minHeight: '5\'6"', maxHeight: '5\'10"' },
  { frame: '19"', size: 'L', minHeight: '5\'10"', maxHeight: '6\'2"' },
  { frame: '21"', size: 'XL', minHeight: '6\'2"', maxHeight: '6\'5"' },
]

function SizingChartContent() {
  return (
    <div>
      <p className="mb-4">The right frame size depends on your height. Here's a general guide:</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-2 pr-4 font-semibold text-gray-700">Frame</th>
              <th className="text-left py-2 pr-4 font-semibold text-gray-700">Size</th>
              <th className="text-left py-2 pr-4 font-semibold text-gray-700">Min Height</th>
              <th className="text-left py-2 font-semibold text-gray-700">Max Height</th>
            </tr>
          </thead>
          <tbody>
            {SIZING_DATA.map((row, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 pr-4 text-gray-900">{row.frame}</td>
                <td className="py-2 pr-4 text-gray-900">{row.size}</td>
                <td className="py-2 pr-4 text-gray-600">{row.minHeight}</td>
                <td className="py-2 text-gray-600">{row.maxHeight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-gray-500 text-xs">
        These are approximate — inseam and riding style matter too. Not sure? <Link to="/contact" className="text-pink-600 hover:underline">Contact us</Link> and we'll help you find the right fit.
      </p>
    </div>
  )
}

function PolicyCard({ icon: Icon, title, color, content }) {
  const [open, setOpen] = useState(false)
  
  const renderContent = () => {
    if (content === 'sizing_chart') {
      return <SizingChartContent />
    }
    
    const formattedContent = content
      .split('\n')
      .map((line, i) => {
        if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
          return <h4 key={i} className="font-semibold text-gray-900 mt-4 mb-2 first:mt-0">{line.replace(/\*\*/g, '')}</h4>
        }
        if (line.trim().startsWith('•')) {
          return <li key={i} className="ml-4 mb-1">{line.replace('•', '').trim()}</li>
        }
        if (line.trim().match(/^\d\./)) {
          return <li key={i} className="ml-4 mb-1">{line.trim()}</li>
        }
        if (line.trim()) {
          return <p key={i} className="mb-2">{line.trim()}</p>
        }
        return null
      })
      .filter(Boolean)
    
    return <>{formattedContent}</>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={`p-3 rounded-xl shrink-0 ${color}`}>
          <Icon size={24} />
        </div>
        <span className="flex-1 font-semibold text-gray-900 text-lg">{title}</span>
        {open ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2 text-gray-600 text-sm leading-relaxed border-t border-gray-100">
          {renderContent()}
        </div>
      )}
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="font-medium text-gray-900 pr-4">{q}</span>
        {open ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
      </button>
      {open && <p className="pb-4 text-gray-600 text-sm leading-relaxed">{a}</p>}
    </div>
  )
}

export default function Support() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Support & Policies | MachX Cycles</title>
        <meta name="description" content="MachX Cycles return policy, warranty info, and shipping details. 30-day returns, pre-owned bike inspection process, and customer support." />
        <link rel="canonical" href="https://machxcycles.com/support" />
      </Helmet>
      <Navbar />

      {/* Hero */}
      <section className="bg-gray-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-pink-400 font-semibold text-sm uppercase tracking-widest mb-4">Support</p>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">
              Policies & FAQ
            </h1>
            <p className="text-gray-400 text-lg">
              Everything you need to know about buying pre-owned bikes from MachX. 
              Returns, shipping, inspections — it's all here.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">How It Works</h2>
        <div className="space-y-3">
          {POLICIES.map(policy => (
            <PolicyCard key={policy.title} {...policy} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white border-y border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="bg-gray-50 rounded-xl p-6">
            {FAQS.map(faq => (
              <FAQItem key={faq.q} {...faq} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-pink-600 rounded-2xl text-white p-8 sm:p-10 text-center">
          <h2 className="text-2xl font-bold mb-3">Still have questions?</h2>
          <p className="text-pink-100 mb-6">
            Reach out anytime — we're real people and we actually respond.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 bg-white text-pink-600 px-8 py-3 rounded-xl font-semibold hover:bg-pink-50 transition-colors"
          >
            Contact Us
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}

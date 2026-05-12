import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { safeJsonLd } from '../../utils/safeJsonLd'
import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react'
import Navbar from '../../components/store/Navbar'
import Footer from '../../components/store/Footer'

const CONTACT_INFO = [
  {
    icon: MapPin,
    label: 'Visit Us',
    value: 'Brooklyn Bikery',
    sub: '3149 Emmons Ave, Brooklyn, NY 11235',
    href: 'https://maps.google.com/?q=3149+Emmons+Ave+Brooklyn+NY+11235',
  },
  {
    icon: Phone,
    label: 'Call Us',
    value: '(718) 218-4464',
    sub: 'Fastest response',
    href: 'tel:+17182184464',
  },
  {
    icon: Mail,
    label: 'Email Us',
    value: 'hello@machxcycles.com',
    sub: 'Replies within 24 hours',
    href: 'mailto:hello@machxcycles.com',
  },
  {
    icon: Clock,
    label: 'Hours',
    value: 'Open Wed–Sun',
    sub: 'See full schedule below',
    href: null,
  },
]

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    
    try {
      const res = await fetch('https://bs4rhhaumi.execute-api.us-east-1.amazonaws.com/prod/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message')
      }
      
      setSent(true)
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch (err) {
      setError(err.message || 'Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Contact MachX Cycles — Brooklyn Bike Shop | Hours, Phone, Address</title>
        <meta name="description" content="Visit MachX Cycles at Brooklyn Bikery, 3149 Emmons Ave, Brooklyn, NY 11235. Call (718) 218-4464. Open Wed–Sun. Questions on a build, sizing, or shipping? We're happy to help." />
        <link rel="canonical" href="https://machxcycles.com/contact" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Contact MachX Cycles — Brooklyn Bike Shop" />
        <meta property="og:description" content="3149 Emmons Ave, Brooklyn, NY · (718) 218-4464 · Open Wed–Sun. Questions on a build, sizing, or shipping?" />
        <meta property="og:url" content="https://machxcycles.com/contact" />
        <meta property="og:image" content="https://machxcycles.com/MachXPic.jpg" />
        <meta name="twitter:title" content="Contact MachX Cycles — Brooklyn Bike Shop" />
        <meta name="twitter:description" content="3149 Emmons Ave, Brooklyn, NY · (718) 218-4464." />
        <meta name="twitter:image" content="https://machxcycles.com/MachXPic.jpg" />
        <script type="application/ld+json">
          {safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BicycleStore",
            "name": "MachX Cycles",
            "url": "https://machxcycles.com/",
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
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-pink-400 font-semibold text-sm uppercase tracking-widest mb-4">Get In Touch</p>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4 tracking-tight">
              Let's <span className="mx-gradient-text">talk bikes.</span>
            </h1>
            <p className="text-gray-400 text-lg">
              Questions about a build? Need sizing advice? Just want to geek out about gear ratios?
              Drop by the <a href="https://brooklynbikery.com" target="_blank" rel="noopener" className="text-pink-400 hover:text-pink-300 underline-offset-2 hover:underline transition-colors">Brooklyn Bikery</a> shop, give us a call, or send a message — we're always happy to chat.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact info */}
          <div>
            <p className="text-pink-600 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">Find Us</p>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-6 tracking-tight">Drop by, call, or write.</h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {CONTACT_INFO.map(({ icon: Icon, label, value, sub, href }) => (
                <a
                  key={label}
                  href={href || '#'}
                  className={`bg-white rounded-2xl ring-1 ring-gray-200/80 p-5 transition-all duration-300 ${href ? 'hover:ring-pink-200 hover:shadow-xl hover:shadow-pink-100/40 hover:-translate-y-0.5' : ''}`}
                  {...(!href && { onClick: e => e.preventDefault() })}
                >
                  <Icon size={20} className="text-pink-500 mb-3" strokeWidth={1.75} />
                  <p className="text-[10px] text-gray-400 uppercase tracking-[0.18em] font-bold mb-1">{label}</p>
                  <p className="font-bold text-gray-900">{value}</p>
                  {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
                </a>
              ))}
            </div>

            {/* Map embed */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-200/80 overflow-hidden shadow-sm">
              <div className="aspect-[16/10] w-full bg-gray-100">
                <iframe
                  src="https://www.google.com/maps?q=3149+Emmons+Ave+Brooklyn+NY+11235&output=embed"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  width="600"
                  height="450"
                  className="w-full h-full"
                  title="MachX Cycles · Brooklyn Bikery on Google Maps"
                />
              </div>
              <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900 text-sm">Brooklyn Bikery</p>
                  <p className="text-xs text-gray-500">3149 Emmons Ave, Brooklyn, NY 11235</p>
                </div>
                <a
                  href="https://maps.google.com/?q=3149+Emmons+Ave+Brooklyn+NY+11235"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mx-gradient-btn text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-md shadow-pink-900/20"
                >
                  Directions →
                </a>
              </div>
            </div>

            {/* Hours panel */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-200/80 p-6 shadow-sm mt-4">
              <p className="text-pink-600 text-[11px] font-bold uppercase tracking-[0.22em] mb-3">Shop Hours</p>
              <div className="divide-y divide-gray-100 text-sm">
                <div className="flex justify-between py-2"><span className="font-medium text-gray-700">Monday</span><span className="text-gray-500 italic">By appointment only</span></div>
                <div className="flex justify-between py-2"><span className="font-medium text-gray-700">Tuesday</span><span className="text-gray-500 italic">By appointment only</span></div>
                <div className="flex justify-between py-2"><span className="font-medium text-gray-700">Wednesday</span><span className="text-pink-600 font-semibold">6:30 – 8:30 PM</span></div>
                <div className="flex justify-between py-2"><span className="font-medium text-gray-700">Thursday</span><span className="text-pink-600 font-semibold">10 AM – 6 PM</span></div>
                <div className="flex justify-between py-2"><span className="font-medium text-gray-700">Friday</span><span className="text-pink-600 font-semibold">10 AM – 6 PM</span></div>
                <div className="flex justify-between py-2"><span className="font-medium text-gray-700">Saturday</span><span className="text-pink-600 font-semibold">10 AM – 4 PM</span></div>
                <div className="flex justify-between py-2"><span className="font-medium text-gray-700">Sunday</span><span className="text-pink-600 font-semibold">10 AM – 4 PM</span></div>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div>
            <p className="text-pink-600 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">Reach Out</p>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-6 tracking-tight">Send a <span className="mx-gradient-text">message.</span></h2>
            {sent ? (
              <div className="bg-white rounded-2xl ring-1 ring-pink-200 p-8 text-center shadow-xl shadow-pink-100/40">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full mx-gradient-bg flex items-center justify-center shadow-lg shadow-pink-900/20">
                  <Send size={22} className="text-white" strokeWidth={2.25} />
                </div>
                <p className="font-bold text-gray-900 mb-2 text-lg">Message sent!</p>
                <p className="text-gray-600 text-sm">
                  We've received your message and will get back to you within 24 hours.
                </p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-4 text-pink-600 font-semibold text-sm hover:text-pink-700"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-2xl ring-1 ring-gray-200/80 p-6 space-y-5 shadow-sm">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500"
                      placeholder="Alex Johnson"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500"
                      placeholder="alex@example.com"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={e => setForm({ ...form, subject: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500"
                    placeholder="Question about sizing, custom build, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
                  <textarea
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    rows={5}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                    placeholder="Tell us what you're looking for..."
                    required
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full mx-gradient-btn disabled:bg-pink-400 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  {sending ? (
                    <>Sending...</>
                  ) : (
                    <><Send size={18} /> Send Message</>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

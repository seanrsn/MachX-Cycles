import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react'
import Navbar from '../../components/store/Navbar'
import Footer from '../../components/store/Footer'

const CONTACT_INFO = [
  {
    icon: MapPin,
    label: 'Visit Us',
    value: '3149 Emmons Ave',
    sub: 'Brooklyn, NY 11235',
    href: 'https://maps.google.com/?q=3149+Emmons+Ave+Brooklyn+NY+11235',
  },
  {
    icon: Phone,
    label: 'Call Us',
    value: '(718) 218-4464',
    sub: 'Mon–Sat, 10am–6pm EST',
    href: 'tel:+17182184464',
  },
  {
    icon: Mail,
    label: 'Email Us',
    value: 'info@machxcycles.com',
    sub: 'We respond within 24 hours',
    href: 'mailto:info@machxcycles.com',
  },
  {
    icon: Clock,
    label: 'Hours',
    value: 'Mon–Sat: 10am–6pm',
    sub: 'Sunday: By appointment',
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
        <title>Contact Us | MachX Cycles</title>
        <meta name="description" content="Get in touch with MachX Cycles. Visit our Brooklyn showroom, call us, or send us a message. We're here to help with your cycling needs." />
        <link rel="canonical" href="https://machxcycles.com/contact" />
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
              We're always happy to chat.
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

            {/* Map embed placeholder */}
            <div className="bg-gray-200 rounded-xl overflow-hidden h-64 flex items-center justify-center">
              <a
                href="https://maps.google.com/?q=3149+Emmons+Ave+Brooklyn+NY+11235"
                target="_blank"
                rel="noopener noreferrer"
                className="text-center p-8"
              >
                <MapPin size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600 font-medium">View on Google Maps</p>
                <p className="text-sm text-gray-500 mt-1">3149 Emmons Ave, Brooklyn</p>
              </a>
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

import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { ShoppingCart, ChevronLeft, ChevronRight, Bike, Check, X, Shield, Ruler, Calendar, Scale, Layers } from 'lucide-react'
import { getBike, getBikes } from '../../api/public'
import { useCartStore } from '../../store/cartStore'
import Navbar from '../../components/store/Navbar'
import Footer from '../../components/store/Footer'

// Fullscreen image viewer - hover magnify on desktop, pinch+pan on mobile
function ImageLightbox({ images, activeIndex, onClose, onPrev, onNext, setActiveIndex }) {
  const [zoom, setZoom] = useState(false)
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [isTouchDevice] = useState(() => 'ontouchstart' in window)
  
  // Mobile zoom/pan state
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const lastTouchRef = useRef(null)
  const lastDistRef = useRef(null)
  const lastCenterRef = useRef(null)
  const imgRef = useRef(null)
  
  // Reset zoom when changing images
  useEffect(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [activeIndex])
  
  const handleTouchStart = (e) => {
    if (e.touches.length === 1 && scale > 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      lastDistRef.current = dist
      lastCenterRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      }
    }
  }
  
  const handleTouchMove = (e) => {
    e.preventDefault()
    
    if (e.touches.length === 1 && scale > 1 && lastTouchRef.current) {
      // One finger pan when zoomed
      const deltaX = e.touches[0].clientX - lastTouchRef.current.x
      const deltaY = e.touches[0].clientY - lastTouchRef.current.y
      setTranslate(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }))
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    } else if (e.touches.length === 2 && lastDistRef.current) {
      // Two finger pinch zoom toward pinch center
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const newCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      }
      
      const scaleDelta = dist / lastDistRef.current
      const newScale = Math.min(Math.max(scale * scaleDelta, 1), 4)
      
      // Adjust translate to zoom toward pinch center
      if (imgRef.current && lastCenterRef.current) {
        const rect = imgRef.current.getBoundingClientRect()
        const imgCenterX = rect.left + rect.width / 2
        const imgCenterY = rect.top + rect.height / 2
        
        // Calculate offset from image center to pinch point
        const offsetX = newCenter.x - imgCenterX
        const offsetY = newCenter.y - imgCenterY
        
        // Pan to keep pinch point stable
        const panX = newCenter.x - lastCenterRef.current.x
        const panY = newCenter.y - lastCenterRef.current.y
        
        setTranslate(prev => ({
          x: prev.x + panX + offsetX * (1 - scaleDelta),
          y: prev.y + panY + offsetY * (1 - scaleDelta)
        }))
      }
      
      setScale(newScale)
      lastDistRef.current = dist
      lastCenterRef.current = newCenter
    }
  }
  
  const handleTouchEnd = () => {
    lastTouchRef.current = null
    lastDistRef.current = null
    lastCenterRef.current = null
    // Reset position if zoomed out
    if (scale <= 1) {
      setTranslate({ x: 0, y: 0 })
    }
  }
  
  const handleMouseMove = (e) => {
    if (isTouchDevice) return
    if (!zoom) return  // freeze origin while zooming out — prevents mid-animation jump
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPosition({ x, y })
  }

  const handleImageClick = (e) => {
    e.stopPropagation()
    // Update position to where they clicked, then toggle zoom
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPosition({ x, y })
    setZoom(z => !z)
  }
  
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white shrink-0">
        <span className="text-sm opacity-70">{activeIndex + 1} / {images.length}</span>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={24} />
        </button>
      </div>
      
      {/* Image area */}
      <div 
        className="flex-1 flex items-center justify-center p-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {isTouchDevice ? (
          // Mobile: just let the browser handle it natively
          <img
            src={images[activeIndex]?.url}
            alt="Product"
            className="max-w-full max-h-[75vh] object-contain"
          />
        ) : (
          // Desktop: Click to zoom
          <div
            className={`relative max-w-full max-h-full overflow-hidden ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
            onMouseLeave={() => setZoom(false)}
            onMouseMove={handleMouseMove}
            onClick={handleImageClick}
          >
            <img
              src={images[activeIndex]?.url}
              alt="Product"
              className="max-w-full max-h-[75vh] object-contain"
              style={{
                transition: zoom
                  ? 'transform 0.12s ease-out'
                  : 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                transform: zoom ? 'scale(2)' : 'scale(1)',
                transformOrigin: `${position.x}% ${position.y}%`,
              }}
              draggable={false}
            />
          </div>
        )}
      </div>
      
      {!isTouchDevice && <p className="text-center text-white/50 text-xs pb-2">{zoom ? 'Click or move mouse out to unzoom' : 'Click to zoom'}</p>}
      
      {/* Thumbnails at bottom */}
      {images.length > 1 && (
        <div className="flex justify-center gap-3 p-4 shrink-0" onClick={e => e.stopPropagation()}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${i === activeIndex ? 'border-white' : 'border-transparent opacity-50 hover:opacity-80'}`}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BikeDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const addItem  = useCartStore(s => s.addItem)

  const [activeImg, setActiveImg] = useState(0)
  const [slideDir, setSlideDir]   = useState('right')
  const [added, setAdded]         = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)

  const { data: bike, isLoading, isError } = useQuery({
    queryKey: ['public-bike', id],
    queryFn:  () => getBike(id),
  })

  // Related bikes — same category, exclude this one
  const { data: relatedData } = useQuery({
    queryKey: ['related-bikes', bike?.category_id],
    queryFn:  () => getBikes({ category_id: bike.category_id, limit: 5 }),
    enabled:  !!bike?.category_id,
  })
  const relatedBikes = (relatedData?.bikes || []).filter(b => String(b.id) !== String(id)).slice(0, 4)

  // Save to recently viewed in localStorage
  useEffect(() => {
    if (!bike) return
    const price = bike.base_price
    try {
      const stored = JSON.parse(localStorage.getItem('machx_recently_viewed') || '[]')
      const item = {
        id:           bike.id,
        name:         bike.name,
        price:        parseFloat(price),
        imageUrl:     bike.images?.[0]?.url || null,
        categoryName: bike.category_name,
      }
      const updated = [item, ...stored.filter(b => b.id !== bike.id)].slice(0, 8)
      localStorage.setItem('machx_recently_viewed', JSON.stringify(updated))
    } catch { /* ignore */ }
  }, [bike?.id])

  if (isLoading) return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-12 animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="aspect-square bg-gray-100 rounded-2xl" />
          <div className="space-y-6 py-4">
            <div className="h-4 bg-gray-100 rounded w-1/4" />
            <div className="h-10 bg-gray-100 rounded w-3/4" />
            <div className="h-8 bg-gray-100 rounded w-1/3" />
            <div className="h-24 bg-gray-100 rounded w-full" />
          </div>
        </div>
      </div>
    </div>
  )

  if (isError || !bike) return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="text-center py-24">
        <Bike size={64} className="mx-auto mb-4 text-gray-200" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Bike not found</h2>
        <p className="text-gray-500 mb-6">This listing may have been sold or removed.</p>
        <Link to="/shop" className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
          Browse Available Bikes
        </Link>
      </div>
    </div>
  )

  const images  = bike.images || []
  const price   = bike.base_price
  const inStock = !bike.sold
  const savings = bike.msrp && parseFloat(bike.msrp) > parseFloat(price)
    ? parseFloat(bike.msrp) - parseFloat(price)
    : null

  function handleAddToCart() {
    if (!inStock) return
    addItem({
      bikeId:   bike.id,
      bikeName: bike.name,
      price:    parseFloat(price),
      imageUrl: images[0]?.url || null,
      quantity: 1,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  function prev() { setSlideDir('left');  setActiveImg(i => (i - 1 + images.length) % images.length) }
  function next() { setSlideDir('right'); setActiveImg(i => (i + 1) % images.length) }

  // Build specs array
  const specs = []
if (bike.model_year) specs.push({ icon: Calendar, label: 'Year', value: bike.model_year })
  if (bike.material) specs.push({ icon: Layers, label: 'Frame Material', value: bike.material })
  if (bike.weight) specs.push({ icon: Scale, label: 'Weight', value: bike.weight })

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Helmet>
        <title>{bike.name} | {bike.category_name || 'Performance'} Bike | MachX Cycles</title>
        <meta name="description" content={bike.description ? bike.description.slice(0, 155) + '...' : `Shop the ${bike.name} at MachX Cycles. ${bike.material || 'Premium'} construction, race-ready performance. Starting at $${parseFloat(price).toLocaleString()}.`} />
        <link rel="canonical" href={`https://machxcycles.com/bikes/${bike.id}`} />
        {images[0]?.url && <meta property="og:image" content={images[0].url} />}
        <meta property="og:title" content={`${bike.name} | MachX Cycles`} />
        <meta property="og:type" content="product" />
        <meta property="product:price:amount" content={price} />
        <meta property="product:price:currency" content="USD" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": bike.name,
            "description": bike.description || `Premium ${bike.category_name || ''} bike from MachX Cycles`,
            "image": images[0]?.url || '',
            "brand": { "@type": "Brand", "name": "MachX Cycles" },
            "category": bike.category_name,
            "material": bike.material,
            "offers": {
              "@type": "Offer",
              "url": `https://machxcycles.com/bikes/${bike.id}`,
              "priceCurrency": "USD",
              "price": parseFloat(price).toFixed(2),
              "availability": inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              "seller": { "@type": "Organization", "name": "MachX Cycles" }
            }
          })}
        </script>
      </Helmet>
      
      <Navbar />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Back button + PRE-OWNED badge row */}
          <div className="flex items-center justify-between mb-2">
            <Link 
              to="/shop"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              <ChevronLeft size={20} />
            </Link>
            <span className="bg-pink-600 text-white text-xs font-bold px-3 py-1.5 rounded">PRE-OWNED</span>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
            
            {/* Image Gallery */}
            <div className="space-y-3">
              {/* Main Image */}
              <div 
                className="relative cursor-zoom-in group overflow-hidden rounded-xl"
                onClick={() => images.length > 0 && setLightboxOpen(true)}
              >
                {images.length > 0 ? (
                  <>
                    <img
                      key={activeImg}
                      src={images[activeImg]?.url}
                      alt={bike.name}
                      className={`w-full h-auto rounded-xl group-hover:scale-[1.02] transition-transform duration-300 ${slideDir === 'right' ? 'img-slide-right' : 'img-slide-left'}`}
                    />
                    {/* Navigation */}
                    {images.length > 1 && (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); prev(); }} 
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/90 hover:bg-white rounded-full shadow-lg transition"
                        >
                          <ChevronLeft size={20} className="text-gray-700" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); next(); }} 
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/90 hover:bg-white rounded-full shadow-lg transition"
                        >
                          <ChevronRight size={20} className="text-gray-700" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Bike size={80} className="text-gray-200" />
                  </div>
                )}
              </div>
              
              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      onClick={() => { setSlideDir(i > activeImg ? 'right' : 'left'); setActiveImg(i) }}
                      className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        i === activeImg 
                          ? 'border-pink-600' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Info */}
            <div>
              {/* Category & Status */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-semibold text-pink-600 uppercase tracking-wider">{bike.category_name}</span>
                {inStock ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    Available
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                    Sold
                  </span>
                )}
              </div>
              
              {/* Title */}
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">{bike.name}</h1>
              
              {/* Price */}
              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-bold text-gray-900">
                  ${parseFloat(price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                {bike.msrp && parseFloat(bike.msrp) > parseFloat(price) && (
                  <span className="text-xl text-gray-400 line-through">
                    ${parseFloat(bike.msrp).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              {savings && (
                <p className="mt-1 text-green-600 font-medium">
                  You save ${savings.toLocaleString('en-US', { minimumFractionDigits: 2 })} vs. buying new
                </p>
              )}
              
              {/* Description */}
              {bike.description && (
                <p className="mt-6 text-gray-900 leading-relaxed text-base">{bike.description}</p>
              )}
              
              {/* Specs */}
              {specs.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Specifications</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {specs.map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                          <Icon size={18} className="text-pink-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                          <p className="text-sm font-semibold text-gray-900 mt-0.5">
                            {value}
                            {label === 'Frame Size' && (
                              <button 
                                onClick={() => setSizeGuideOpen(true)} 
                                className="ml-2 text-xs text-pink-600 hover:text-pink-700 font-normal"
                              >
                                (size guide)
                              </button>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Trust Badge */}
              <div className="mt-6 flex items-center gap-2 text-gray-600">
                <Shield size={18} className="text-green-600" />
                <span className="text-sm">Inspected & certified — quick setup, ready to roll</span>
              </div>
              
              {/* CTA Buttons */}
              <div className="mt-8 space-y-3">
                <button
                  onClick={handleAddToCart}
                  disabled={!inStock}
                  className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-lg transition-all
                    ${added
                      ? 'bg-green-600 text-white'
                      : !inStock
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-pink-600 hover:bg-pink-700 text-white shadow-lg shadow-pink-600/25 hover:shadow-pink-600/40 active:scale-[0.98]'
                    }`}
                >
                  {added ? (
                    <><Check size={22} /> Added to Cart</>
                  ) : !inStock ? (
                    'Sold Out'
                  ) : (
                    <><ShoppingCart size={22} /> Add to Cart</>
                  )}
                </button>
                
                <button 
                  onClick={() => navigate('/checkout')} 
                  className="w-full py-3.5 rounded-xl border-2 border-gray-200 font-semibold text-gray-700 hover:border-gray-900 hover:text-gray-900 transition-colors"
                >
                  View Cart & Checkout
                </button>
              </div>
              
              {/* Quick Info */}
              <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                <div className="p-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Shipping</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">Nationwide</p>
                </div>
                <div className="p-3 border-x border-gray-100">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Returns</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">30 Days</p>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Support</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">7 Days/Week</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Related Bikes */}
      {relatedBikes.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-6">You Might Also Like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {relatedBikes.map(b => {
              const img   = b.images?.[0]?.url || null
              const price = b.min_variant_price ?? b.base_price
              return (
                <Link
                  key={b.id}
                  to={`/bikes/${b.id}`}
                  className="group bg-white rounded-2xl overflow-hidden border border-gray-200 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                >
                  <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                    {img
                      ? <img src={img} alt={b.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      : <div className="w-full h-full flex items-center justify-center"><Bike size={36} className="text-gray-300" /></div>
                    }
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-pink-600 uppercase tracking-wide truncate">{b.category_name}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{b.name}</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">
                      ${parseFloat(price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <Footer />

      {/* Image lightbox */}
      {lightboxOpen && images.length > 0 && (
        <ImageLightbox
          images={images}
          activeIndex={activeImg}
          setActiveIndex={setActiveImg}
          onClose={() => setLightboxOpen(false)}
          onPrev={() => setActiveImg(i => (i - 1 + images.length) % images.length)}
          onNext={() => setActiveImg(i => (i + 1) % images.length)}
        />
      )}

      {/* Size Guide Modal */}
      {sizeGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSizeGuideOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Size Guide</h3>
              <button onClick={() => setSizeGuideOpen(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">Find your frame size based on your height:</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-semibold text-gray-700">Frame</th>
                  <th className="text-left py-2 font-semibold text-gray-700">Size</th>
                  <th className="text-left py-2 font-semibold text-gray-700">Height</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr><td className="py-2">13"</td><td className="py-2">XS</td><td className="py-2 text-gray-600">4'10" – 5'2"</td></tr>
                <tr><td className="py-2">15"</td><td className="py-2">S</td><td className="py-2 text-gray-600">5'2" – 5'6"</td></tr>
                <tr><td className="py-2">17"</td><td className="py-2">M</td><td className="py-2 text-gray-600">5'6" – 5'10"</td></tr>
                <tr><td className="py-2">19"</td><td className="py-2">L</td><td className="py-2 text-gray-600">5'10" – 6'2"</td></tr>
                <tr><td className="py-2">21"</td><td className="py-2">XL</td><td className="py-2 text-gray-600">6'2" – 6'5"</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-4">
              These are approximate. Inseam and riding style matter too. <a href="/contact" className="text-pink-600 hover:underline">Contact us</a> if you're unsure.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

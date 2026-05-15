import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { ShoppingCart, ChevronLeft, ChevronRight, Bike, Check, X, Shield, Ruler, Calendar, Layers, Info, Award } from 'lucide-react'
import { getBike, getBikes } from '../../api/public'
import { useCartStore } from '../../store/cartStore'
import Navbar from '../../components/store/Navbar'
import Footer from '../../components/store/Footer'
import { FRAME_SIZES, getSize } from '../../constants/sizes'
import { getCondition } from '../../constants/conditions'
import { bikePath } from '../../utils/bikePath'
import { safeJsonLd } from '../../utils/safeJsonLd'
import { categorySlug } from '../../utils/categorySlug'

// Fullscreen image viewer - hover magnify on desktop, pinch+pan on mobile
function ImageLightbox({ images, activeIndex, onClose, onPrev, onNext, setActiveIndex, slideDir }) {
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

  // Reset zoom when changing images, and unzoom desktop magnify too
  useEffect(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    setZoom(false)
  }, [activeIndex])

  // Keyboard navigation (←/→ to flip, Esc to close)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft')  onPrev()
      else if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext, onClose])
  
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
  
  const slideClass = slideDir === 'right' ? 'img-slide-right' : 'img-slide-left'

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-gray-700 shrink-0 border-b border-gray-100">
        <span className="text-sm font-medium text-gray-500">{activeIndex + 1} / {images.length}</span>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700" aria-label="Close">
          <X size={24} />
        </button>
      </div>

      {/* Image area */}
      <div
        className="relative flex-1 flex items-center justify-center p-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {isTouchDevice ? (
          // Mobile: just let the browser handle it natively
          <img
            key={activeIndex}
            src={images[activeIndex]?.url}
            alt="Product"
            className={`max-w-full max-h-[75vh] object-contain ${slideClass}`}
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
              key={activeIndex}
              src={images[activeIndex]?.url}
              alt="Product"
              className={`max-w-full max-h-[75vh] object-contain ${slideClass}`}
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

        {/* Side arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onPrev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-white shadow-lg ring-1 ring-gray-200 hover:ring-pink-300 hover:shadow-xl rounded-full transition-all text-gray-700 z-10"
              aria-label="Previous image"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-white shadow-lg ring-1 ring-gray-200 hover:ring-pink-300 hover:shadow-xl rounded-full transition-all text-gray-700 z-10"
              aria-label="Next image"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {!isTouchDevice && <p className="text-center text-gray-400 text-xs pb-2">{zoom ? 'Click or move mouse out to unzoom' : 'Click to zoom'}</p>}

      {/* Thumbnails at bottom */}
      {images.length > 1 && (
        <div className="flex justify-center gap-3 p-4 shrink-0 border-t border-gray-100" onClick={e => e.stopPropagation()}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`w-16 h-16 rounded-lg overflow-hidden ring-2 transition-all ${i === activeIndex ? 'ring-pink-500' : 'ring-transparent opacity-60 hover:opacity-100'}`}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const MATERIAL_INFO = {
  'Carbon': {
    headline: 'The premium race material',
    points: [
      'Lightest material available — ideal for climbing',
      'Exceptional stiffness for direct power transfer',
      'Naturally damps road vibration for all-day comfort',
      'Found on flagship road, gravel, and TT bikes',
    ],
  },
  'Aluminum': {
    headline: 'Reliable performance, sensible price',
    points: [
      'Light, stiff, and quick to accelerate',
      'Corrosion-resistant and durable',
      'Modern alloys rival entry-level carbon',
      'The sweet spot for price-to-performance',
    ],
  },
  'Steel': {
    headline: 'Classic ride quality that lasts',
    points: [
      'Famously smooth, springy feel over rough roads',
      'Easy to repair — welds can be redone anywhere',
      'Often outlives the rider',
      'Beloved by touring and endurance riders',
    ],
  },
  'Titanium': {
    headline: 'The lifetime frame',
    points: [
      'Compliance of steel with the weight of aluminum',
      'Corrosion-proof — never rusts',
      'Virtually indestructible under normal use',
      'The ultimate one-bike-for-life choice',
    ],
  },
}

function getYearInfo(year) {
  const age = new Date().getFullYear() - year
  let era, body
  if (age <= 1) {
    era  = 'Latest generation'
    body = 'Current model year — the newest geometry, materials, and component groups available.'
  } else if (age <= 4) {
    era  = 'Recent generation'
    body = 'Modern componentry and current frame standards. Functionally indistinguishable from a new bike.'
  } else if (age <= 10) {
    era  = 'Modern era'
    body = 'Frame technology from this period rides nearly identically to today\'s bikes. The differences are mostly cosmetic and incremental.'
  } else if (age <= 20) {
    era  = 'Established classic'
    body = 'Frames from this era are proven over many years of real-world riding. Often built to last decades and many are still being raced.'
  } else {
    era  = 'Cycling heritage'
    body = 'A piece of cycling history. Often hand-crafted with materials and aesthetics no longer found on new bikes.'
  }
  return {
    age,
    era,
    body,
    note: 'Frame age matters less than condition. Components — drivetrain, brakes, wheels — can always be upgraded. The frame is what holds long-term value.',
  }
}

export default function BikeDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const addItem  = useCartStore(s => s.addItem)

  const [activeImg, setActiveImg] = useState(0)
  const [slideDir, setSlideDir]   = useState('right')
  const [added, setAdded]         = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const [infoModal, setInfoModal] = useState(null) // 'material' | 'year' | 'condition' | null

  const { data: bike, isLoading, isError } = useQuery({
    queryKey: ['public-bike', slug],
    queryFn:  () => getBike(slug),
  })

  // isInCart needs the resolved bike.id (slug → id only known after fetch).
  // Subscribe to the items array directly (stable reference between renders);
  // do the membership check during render. A selector that returned a *new*
  // derived array every call (.map(...)) would trigger an infinite re-render
  // because Zustand's default shallow equality sees a new reference each time.
  const cartItems = useCartStore(s => s.items)
  const isInCart  = !!bike && cartItems.some(it => it.bikeId === bike.id)

  // Related bikes — same category, exclude this one
  const { data: relatedData } = useQuery({
    queryKey: ['related-bikes', bike?.category_id],
    queryFn:  () => getBikes({ category_id: bike.category_id, limit: 5 }),
    enabled:  !!bike?.category_id,
  })
  const relatedBikes = (relatedData?.bikes || []).filter(b => b.id !== bike?.id).slice(0, 4)

  // Save to recently viewed in localStorage
  useEffect(() => {
    if (!bike) return
    const price = bike.base_price
    try {
      const stored = JSON.parse(localStorage.getItem('machx_recently_viewed') || '[]')
      const item = {
        id:           bike.id,
        slug:         bike.slug || null,
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
      <Helmet>
        <title>Bike Not Found | MachX Cycles</title>
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <Navbar />
      <div className="text-center py-24">
        <Bike size={64} className="mx-auto mb-4 text-gray-200" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Bike not found</h1>
        <p className="text-gray-500 mb-6">This listing may have been sold or removed.</p>
        <Link to="/shop" className="inline-flex items-center gap-2 mx-gradient-btn text-white px-6 py-3 rounded-xl font-semibold transition-colors">
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
  const savingsPct = savings
    ? Math.round((savings / parseFloat(bike.msrp)) * 100)
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

  // Build specs array — Size / Year / Material / Condition.
  // Each card is clickable and opens its own popover.
  const sizeMeta      = bike.frame_size      ? getSize(bike.frame_size)              : null
  const conditionMeta = bike.condition_grade ? getCondition(bike.condition_grade)    : null
  const specs = []
  if (bike.frame_size) specs.push({
    icon: Ruler,
    label: 'Size',
    value: sizeMeta?.label || bike.frame_size,
    sub:   sizeMeta?.frame || null,
    onClick: () => setSizeGuideOpen(true),
  })
  if (bike.model_year) specs.push({
    icon: Calendar,
    label: 'Year',
    value: bike.model_year,
    onClick: () => setInfoModal('year'),
  })
  if (bike.material) specs.push({
    icon: Layers,
    label: 'Material',
    value: bike.material,
    onClick: () => setInfoModal('material'),
  })
  if (conditionMeta) specs.push({
    icon: Award,
    label: 'Condition',
    value: conditionMeta.label,
    onClick: () => setInfoModal('condition'),
  })

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Helmet>
        <title>{(() => {
          // Word-boundary truncate so we never cut mid-word; final string
          // (with " | MachX Cycles" suffix) stays under ~62 chars for SERP.
          const base = `${bike.name} — Used ${bike.category_name || ''}`.trim()
          const cap = 45
          if (base.length <= cap) return `${base} | MachX Cycles`
          const cut = base.slice(0, cap)
          const lastSpace = cut.lastIndexOf(' ')
          return `${(lastSpace > 25 ? cut.slice(0, lastSpace) : cut)} | MachX Cycles`
        })()}</title>
        <meta name="description" content={(() => {
          if (bike.description) {
            const trimmed = bike.description.slice(0, 152)
            const lastSpace = trimmed.lastIndexOf(' ')
            return (lastSpace > 100 ? trimmed.slice(0, lastSpace) : trimmed) + '…'
          }
          return `Shop the ${bike.name} at MachX Cycles. Pre-owned ${bike.material || 'performance'} ${bike.category_name?.toLowerCase() || 'bike'}, inspected and tuned. ${parseFloat(price) > 0 ? `Now $${parseFloat(price).toLocaleString()}.` : ''}`
        })()} />
        <link rel="canonical" href={`https://machxcycles.com${bikePath(bike)}`} />
        {/* Open Graph */}
        <meta property="og:type" content="product" />
        <meta property="og:title" content={`${bike.name} — Used | MachX Cycles`} />
        <meta property="og:description" content={bike.description ? bike.description.slice(0, 200) : `Pre-owned ${bike.category_name?.toLowerCase() || 'bike'} — inspected and ride-ready.`} />
        <meta property="og:url" content={`https://machxcycles.com${bikePath(bike)}`} />
        <meta property="og:image" content={images[0]?.url || 'https://machxcycles.com/MachXPic.jpg'} />
        {/* OG Product price tags (og:price:* is what Pinterest/X actually use; product:price:* is the legacy FB feed namespace, kept for back-compat) */}
        <meta property="og:price:amount" content={parseFloat(price).toFixed(2)} />
        <meta property="og:price:currency" content="USD" />
        <meta property="product:price:amount" content={price} />
        <meta property="product:price:currency" content="USD" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${bike.name} — Used | MachX Cycles`} />
        <meta name="twitter:description" content={bike.description ? bike.description.slice(0, 200) : `Pre-owned ${bike.category_name?.toLowerCase() || 'bike'} — inspected and ride-ready.`} />
        <meta name="twitter:image" content={images[0]?.url || 'https://machxcycles.com/MachXPic.jpg'} />
        {/* Product structured data — itemCondition is always UsedCondition since
            we exclusively sell pre-owned. Brand is the actual manufacturer
            (Cannondale, Trek, etc.) when set; MachX is the seller.
            safeJsonLd escapes admin-controlled strings so a `</script>` paste can't break out. */}
        <script type="application/ld+json">
          {safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": bike.name,
            "description": bike.description || `Pre-owned ${bike.category_name || ''} bike from MachX Cycles`,
            // Only include image when we actually have one — empty string is invalid per Google
            ...(images[0]?.url ? { "image": images[0].url } : {}),
            "sku": String(bike.id),
            "itemCondition": "https://schema.org/UsedCondition",
            ...(bike.brand && bike.brand !== 'MachX' ? {
              "brand": { "@type": "Brand", "name": bike.brand }
            } : {}),
            "category": bike.category_name,
            "material": bike.material,
            ...(bike.model_year ? { "productionDate": String(bike.model_year) } : {}),
            ...(sizeMeta ? { "size": sizeMeta.label } : {}),
            "offers": {
              "@type": "Offer",
              "url": `https://machxcycles.com${bikePath(bike)}`,
              "priceCurrency": "USD",
              "price": parseFloat(price).toFixed(2),
              // priceValidUntil — Google Merchant requires this for Offers.
              // We use 1 year out; the bike is unique and price doesn't expire.
              "priceValidUntil": new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              "itemCondition": "https://schema.org/UsedCondition",
              "availability": inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              "seller": {
                "@type": "Organization",
                "name": "MachX Cycles",
                "url": "https://machxcycles.com/"
              }
            }
          })}
        </script>
        {/* Breadcrumb */}
        <script type="application/ld+json">
          {safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home",  "item": "https://machxcycles.com/" },
              { "@type": "ListItem", "position": 2, "name": "Shop",  "item": "https://machxcycles.com/shop" },
              ...(bike.category_name ? [{
                "@type": "ListItem",
                "position": 3,
                "name": bike.category_name,
                "item": `https://machxcycles.com/shop/${categorySlug(bike.category_name)}`
              }] : []),
              {
                "@type": "ListItem",
                "position": bike.category_name ? 4 : 3,
                "name": bike.name,
                "item": `https://machxcycles.com${bikePath(bike)}`
              }
            ]
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
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.18em] bg-white border border-gray-200 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
              Pre-Owned
            </span>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
            
            {/* Image Gallery */}
            <div className="space-y-3">
              {/* Main Image — fixed 4:3 frame so dimensions don't jump between photos */}
              <div
                className="relative cursor-zoom-in group overflow-hidden rounded-xl bg-white ring-1 ring-gray-200/80 aspect-[4/3]"
                onClick={() => images.length > 0 && setLightboxOpen(true)}
              >
                {images.length > 0 ? (
                  <>
                    <img
                      key={activeImg}
                      src={images[activeImg]?.url}
                      alt={`${bike.name} — pre-owned ${bike.category_name || 'bike'}`}
                      width="1200"
                      height="900"
                      fetchpriority="high"
                      decoding="async"
                      className={`absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300 ${slideDir === 'right' ? 'img-slide-right' : 'img-slide-left'}`}
                    />
                    {/* Navigation */}
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); prev(); }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white shadow-lg ring-1 ring-gray-200 hover:ring-pink-300 rounded-full transition-all z-10"
                          aria-label="Previous image"
                        >
                          <ChevronLeft size={20} className="text-gray-700" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); next(); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white shadow-lg ring-1 ring-gray-200 hover:ring-pink-300 rounded-full transition-all z-10"
                          aria-label="Next image"
                        >
                          <ChevronRight size={20} className="text-gray-700" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
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
                      className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all bg-gradient-to-br from-gray-50 to-gray-100 p-1 ${
                        i === activeImg
                          ? 'border-pink-600'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img
                        src={img.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain"
                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.06))' }}
                      />
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
                {!inStock && (
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
                <p className="mt-2 text-sm font-semibold">
                  <span className="mx-gradient-text">
                    You save ${savings.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({savingsPct}%)
                  </span>
                  <span className="text-gray-500 font-medium"> vs. buying new</span>
                </p>
              )}
              
              {/* Description */}
              {bike.description && (
                <p className="mt-6 text-gray-900 leading-relaxed text-base">{bike.description}</p>
              )}
              
              {/* Specs — Size / Year / Material / Condition */}
              {specs.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Specifications</h2>
                  <div
                    className={`grid gap-3 ${
                      specs.length === 1 ? 'grid-cols-1' :
                      specs.length === 2 ? 'grid-cols-2' :
                      specs.length === 3 ? 'grid-cols-3' :
                      'grid-cols-2 sm:grid-cols-2 md:grid-cols-4'
                    }`}
                  >
                    {specs.map(({ icon: Icon, label, value, sub, onClick }, i) => (
                      <button
                        key={label}
                        onClick={onClick}
                        style={{ animationDelay: `${i * 70}ms` }}
                        className="spec-card-anim group relative overflow-hidden rounded-xl bg-gradient-to-br from-pink-50/60 via-white to-white ring-1 ring-pink-100 p-4 text-left hover:ring-pink-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                      >
                        <Info
                          size={13}
                          className="absolute top-2 right-2 text-pink-300 group-hover:text-pink-500 transition-colors"
                        />
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-lg bg-white ring-1 ring-pink-100 flex items-center justify-center shrink-0">
                            <Icon size={15} className="text-pink-600" />
                          </div>
                          <p className="text-[10px] font-semibold text-pink-600 uppercase tracking-[0.12em] truncate">{label}</p>
                        </div>
                        <p className="text-base font-bold text-gray-900 leading-tight truncate">{value}</p>
                        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
                      </button>
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
                  disabled={!inStock || isInCart}
                  className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-lg transition-all
                    ${added || isInCart
                      ? 'bg-green-600 text-white'
                      : !inStock
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'mx-gradient-btn text-white shadow-lg shadow-pink-600/25 hover:shadow-pink-600/40 active:scale-[0.98]'
                    }`}
                >
                  {!inStock ? (
                    'Sold Out'
                  ) : (added || isInCart) ? (
                    <><Check size={22} /> Already in Cart</>
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
              const price = b.base_price
              return (
                <Link
                  key={b.id}
                  to={bikePath(b)}
                  className="group bg-white rounded-2xl overflow-hidden border border-gray-200 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                >
                  <div className="aspect-[4/5] bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
                    {img
                      ? <img
                          src={img}
                          alt={`${b.name} — pre-owned`}
                          loading="lazy"
                          decoding="async"
                          width="480"
                          height="600"
                          className="w-full h-full object-contain group-hover:scale-[1.04] transition-transform duration-300"
                        />
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
          slideDir={slideDir}
          setActiveIndex={(i) => { setSlideDir(i > activeImg ? 'right' : 'left'); setActiveImg(i) }}
          onClose={() => setLightboxOpen(false)}
          onPrev={() => { setSlideDir('left');  setActiveImg(i => (i - 1 + images.length) % images.length) }}
          onNext={() => { setSlideDir('right'); setActiveImg(i => (i + 1) % images.length) }}
        />
      )}

      {/* Material / Year / Condition info modal */}
      {infoModal && (() => {
        const matInfo  = infoModal === 'material'  ? MATERIAL_INFO[bike.material]   : null
        const yearInfo = infoModal === 'year' && bike.model_year ? getYearInfo(bike.model_year) : null
        const condInfo = infoModal === 'condition' ? getCondition(bike.condition_grade) : null
        const Icon = infoModal === 'material' ? Layers
                   : infoModal === 'year'     ? Calendar
                   : Award
        const labelText = infoModal === 'material'  ? 'Frame Material'
                        : infoModal === 'year'      ? 'Model Year'
                        : 'Condition'
        const titleText = infoModal === 'material'  ? bike.material
                        : infoModal === 'year'      ? bike.model_year
                        : (condInfo?.label || bike.condition_grade)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setInfoModal(null)}>
            <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-50 ring-1 ring-pink-100 flex items-center justify-center">
                    <Icon size={20} className="text-pink-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-pink-600 uppercase tracking-[0.12em]">{labelText}</p>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight">{titleText}</h3>
                  </div>
                </div>
                <button onClick={() => setInfoModal(null)} className="p-1 hover:bg-gray-100 rounded-full -mt-1 -mr-1">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {infoModal === 'material' && matInfo && (
                <>
                  <p className="text-sm font-medium text-gray-900 mb-3">{matInfo.headline}</p>
                  <ul className="space-y-2">
                    {matInfo.points.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700">
                        <Check size={16} className="text-pink-600 shrink-0 mt-0.5" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {infoModal === 'material' && !matInfo && (
                <p className="text-sm text-gray-700">{bike.material} — a quality frame material used by countless riders for its unique balance of weight, comfort, and durability.</p>
              )}

              {infoModal === 'year' && yearInfo && (
                <>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-900">{yearInfo.era}</span>
                    <span className="text-xs text-gray-500">· {yearInfo.age} year{yearInfo.age === 1 ? '' : 's'} old</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed mb-4">{yearInfo.body}</p>
                  <div className="bg-pink-50/60 ring-1 ring-pink-100 rounded-lg p-3">
                    <p className="text-xs text-gray-700 leading-relaxed">{yearInfo.note}</p>
                  </div>
                </>
              )}

              {infoModal === 'condition' && condInfo && (
                <>
                  <p className="text-sm font-medium text-gray-900 mb-2">{condInfo.headline}</p>
                  <p className="text-sm text-gray-700 leading-relaxed mb-4">{condInfo.body}</p>
                  <div className="bg-pink-50/60 ring-1 ring-pink-100 rounded-lg p-3">
                    <p className="text-xs text-gray-700 leading-relaxed">
                      Every bike is hands-on inspected before listing. Cosmetic wear is documented in the photos so you know exactly what you're getting before you buy.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Size Guide Modal */}
      {sizeGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSizeGuideOpen(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Size Guide</h3>
              <button onClick={() => setSizeGuideOpen(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">Find your frame size based on your height:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-3 font-semibold text-gray-700">Measured Frame</th>
                    <th className="text-left py-2 pr-3 font-semibold text-gray-700">Size</th>
                    <th className="text-left py-2 pr-3 font-semibold text-gray-700">Min Height</th>
                    <th className="text-left py-2 font-semibold text-gray-700">Max Height</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {FRAME_SIZES.map(row => {
                    const isCurrent = row.code === bike.frame_size
                    return (
                      <tr key={row.code} className={isCurrent ? 'bg-pink-50' : ''}>
                        <td className="py-2 pr-3 text-gray-900">{row.frame}</td>
                        <td className="py-2 pr-3 text-gray-900 font-medium">{row.label}</td>
                        <td className="py-2 pr-3 text-gray-600">{row.minHeight}</td>
                        <td className="py-2 text-gray-600">{row.maxHeight}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              These are approximate. Inseam and riding style matter too. <a href="/contact" className="text-pink-600 hover:underline">Contact us</a> if you're unsure.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

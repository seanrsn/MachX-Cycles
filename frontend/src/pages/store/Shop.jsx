import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Bike, ArrowRight, SlidersHorizontal, X, Search, ChevronDown } from 'lucide-react'
import { getBikes, getCategories, getSizes } from '../../api/public'
import Navbar from '../../components/store/Navbar'

const SORT_OPTIONS = [
  { value: '',           label: 'Featured'          },
  { value: 'price_asc',  label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'newest',     label: 'Newest First'      },
]

function BikeCard({ bike }) {
  const img   = bike.images?.[0]?.url || null
  const price = bike.min_variant_price ?? bike.base_price
  const msrp  = bike.msrp
  return (
    <Link to={`/bikes/${bike.id}`} className="group bg-white rounded-2xl overflow-hidden border border-gray-200 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
      <div className="aspect-[4/3] bg-gray-100 overflow-hidden relative">
        {img
          ? <img src={img} alt={bike.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><Bike size={48} className="text-gray-300" /></div>
        }
        <span className="absolute top-3 left-3 bg-pink-600 text-white text-xs font-bold px-2 py-1 rounded">PRE-OWNED</span>
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
          <ArrowRight size={16} className="text-pink-600 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Link>
  )
}

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFilters, setShowFilters]   = useState(false)
  const [page, setPage]                 = useState(1)

  const categoryParam = searchParams.get('category')  || ''
  const sizeParam     = searchParams.get('size')       || ''
  const qParam        = searchParams.get('q')          || ''
  const sortParam     = searchParams.get('sort')       || ''
  const minPriceParam = searchParams.get('min_price')  || ''
  const maxPriceParam = searchParams.get('max_price')  || ''

  // Local search input (committed on Enter)
  const [searchInput, setSearchInput] = useState(qParam)

  // Local price inputs (committed via Apply button)
  const [priceInputs, setPriceInputs] = useState({ min: minPriceParam, max: maxPriceParam })

  // Reset page when any filter changes
  useEffect(() => { setPage(1) }, [categoryParam, sizeParam, qParam, sortParam, minPriceParam, maxPriceParam])

  // Recently viewed from localStorage
  const [recentlyViewed, setRecentlyViewed] = useState([])
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('machx_recently_viewed') || '[]')
      setRecentlyViewed(stored)
    } catch { /* ignore */ }
  }, [])

  function commitSearch() {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      const trimmed = searchInput.trim()
      if (trimmed) next.set('q', trimmed)
      else next.delete('q')
      return next
    })
  }

  function applyPriceFilter() {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (priceInputs.min) next.set('min_price', priceInputs.min)
      else next.delete('min_price')
      if (priceInputs.max) next.set('max_price', priceInputs.max)
      else next.delete('max_price')
      return next
    })
  }

  function setSort(value) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set('sort', value)
      else next.delete('sort')
      return next
    })
  }

  function setCategory(id) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (id) next.set('category', id)
      else next.delete('category')
      return next
    })
    setShowFilters(false)
  }

  function setSize(s) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (s) next.set('size', s)
      else next.delete('size')
      return next
    })
  }

  function clearAllFilters() {
    setPriceInputs({ min: '', max: '' })
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('category')
      next.delete('size')
      next.delete('min_price')
      next.delete('max_price')
      return next
    })
  }

  const { data: catData } = useQuery({ queryKey: ['public-categories'], queryFn: getCategories })
  const categories = catData?.categories || []

  const { data: sizeData } = useQuery({ queryKey: ['public-sizes'], queryFn: getSizes })
  const sizes = sizeData?.sizes || []

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-bikes', categoryParam, sizeParam, qParam, minPriceParam, maxPriceParam, sortParam, page],
    queryFn: () => getBikes({
      ...(categoryParam ? { category_id: categoryParam } : {}),
      ...(sizeParam     ? { size: sizeParam }             : {}),
      ...(qParam        ? { search: qParam }              : {}),
      ...(minPriceParam ? { min_price: minPriceParam }    : {}),
      ...(maxPriceParam ? { max_price: maxPriceParam }    : {}),
      ...(sortParam     ? { sort: sortParam }             : {}),
      page,
      limit: 12,
    }),
    keepPreviousData: true,
  })

  const bikes      = data?.bikes  || []
  const total      = data?.total  || 0
  const totalPages = data?.pages  || 1

  const activeCategory    = categories.find(c => String(c.id) === String(categoryParam))
  const hasPriceFilter    = !!(minPriceParam || maxPriceParam)
  const activeFilterCount = (categoryParam ? 1 : 0) + (sizeParam ? 1 : 0) + (hasPriceFilter ? 1 : 0)

  const pageTitle = qParam
    ? `Results for "${qParam}"`
    : activeCategory ? activeCategory.name : 'All Bikes'

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>{activeCategory ? `${activeCategory.name} Bikes` : 'All Bikes'} | MachX Cycles</title>
        <meta name="description" content={activeCategory
          ? `Shop pre-owned ${activeCategory.name.toLowerCase()} bikes at MachX Cycles. Inspected, certified, and priced to ride.`
          : 'Browse our selection of certified pre-owned road, mountain, and e-bikes. Premium performance without the premium price tag.'
        } />
        <link rel="canonical" href={`https://machxcycles.com/shop${categoryParam ? `?category=${categoryParam}` : ''}`} />
      </Helmet>
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Search bar */}
        <div className="relative mb-6">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commitSearch()}
            placeholder="Search"
            className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('')
                setSearchParams(prev => {
                  const next = new URLSearchParams(prev)
                  next.delete('q')
                  return next
                })
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Header row: title + sort + filters */}
        <div className="flex items-center justify-between mb-6 gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{pageTitle}</h1>
            {!isLoading && <p className="text-sm text-gray-500 mt-0.5">{total} bike{total !== 1 ? 's' : ''}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Sort dropdown */}
            <div className="relative">
              <select
                value={sortParam}
                onChange={e => setSort(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer transition-colors"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {/* Filters button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:border-pink-500 hover:text-pink-600 transition-colors"
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-pink-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 space-y-5">

            {/* Category */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-gray-900 text-sm">Category</span>
                {categoryParam && (
                  <button onClick={() => setCategory('')} className="text-xs text-red-600 flex items-center gap-1 hover:text-red-700">
                    <X size={12} /> Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCategory('')} className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${!categoryParam ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 text-gray-700 hover:border-pink-500'}`}>All</button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => setCategory(c.id)} className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${String(c.id) === String(categoryParam) ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 text-gray-700 hover:border-pink-500'}`}>{c.name}</button>
                ))}
              </div>
            </div>

            {/* Frame Size */}
            {sizes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-900 text-sm">Frame Size</span>
                  {sizeParam && (
                    <button onClick={() => setSize('')} className="text-xs text-red-600 flex items-center gap-1 hover:text-red-700">
                      <X size={12} /> Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setSize('')} className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${!sizeParam ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 text-gray-700 hover:border-pink-500'}`}>All</button>
                  {sizes.map(s => (
                    <button key={s} onClick={() => setSize(s)} className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${s === sizeParam ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 text-gray-700 hover:border-pink-500'}`}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Price Range */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-gray-900 text-sm">Price Range</span>
                {hasPriceFilter && (
                  <button
                    onClick={() => {
                      setPriceInputs({ min: '', max: '' })
                      setSearchParams(prev => {
                        const n = new URLSearchParams(prev)
                        n.delete('min_price')
                        n.delete('max_price')
                        return n
                      })
                    }}
                    className="text-xs text-red-600 flex items-center gap-1 hover:text-red-700"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={priceInputs.min}
                    onChange={e => setPriceInputs(p => ({ ...p, min: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && applyPriceFilter()}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                </div>
                <span className="text-gray-400 text-sm">—</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Max"
                    value={priceInputs.max}
                    onChange={e => setPriceInputs(p => ({ ...p, max: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && applyPriceFilter()}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={applyPriceFilter}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Clear all */}
            {activeFilterCount > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <button onClick={clearAllFilters} className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors">
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-200 animate-pulse">
                <div className="aspect-[4/3] bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-gray-500">Failed to load bikes. Please try again.</div>
        ) : bikes.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Bike size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="font-medium">No bikes found.</p>
            {(qParam || categoryParam || sizeParam || hasPriceFilter) && (
              <p className="text-sm mt-1">
                Try adjusting your search or{' '}
                <button
                  onClick={() => {
                    setSearchInput('')
                    setPriceInputs({ min: '', max: '' })
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev)
                      next.delete('q'); next.delete('category'); next.delete('size')
                      next.delete('min_price'); next.delete('max_price')
                      return next
                    })
                  }}
                  className="text-pink-600 hover:underline"
                >
                  clearing all filters
                </button>.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {bikes.map(b => <BikeCard key={b.id} bike={b} />)}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-10">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-40 hover:border-pink-500 transition-colors">Prev</button>
            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-40 hover:border-pink-500 transition-colors">Next</button>
          </div>
        )}

        {/* Recently Viewed */}
        {recentlyViewed.length > 0 && (
          <div className="mt-14 pt-8 border-t border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Recently Viewed</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
              {recentlyViewed.map(b => (
                <Link
                  key={b.id}
                  to={`/bikes/${b.id}`}
                  className="shrink-0 w-44 bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="h-28 bg-gray-100 overflow-hidden">
                    {b.imageUrl
                      ? <img src={b.imageUrl} alt={b.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Bike size={28} className="text-gray-300" /></div>
                    }
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-pink-600 font-medium truncate">{b.categoryName}</p>
                    <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{b.name}</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">${b.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

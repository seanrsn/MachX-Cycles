import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, Upload, X, Film, ImageIcon, CheckCircle, Bike, GripVertical, AlertTriangle, Clock } from 'lucide-react'
import {
  getBike, createBike, updateBike, releaseBikeReservation,
  getUploadUrl, deleteImage, reorderImages,
} from '../../api/admin'
import { PageHeader, Button, Spinner } from '../../components/common'
import { FRAME_SIZES } from '../../constants/sizes'
import { CONDITIONS } from '../../constants/conditions'
import { CYCLING_BRANDS, BRAND_OTHER } from '../../constants/brands'

const CATEGORIES = [
  { id: 1, name: 'Road' }, { id: 2, name: 'Mountain' }, { id: 3, name: 'Hybrid' },
  { id: 4, name: 'Cruiser' }, { id: 5, name: 'Gravel' }, { id: 6, name: 'E-Bike' },
]
const MATERIALS = ['Carbon', 'Aluminum', 'Steel', 'Titanium']
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/mov']
const ACCEPT_ATTR    = '.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime'
const IMAGE_MAX        = 25 * 1024 * 1024   // 25 MB hard cap (post-compression)
const VIDEO_MAX        = 100 * 1024 * 1024  // 100 MB
const COMPRESS_OVER    = 4 * 1024 * 1024    // skip compression below this — already small enough
const MAX_EDGE         = 3200               // longest edge in pixels after resize
const JPEG_QUALITY     = 0.92               // visually lossless

function isVideo(url) {
  return /\.(mp4|mov|quicktime)(\?|$)/i.test(url)
}

// Auto-optimize phone photos: resize longest edge to MAX_EDGE, re-encode at 92%.
// PNGs become WebP (preserves transparency); everything else becomes JPEG.
// Skips: non-images, files already under COMPRESS_OVER, GIFs (would lose animation).
// Returns the original File if compression would increase size or throws.
async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file
  if (file.size < COMPRESS_OVER)        return file
  if (file.type === 'image/gif')        return file

  try {
    const img = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const i = new Image()
      i.onload  = () => { URL.revokeObjectURL(url); resolve(i) }
      i.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')) }
      i.src = url
    })

    const longest = Math.max(img.naturalWidth, img.naturalHeight)
    const scale   = Math.min(1, MAX_EDGE / longest)
    const w       = Math.round(img.naturalWidth  * scale)
    const h       = Math.round(img.naturalHeight * scale)

    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)

    // PNG and WebP can carry transparency — re-encode as WebP to preserve alpha.
    // JPEG inputs stay JPEG (smallest for photos, no alpha to lose).
    const preservesAlpha = file.type === 'image/png' || file.type === 'image/webp'
    const outType = preservesAlpha ? 'image/webp' : 'image/jpeg'
    const outExt  = preservesAlpha ? '.webp'      : '.jpg'

    const blob = await new Promise(res => canvas.toBlob(res, outType, JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file

    const newName = file.name.replace(/\.[^.]+$/, '') + outExt
    return new File([blob], newName, { type: outType })
  } catch {
    return file
  }
}

// ── ImageManager ──────────────────────────────────────────────────────────────

function ImageManager({ bikeId, initialImages = [] }) {
  const [images, setImages]       = useState(initialImages)
  const [uploads, setUploads]     = useState([])   // { id, file, progress, error, done }
  const [dragging, setDragging]   = useState(false)
  const [dragId, setDragId]       = useState(null) // image being dragged
  const [overId, setOverId]       = useState(null) // image being hovered during drag
  const fileRef                   = useRef(null)
  const disabled                  = !bikeId

  useEffect(() => { setImages(initialImages) }, [initialImages.length])

  // Reorder: move dragId before/after overId, persist to backend
  async function handleReorderDrop(targetId) {
    if (!dragId || dragId === targetId) {
      setDragId(null); setOverId(null); return
    }
    const fromIdx = images.findIndex(i => i.id === dragId)
    const toIdx   = images.findIndex(i => i.id === targetId)
    if (fromIdx < 0 || toIdx < 0) {
      setDragId(null); setOverId(null); return
    }

    const next = images.slice()
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)

    // Optimistic update
    const previous = images
    setImages(next)
    setDragId(null); setOverId(null)

    try {
      await reorderImages(bikeId, next.map(i => i.id))
    } catch {
      setImages(previous)
      alert('Failed to save new order. Please try again.')
    }
  }

  async function handleFiles(files) {
    const list = Array.from(files)
    const newUploads = list.map(f => ({ id: Math.random().toString(36).slice(2), file: f, progress: 0, error: null, done: false }))
    setUploads(prev => [...prev, ...newUploads])

    for (const item of newUploads) {
      const isVid = item.file.type.startsWith('video/')

      if (!ACCEPTED_TYPES.includes(item.file.type)) {
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, error: 'Unsupported file type' } : u))
        continue
      }

      // Auto-compress oversized phone photos before validating size cap
      let file = item.file
      if (!isVid) {
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, progress: 10 } : u))
        file = await compressImage(item.file)
      }

      const limit = isVid ? VIDEO_MAX : IMAGE_MAX
      if (file.size > limit) {
        const mb = isVid ? '100' : '25'
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, error: `File exceeds ${mb} MB limit` } : u))
        continue
      }

      try {
        // 1. Get presigned URL (use post-compression filename/content-type)
        const { upload_url, image_url, image_id } = await getUploadUrl(bikeId, {
          filename:     file.name,
          content_type: file.type,
        })

        // 2. PUT directly to S3.
        // Cache-Control matches the value the backend baked into the presigned
        // URL signature — must be sent verbatim or S3 rejects with signature
        // mismatch. Filenames are UUIDs so 1y immutable is safe.
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, progress: 30 } : u))
        const putRes = await fetch(upload_url, {
          method:  'PUT',
          headers: {
            'Content-Type':  file.type,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
          body:    file,
        })
        if (!putRes.ok) throw new Error('S3 upload failed')

        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, progress: 100, done: true } : u))
        setImages(prev => [...prev, { id: image_id, url: image_url }])

        // Auto-remove from upload list after a moment
        setTimeout(() => setUploads(prev => prev.filter(u => u.id !== item.id)), 1500)
      } catch (err) {
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, error: err.message || 'Upload failed' } : u))
      }
    }
  }

  async function handleDelete(img) {
    try {
      await deleteImage(bikeId, img.id)
      setImages(prev => prev.filter(i => i.id !== img.id))
    } catch {
      alert('Failed to delete image.')
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    if (!disabled) handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-semibold text-gray-900">Media (Photos & Videos)</h2>

      {disabled && (
        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Save the bike first to add photos and videos.
        </div>
      )}

      {/* Existing images grid — drag to reorder. Number badge shows display order. */}
      {images.length > 0 && (
        <>
          <p className="text-xs text-gray-500">Drag to reorder · #1 is the cover photo customers see first.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((img, idx) => {
              const isDragging  = dragId === img.id
              const isDropTarget = overId === img.id && dragId && dragId !== img.id
              return (
                <div
                  key={img.id}
                  draggable
                  onDragStart={() => setDragId(img.id)}
                  onDragOver={e => { e.preventDefault(); if (dragId && dragId !== img.id) setOverId(img.id) }}
                  onDragLeave={() => setOverId(o => o === img.id ? null : o)}
                  onDrop={e => { e.preventDefault(); handleReorderDrop(img.id) }}
                  onDragEnd={() => { setDragId(null); setOverId(null) }}
                  className={`relative group aspect-square rounded-lg overflow-hidden bg-gray-100 ring-1 transition-all cursor-grab active:cursor-grabbing
                    ${isDragging   ? 'opacity-40 ring-pink-300' : 'ring-gray-200'}
                    ${isDropTarget ? 'ring-2 ring-pink-500 scale-[1.02]' : ''}`}
                >
                  {isVideo(img.url) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <Film size={32} />
                      <span className="text-xs mt-1">Video</span>
                    </div>
                  ) : (
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover pointer-events-none"
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  )}

                  {/* Order number badge */}
                  <div className="absolute top-1.5 left-1.5 mx-gradient-bg text-white text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md shadow-pink-900/30 pointer-events-none">
                    {idx + 1}
                  </div>

                  {/* Drag handle hint */}
                  <div className="absolute bottom-1.5 left-1.5 p-1 bg-white/85 backdrop-blur-sm rounded text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <GripVertical size={12} />
                  </div>

                  <button
                    onClick={() => handleDelete(img)}
                    className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    aria-label="Remove image"
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map(u => (
            <div
              key={u.id}
              className={`rounded-lg border px-3 py-2 text-sm ${u.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate flex-1">{u.file.name}</span>
                {u.error && <X size={14} onClick={() => setUploads(p => p.filter(x => x.id !== u.id))} className="cursor-pointer shrink-0" />}
                {u.done && <span className="text-green-600 text-xs">✓</span>}
              </div>
              {u.error && <p className="text-xs mt-0.5">{u.error}</p>}
              {!u.error && !u.done && (
                <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-pink-600 rounded-full transition-all" style={{ width: `${u.progress}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 transition-colors cursor-pointer
          ${disabled ? 'border-gray-200 opacity-50 cursor-not-allowed' : dragging ? 'border-pink-400 bg-pink-50' : 'border-gray-300 hover:border-pink-400 hover:bg-pink-50'}`}
      >
        <Upload size={24} className="text-gray-400" />
        <p className="text-sm font-medium text-gray-700">Drop files or tap to upload</p>
        <p className="text-xs text-gray-400">JPG / JPEG, PNG, WebP, GIF, MP4, MOV · Photos auto-optimized · Videos ≤ 100 MB</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  )
}

// ── ReservationPanel ─────────────────────────────────────────────────────────
// Only mounted when a bike has an active reservation. Shows what state the
// reservation is in, who has it (order id), when it expires, and gives admin
// a manual "release" button for stuck cases.

function describeReservation(state) {
  switch (state) {
    case 'soft':       return { label: 'Cart hold (5 min TTL)',    severity: 'low'  }
    case 'pi_created': return { label: 'On Stripe form (10 min TTL)', severity: 'med' }
    case 'processing': return { label: 'Authorizing payment (locked)', severity: 'high' }
    default:           return { label: state, severity: 'low' }
  }
}

function formatExpiry(reservedUntil) {
  if (!reservedUntil) return null
  // MySQL returns ISO-ish format (UTC). Treat as UTC; show in local time.
  const d = new Date(reservedUntil + (reservedUntil.endsWith('Z') ? '' : 'Z'))
  const minsLeft = Math.round((d.getTime() - Date.now()) / 60000)
  if (minsLeft <= 0) return 'expired (will release automatically on next checkout attempt)'
  if (minsLeft === 1) return '~1 min remaining'
  return `~${minsLeft} min remaining`
}

function ReservationPanel({ bike, onReleased }) {
  const [confirming, setConfirming] = useState(false)
  const [releasing, setReleasing]   = useState(false)
  const [err, setErr]               = useState('')

  const meta     = describeReservation(bike.reservation_state)
  const expiry   = formatExpiry(bike.reserved_until)
  const isLocked = bike.reservation_state === 'processing'

  async function handleRelease() {
    setErr('')
    setReleasing(true)
    try {
      await releaseBikeReservation(bike.id)
      setConfirming(false)
      onReleased?.()
    } catch (e) {
      setErr(e?.message || 'Failed to release reservation')
    } finally {
      setReleasing(false)
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${isLocked ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isLocked ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
          {isLocked ? <AlertTriangle size={18} /> : <Clock size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`font-semibold ${isLocked ? 'text-amber-900' : 'text-blue-900'}`}>
            Active reservation — {meta.label}
          </h2>
          <p className={`text-sm mt-0.5 ${isLocked ? 'text-amber-800' : 'text-blue-800'}`}>
            {bike.reservation_session_id
              ? <>A shopper (session <span className="font-mono">#{bike.reservation_session_id}</span>) is currently checking out this bike.</>
              : 'Reservation is held by an unknown session.'}
            {expiry && <> · {expiry}</>}
          </p>
          {isLocked && (
            <p className="text-xs text-amber-800 mt-1.5">
              <strong>Heads up:</strong> the buyer's payment is being authorized right now. Releasing this reservation
              won't refund their payment if it succeeds — only use this if you're certain the checkout is stuck.
            </p>
          )}

          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 text-xs font-medium text-gray-700 underline hover:text-gray-900"
            >
              Release reservation
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-700">Are you sure?</span>
              <button
                type="button"
                onClick={handleRelease}
                disabled={releasing}
                className="text-xs font-semibold bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-60"
              >
                {releasing ? 'Releasing…' : 'Yes, release'}
              </button>
              <button
                type="button"
                onClick={() => { setConfirming(false); setErr('') }}
                disabled={releasing}
                className="text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          )}
          {err && <p className="text-xs text-red-700 mt-2">{err}</p>}
        </div>
      </div>
    </div>
  )
}


// ── BikeForm ──────────────────────────────────────────────────────────────────

export default function BikeForm() {
  const { id }   = useParams()
  const isEdit   = !!id
  const navigate = useNavigate()
  const location = useLocation()
  const qc       = useQueryClient()
  // True when we just landed here from the create flow — used to surface
  // a "now add photos" hint without persisting the flag anywhere.
  const justCreated = !!location.state?.justCreated

  const [form, setForm] = useState({
    name: '', category_id: 1, description: '', base_price: '', msrp: '',
    brand: '', material: '', frame_size: '', condition_grade: '',
    model_year: new Date().getFullYear(),
    featured: false, sold: false,
  })
  // Track whether the admin picked "Other" so we can show a free-text field.
  // If the brand on a loaded bike isn't in the catalog, we also flip into
  // free-text mode so the value remains editable.
  const [brandIsOther, setBrandIsOther] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')

  const { data: bikeData, isLoading } = useQuery({
    queryKey: ['admin-bike', id],
    queryFn:  () => getBike(id),
    enabled:  isEdit,
    staleTime: 0, // always fetch fresh when editing
  })

  // Depend on bikeData?.id (primitive) — avoids object reference staleness from cache
  useEffect(() => {
    if (!bikeData) return
    // 'MachX' was the legacy default brand from the original schema before we
    // added a real brand field. Treat it as unset so the admin picks a real
    // bike brand on edit.
    const loadedBrand = (bikeData.brand && bikeData.brand !== 'MachX') ? bikeData.brand : ''
    setForm({
      name:            bikeData.name            || '',
      category_id:     bikeData.category_id     || 1,
      description:     bikeData.description     || '',
      base_price:      bikeData.base_price      || '',
      msrp:            bikeData.msrp            || '',
      brand:           loadedBrand,
      material:        bikeData.material        || '',
      frame_size:      bikeData.frame_size      || '',
      condition_grade: bikeData.condition_grade || '',
      model_year:      bikeData.model_year      || new Date().getFullYear(),
      featured:        !!bikeData.featured,
      sold:            !!bikeData.sold,
    })
    // If the loaded brand isn't in the catalog, the admin needs the free-text
    // box to edit it (otherwise it'd be invisible in the dropdown).
    if (loadedBrand && !CYCLING_BRANDS.includes(loadedBrand)) {
      setBrandIsOther(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bikeData?.id])

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name || !form.base_price) { setError('Name and base price are required.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        base_price:      parseFloat(form.base_price),
        msrp:            form.msrp ? parseFloat(form.msrp) : null,
        category_id:     parseInt(form.category_id),
        model_year:      parseInt(form.model_year),
        brand:           (form.brand || '').trim() || null,
        frame_size:      form.frame_size || null,
        condition_grade: form.condition_grade || null,
        featured:        form.featured ? 1 : 0,
        is_active:       1,
        sold:            form.sold ? 1 : 0,
      }
      let bikeId = id
      if (isEdit) {
        await updateBike(id, payload)
      } else {
        const created = await createBike(payload)
        bikeId = created.id
      }
      // Invalidate every cache that could be holding a stale copy of this bike.
      // Use prefix matching so all id variants (string/number) and pagination
      // params get refreshed.
      qc.invalidateQueries({ queryKey: ['admin-bikes']    })
      qc.invalidateQueries({ queryKey: ['admin-bike']     })
      qc.invalidateQueries({ queryKey: ['public-bike']    })
      qc.invalidateQueries({ queryKey: ['public-bikes']   })
      qc.invalidateQueries({ queryKey: ['public-featured']})
      qc.invalidateQueries({ queryKey: ['related-bikes']  })

      // Show success state then redirect
      setSuccess(true)
      setTimeout(() => {
        // For NEW bikes, jump into edit mode for the just-created bike so
        // the user can immediately upload photos/videos (the media manager
        // is disabled before save because images need a bike_id to attach
        // to). For EDIT, back to the list — they're done.
        if (!isEdit && bikeId) {
          navigate(`/admin/bikes/${bikeId}/edit`, {
            state: { justCreated: true },
          })
        } else {
          navigate('/admin/bikes')
        }
      }, 1200)
    } catch (err) {
      setError(err.message || 'Failed to save bike.')
      setSaving(false)
    }
  }

  if (isEdit && (isLoading || !bikeData)) return <div className="flex justify-center py-16"><Spinner /></div>

  // Success overlay
  if (success) {
    return (
      <div className="max-w-3xl">
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isEdit ? 'Bike Updated!' : 'Bike Created!'}
          </h2>
          <p className="text-gray-500">Redirecting to bikes list...</p>
        </div>
      </div>
    )
  }

  // Get cover image (first image)
  const coverImage = bikeData?.images?.[0]?.url

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={isEdit ? 'Edit Bike' : 'Add Bike'}
        subtitle={isEdit ? form.name : 'Create a new product'}
      >
        <Button variant="secondary" onClick={() => navigate('/admin/bikes')}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}><Save size={16} /> Save</Button>
      </PageHeader>

      {/* Cover photo when editing */}
      {isEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
            {coverImage ? (
              <img src={coverImage} alt={form.name} className="w-full h-full object-cover" />
            ) : (
              <Bike size={32} className="text-gray-300" />
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{form.name || 'Untitled Bike'}</p>
            <p className="text-sm text-gray-500">
              {bikeData?.images?.length || 0} photo{(bikeData?.images?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {justCreated && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3">
          ✓ Bike created. Now scroll down to add photos and videos.
        </div>
      )}

      {/* Active reservation banner — only renders when a buyer is *actively*
          checking out this bike. Hides when:
            - reservation_state is none/sold
            - bike is sold
            - reservation TTL has expired (state stale, no longer blocks anyone) */}
      {(() => {
        if (!isEdit || !bikeData || bikeData.sold) return null
        const state = bikeData.reservation_state
        if (!state || state === 'none' || state === 'sold') return null
        // Soft / pi_created with expired TTL: panel would just say "expired".
        // The reservation isn't actually blocking anyone. Hide it.
        if (state !== 'processing' && bikeData.reserved_until) {
          const exp = new Date(bikeData.reserved_until + (bikeData.reserved_until.endsWith('Z') ? '' : 'Z'))
          if (exp.getTime() <= Date.now()) return null
        }
        return (
          <ReservationPanel bike={bikeData} onReleased={() => {
            qc.invalidateQueries({ queryKey: ['admin-bike', id] })
            qc.invalidateQueries({ queryKey: ['admin-bikes'] })
          }} />
        )
      })()}

      {/* Mark as Sold toggle */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${form.sold ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
        <div>
          <h2 className={`font-semibold ${form.sold ? 'text-red-800' : 'text-green-800'}`}>
            {form.sold ? 'SOLD' : 'Available'}
          </h2>
          <p className={`text-sm ${form.sold ? 'text-red-600' : 'text-green-600'}`}>
            {form.sold ? 'This bike has been sold' : 'This bike is available for purchase'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setField('sold', !form.sold)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${form.sold ? 'bg-red-600 focus:ring-red-500' : 'bg-green-600 focus:ring-green-500'}`}
        >
          <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.sold ? 'translate-x-0' : 'translate-x-5'}`} />
        </button>
      </div>

      {/* Featured toggle */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${form.featured ? 'bg-pink-50 border-pink-300' : 'bg-white border-gray-200'}`}>
        <div>
          <h2 className={`font-semibold ${form.featured ? 'text-pink-800' : 'text-gray-700'}`}>Featured</h2>
          <p className={`text-sm ${form.featured ? 'text-pink-600' : 'text-gray-400'}`}>
            {form.featured ? 'Shown on the homepage' : 'Not featured on homepage'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setField('featured', !form.featured)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${form.featured ? 'bg-pink-600 focus:ring-pink-500' : 'bg-gray-300 focus:ring-gray-400'}`}
        >
          <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.featured ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Basic Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Basic Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={e => setField('name', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="Enter the full bike name (brand + model)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category_id} onChange={e => setField('category_id', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Our Price *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">$</span>
              <input type="number" min="0" step="0.01" value={form.base_price} onChange={e => setField('base_price', e.target.value)} className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="Enter your asking price" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Original MSRP</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">$</span>
              <input type="number" min="0" step="0.01" value={form.msrp} onChange={e => setField('msrp', e.target.value)} className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="Retail price when new (optional)" />
            </div>
            <p className="text-xs text-gray-400 mt-1">Shown crossed out to highlight savings</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
            <select
              value={brandIsOther ? BRAND_OTHER : form.brand}
              onChange={e => {
                const v = e.target.value
                if (v === BRAND_OTHER) {
                  setBrandIsOther(true)
                  setField('brand', '')
                } else {
                  setBrandIsOther(false)
                  setField('brand', v)
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500"
            >
              <option value="">Select brand…</option>
              {CYCLING_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              <option value={BRAND_OTHER}>Other (type below)</option>
            </select>
            {brandIsOther && (
              <input
                type="text"
                value={form.brand}
                onChange={e => setField('brand', e.target.value)}
                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500"
                placeholder="Enter brand name (e.g. Argonaut, Mosaic, Sage)"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
            <select value={form.material} onChange={e => setField('material', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500">
              <option value="">Select frame material…</option>
              {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frame Size</label>
            <select value={form.frame_size} onChange={e => setField('frame_size', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500">
              <option value="">Select frame size…</option>
              {FRAME_SIZES.map(s => (
                <option key={s.code} value={s.code}>{s.label} — {s.frame}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
            <select value={form.condition_grade} onChange={e => setField('condition_grade', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500">
              <option value="">Select condition…</option>
              {CONDITIONS.map(c => (
                <option key={c.code} value={c.code}>{c.label} — {c.headline}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model Year</label>
            <input type="number" value={form.model_year} onChange={e => setField('model_year', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="Enter the model year" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500" placeholder="Describe the bike's condition, components, and any notable details…" />
          </div>
        </div>
      </div>

      {/* Images / Videos */}
      <ImageManager
        bikeId={isEdit ? id : null}
        initialImages={bikeData?.images || []}
      />
    </div>
  )
}

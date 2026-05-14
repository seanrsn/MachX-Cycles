import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Edit, Trash2, Search, CheckCircle } from 'lucide-react'
import { getBikes, deleteBike, getThumbUploadUrl } from '../../api/admin'
import { PageHeader, Badge, Spinner, Button, ConfirmDialog } from '../../components/common'

// Same thumbnail logic used by ImageManager on initial upload — duplicated
// here so the admin Bikes page can backfill thumbnails for legacy bikes
// that were uploaded before the thumb pipeline existed.
const THUMB_SIZE = 192
async function makeThumb(blob) {
  const img = await new Promise((res, rej) => {
    const url = URL.createObjectURL(blob)
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload  = () => { URL.revokeObjectURL(url); res(i) }
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode failed')) }
    i.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_SIZE; canvas.height = THUMB_SIZE
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  const scale = Math.max(THUMB_SIZE / img.naturalWidth, THUMB_SIZE / img.naturalHeight)
  const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale
  ctx.drawImage(img, (THUMB_SIZE - dw) / 2, (THUMB_SIZE - dh) / 2, dw, dh)
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8))
}

const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

export default function Bikes() {
  const [search, setSearch]     = useState('')
  const [confirm, setConfirm]   = useState(null) // { id, name }
  const navigate    = useNavigate()
  const location    = useLocation()
  const qc          = useQueryClient()

  // Flash banner shown briefly after a save in BikeForm. We replace the
  // location state immediately so a refresh doesn't re-show it.
  const [flashSaved, setFlashSaved] = useState(!!location.state?.flashSaved)
  useEffect(() => {
    if (location.state?.flashSaved) {
      navigate(location.pathname, { replace: true, state: {} })
      const t = setTimeout(() => setFlashSaved(false), 2400)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bikes', search],
    queryFn:  () => getBikes(search ? { search } : {}),
  })

  // One-shot backfill of thumbnails for bikes whose primary image was
  // uploaded before the thumb pipeline existed. Runs in the background
  // when /admin/bikes loads. Each bike: fetch full image, generate 192px
  // thumb in canvas, upload to a presigned URL the backend hands back.
  // The backend commits thumb_url upfront; the table's img.onError
  // gracefully falls back to the full image if S3 hasn't received the
  // PUT yet (~few seconds after backfill triggers).
  const backfilledRef = useRef(new Set())
  useEffect(() => {
    const bikes = data?.bikes || []
    const needsBackfill = bikes.filter(b =>
      b.primary_image_url && !b.primary_thumb_url
      && b.primary_image_id && !backfilledRef.current.has(b.primary_image_id)
    )
    if (needsBackfill.length === 0) return

    let cancelled = false
    ;(async () => {
      // Throttle to 2 concurrent so we don't hammer the device or
      // saturate the network with full-resolution downloads.
      for (let i = 0; i < needsBackfill.length; i += 2) {
        if (cancelled) return
        await Promise.all(needsBackfill.slice(i, i + 2).map(async bike => {
          backfilledRef.current.add(bike.primary_image_id)
          try {
            const blob = await fetch(bike.primary_image_url).then(r => r.ok ? r.blob() : null)
            if (!blob) return
            const thumbBlob = await makeThumb(blob)
            if (!thumbBlob) return
            const { upload_url } = await getThumbUploadUrl(bike.id, bike.primary_image_id)
            await fetch(upload_url, {
              method:  'PUT',
              headers: {
                'Content-Type':  'image/jpeg',
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
              body: thumbBlob,
            })
          } catch (e) {
            console.warn(`thumb backfill failed for bike ${bike.id}:`, e)
          }
        }))
      }
      // Refresh the list once so the UI starts using the fresh thumb URLs
      qc.invalidateQueries({ queryKey: ['admin-bikes'] })
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.bikes?.length])

  const deleteMut = useMutation({
    mutationFn: id => deleteBike(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-bikes'] })
      setConfirm(null)
    },
  })

  const bikes = data?.bikes || []

  return (
    <div className="space-y-4">
      <PageHeader title="Bikes" subtitle={`${bikes.length} total`}>
        <Button onClick={() => navigate('/admin/bikes/new')}>
          <Plus size={16} /> Add Bike
        </Button>
      </PageHeader>

      {flashSaved && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2.5 flex items-center gap-2">
          <CheckCircle size={16} /> Bike saved.
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search bikes…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : bikes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No bikes found. <button className="text-pink-600" onClick={() => navigate('/admin/bikes/new')}>Add one →</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Bike</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Material</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Price</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bikes.map(bike => (
                <tr
                  key={bike.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden bg-gray-100 flex-shrink-0">
                        {bike.primary_image_url ? (
                          <img
                            // Prefer the small thumb if backend has one; fall
                            // back to full image for legacy bikes uploaded
                            // before the thumbnail pipeline existed.
                            src={bike.primary_thumb_url || bike.primary_image_url}
                            alt={bike.name}
                            loading="lazy"
                            decoding="async"
                            fetchpriority="low"
                            width="48"
                            height="48"
                            className="w-full h-full object-cover"
                            // If the thumb URL 404s (e.g. backfill failed for
                            // this image, or thumb upload didn't land), swap
                            // to the full image so the row still renders.
                            onError={(e) => {
                              if (bike.primary_image_url && e.currentTarget.src !== bike.primary_image_url) {
                                e.currentTarget.src = bike.primary_image_url
                              }
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">No img</div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{bike.name}</div>
                        <div className="text-xs text-gray-400">{bike.category_name} · {bike.model_year || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{bike.material || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 hidden sm:table-cell">{fmt(bike.base_price)}</td>
                  <td className="px-4 py-3">
                    {bike.sold ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">SOLD</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Available</span>
                    )}
                    {bike.featured ? <Badge label="Featured" variant="pink" className="ml-1" /> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/bikes/${bike.id}/edit`)}>
                        <Edit size={14} />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setConfirm({ id: bike.id, name: bike.name })}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => deleteMut.mutate(confirm?.id)}
        loading={deleteMut.isPending}
        title="Delete Bike"
        message={`Are you sure you want to deactivate "${confirm?.name}"? It won't appear in the store.`}
      />
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { getBikes, deleteBike } from '../../api/admin'
import { PageHeader, Badge, Spinner, Button, ConfirmDialog } from '../../components/common'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

export default function Bikes() {
  const [search, setSearch]     = useState('')
  const [confirm, setConfirm]   = useState(null) // { id, name }
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bikes', search],
    queryFn:  () => getBikes(search ? { search } : {}),
  })

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
                <tr key={bike.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden bg-gray-100 flex-shrink-0">
                        {bike.primary_image_url ? (
                          <img src={bike.primary_image_url} alt={bike.name} className="w-full h-full object-cover" />
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

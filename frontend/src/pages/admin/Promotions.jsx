import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit } from 'lucide-react'
import { getPromotions, createPromotion, updatePromotion, deletePromotion } from '../../api/admin'
import { PageHeader, Badge, Button, Spinner, Modal, ConfirmDialog } from '../../components/common'

const fmt = n => `$${parseFloat(n || 0).toFixed(2)}`
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const empty = () => ({
  name: '', description: '', discount_type: 'percentage', discount_value: '',
  min_order_amount: '', applies_to: 'all', promo_code: '',
  start_date: '', end_date: '', is_active: true,
})

export default function Promotions() {
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState(null)  // promo object or null
  const [form,    setForm]    = useState(empty())
  const [confirm, setConfirm] = useState(null)
  const [error,   setError]   = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-promotions'],
    queryFn:  getPromotions,
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { ...form, discount_value: parseFloat(form.discount_value) }
      return editing ? updatePromotion(editing.id, payload) : createPromotion(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promotions'] })
      closeModal()
    },
    onError: err => setError(err.message),
  })

  const deleteMut = useMutation({
    mutationFn: id => deletePromotion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-promotions'] }); setConfirm(null) },
  })

  function openCreate() {
    setEditing(null); setForm(empty()); setError(''); setModal(true)
  }
  function openEdit(p) {
    setEditing(p)
    setForm({
      name: p.name, description: p.description || '', discount_type: p.discount_type,
      discount_value: p.discount_value, min_order_amount: p.min_order_amount || '',
      applies_to: p.applies_to, promo_code: p.promo_code || '',
      start_date: p.start_date?.slice(0, 16) || '',
      end_date:   p.end_date?.slice(0, 16) || '',
      is_active: p.is_active,
    })
    setError(''); setModal(true)
  }
  function closeModal() { setModal(false); setEditing(null) }

  const promos = data?.promotions || []

  const isActive = p => p.is_active && new Date(p.end_date) > new Date() && new Date(p.start_date) <= new Date()

  return (
    <div className="space-y-4">
      <PageHeader title="Promotions" subtitle={`${promos.length} total`}>
        <Button onClick={openCreate}><Plus size={16} /> New Promotion</Button>
      </PageHeader>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : promos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No promotions yet. <button className="text-pink-600" onClick={openCreate}>Create one →</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Promotion</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Discount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Period</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {promos.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.name}</div>
                    {p.promo_code && <div className="text-xs text-gray-400 font-mono">Code: {p.promo_code}</div>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-700">
                    {p.discount_type === 'percentage' ? `${p.discount_value}% off` : `${fmt(p.discount_value)} off`}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                    {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      status={isActive(p) ? 'active' : 'inactive'}
                      label={isActive(p) ? 'Active' : 'Inactive'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit size={14} /></Button>
                      <Button
                        size="sm" variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setConfirm({ id: p.id, name: p.name })}
                      ><Trash2 size={14} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal open={modal} onClose={closeModal} title={editing ? 'Edit Promotion' : 'New Promotion'} maxWidth="max-w-xl">
        <div className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Summer Sale 2025" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
              <select value={form.discount_type} onChange={e => setForm(f=>({...f,discount_type:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value *</label>
              <input type="number" min="0" step="0.01" value={form.discount_value}
                onChange={e => setForm(f=>({...f,discount_value:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="15" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Promo Code</label>
              <input value={form.promo_code} onChange={e => setForm(f=>({...f,promo_code:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="SUMMER25" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Order ($)</label>
              <input type="number" min="0" step="0.01" value={form.min_order_amount}
                onChange={e => setForm(f=>({...f,min_order_amount:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="datetime-local" value={form.start_date} onChange={e => setForm(f=>({...f,start_date:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
              <input type="datetime-local" value={form.end_date} onChange={e => setForm(f=>({...f,end_date:e.target.value}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f=>({...f,is_active:e.target.checked}))}
                  className="w-4 h-4 rounded accent-pink-600" />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
              {editing ? 'Save Changes' : 'Create Promotion'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)}
        onConfirm={() => deleteMut.mutate(confirm?.id)}
        loading={deleteMut.isPending}
        title="Delete Promotion"
        message={`Delete "${confirm?.name}"? This cannot be undone.`}
      />
    </div>
  )
}

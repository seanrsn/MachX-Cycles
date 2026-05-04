import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { getSettings, updateSettings } from '../../api/admin'
import { PageHeader, Button, Spinner } from '../../components/common'

const FIELDS = [
  { key: 'store_name',                label: 'Store Name',               type: 'text',   placeholder: 'MachX Cycles' },
  { key: 'contact_email',             label: 'Contact Email',            type: 'email',  placeholder: 'hello@machxcycles.com' },
  { key: 'contact_phone',             label: 'Contact Phone',            type: 'tel',    placeholder: '+1 (718) 555-0100' },
  { key: 'tax_rate',                  label: 'Tax Rate (%)',             type: 'number', placeholder: '8.875' },
  { key: 'reservation_fee_percentage',label: 'Reservation Fee (%)',      type: 'number', placeholder: '10' },
]

export default function Settings() {
  const qc = useQueryClient()
  const [form,    setForm]    = useState({})
  const [success, setSuccess] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn:  getSettings,
    onSuccess: d => setForm(d),
  })

  useEffect(() => { if (data) setForm(data) }, [data])

  const saveMut = useMutation({
    mutationFn: () => updateSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader title="Settings" subtitle="Store configuration" />

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {FIELDS.map(field => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
            <input
              type={field.type}
              value={form[field.key] || ''}
              onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Store Address</label>
          <textarea
            value={form.store_address || ''}
            onChange={e => setForm(f => ({ ...f, store_address: e.target.value }))}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-500"
            placeholder='{"street":"123 Main St","city":"Brooklyn","state":"NY","zip":"11201"}'
          />
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
            ✅ Settings saved successfully.
          </div>
        )}

        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
          <Save size={15} /> Save Settings
        </Button>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, AlertCircle, CheckCircle } from 'lucide-react'
import { LEAD_SOURCES, type LeadStatus } from '@/features/leads/types'
import { PROPERTY_TYPES } from '@/features/properties/types'

export default function NewLeadPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    source: 'web',
    budget_min: '',
    budget_max: '',
    preferred_location: '',
    preferred_type: '',
    notes: '',
    status: 'new' as LeadStatus,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, tenant_id')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Error loading profile:', profileError)
        setError('Error al cargar tu perfil. Intenta cerrar sesion y volver a entrar.')
        setLoading(false)
        return
      }

      if (!profile?.tenant_id) {
        setError('No se encontro tu inmobiliaria. Por favor contacta a soporte.')
        setLoading(false)
        return
      }

      setTenantId(profile.tenant_id)
    } catch (err) {
      console.error('Error:', err)
      setError('Error de conexion. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)

    if (!tenantId) {
      setError('No se encontro el tenant')
      setSaving(false)
      return
    }

    if (!form.first_name.trim()) {
      setError('El nombre es requerido')
      setSaving(false)
      return
    }

    if (!form.phone.trim()) {
      setError('El telefono es requerido')
      setSaving(false)
      return
    }

    const data = {
      tenant_id: tenantId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim(),
      source: form.source || null,
      budget_min: form.budget_min ? parseFloat(form.budget_min) : null,
      budget_max: form.budget_max ? parseFloat(form.budget_max) : null,
      preferred_location: form.preferred_location.trim() || null,
      preferred_type: form.preferred_type || null,
      notes: form.notes.trim() || null,
      status: form.status,
      created_by: user?.id,
    }

    const { data: result, error: insertError } = await supabase
      .from('leads')
      .insert(data)
      .select('id')
      .single()

    if (insertError) {
      console.error('Error inserting lead:', insertError)
      setError(insertError.message || 'Error al guardar el lead')
      setSaving(false)
      return
    }

    if (!result?.id) {
      setError('Error al crear el lead. Intenta nuevamente.')
      setSaving(false)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/leads')
      router.refresh()
    }, 1000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/leads" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft size={20} />
            </Link>
            <span className="text-slate-900 font-medium">Nuevo Lead</span>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="p-6 max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 flex items-center gap-2">
              <CheckCircle size={18} />
              <span>Lead guardado correctamente!</span>
            </div>
          )}

          {/* Basic Info */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Informacion de Contacto</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre *</label>
                <input
                  type="text"
                  required
                  value={form.first_name}
                  onChange={(e) => setForm({...form, first_name: e.target.value})}
                  placeholder="Juan"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Apellido</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({...form, last_name: e.target.value})}
                  placeholder="Garcia"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Telefono *</label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({...form, phone: e.target.value})}
                  placeholder="+34 600 000 000"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({...form, email: e.target.value})}
                  placeholder="juan@email.com"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Origen del Lead</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({...form, source: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {LEAD_SOURCES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({...form, status: e.target.value as LeadStatus})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="new">Nuevo</option>
                  <option value="contacted">Contactado</option>
                  <option value="qualified">Cualificado</option>
                  <option value="visit">Visita</option>
                  <option value="negotiation">Negociacion</option>
                </select>
              </div>
            </div>
          </div>

          {/* Budget & Preferences */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Presupuesto y Preferencias</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Presupuesto Min (EUR)</label>
                <input
                  type="number"
                  min="0"
                  value={form.budget_min}
                  onChange={(e) => setForm({...form, budget_min: e.target.value})}
                  placeholder="100000"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Presupuesto Max (EUR)</label>
                <input
                  type="number"
                  min="0"
                  value={form.budget_max}
                  onChange={(e) => setForm({...form, budget_max: e.target.value})}
                  placeholder="200000"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Zona Preferida</label>
                <input
                  type="text"
                  value={form.preferred_location}
                  onChange={(e) => setForm({...form, preferred_location: e.target.value})}
                  placeholder="Centro, Norte..."
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Propiedad</label>
                <select
                  value={form.preferred_type}
                  onChange={(e) => setForm({...form, preferred_type: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Seleccionar...</option>
                  {PROPERTY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Notas</h3>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              placeholder="Notas sobre el lead..."
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link
              href="/leads"
              className="px-6 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={18} />
              {saving ? 'Guardando...' : 'Guardar Lead'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

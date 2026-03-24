'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Edit, Trash2, Calendar, Clock, MapPin, Phone, Home, User, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, type Appointment } from '@/features/appointments/types'

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-700' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-700' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700' },
  no_show: { bg: 'bg-amber-100', text: 'text-amber-700' },
}

export default function AppointmentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [form, setForm] = useState({
    title: '',
    description: '',
    appointment_type: 'visit' as const,
    status: 'scheduled' as const,
    start_date: '',
    start_time: '',
    end_time: '',
    location: '',
    notes: '',
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

      if (profileError || !profile?.tenant_id) {
        setError('Error al cargar tu perfil.')
        setLoading(false)
        return
      }

      setTenantId(profile.tenant_id)

      const { data: apt, error: aptError } = await supabase
        .from('appointments')
        .select('*, leads(id, first_name, last_name, phone, email), properties(id, title)')
        .eq('id', params.id)
        .eq('tenant_id', profile.tenant_id)
        .single()

      if (aptError || !apt) {
        setError('Cita no encontrada.')
        setLoading(false)
        return
      }

      setAppointment(apt)

      const startDate = new Date(apt.start_time)
      const endDate = new Date(apt.end_time)

      setForm({
        title: apt.title || '',
        description: apt.description || '',
        appointment_type: apt.appointment_type,
        status: apt.status,
        start_date: startDate.toISOString().split('T')[0],
        start_time: startDate.toTimeString().slice(0, 5),
        end_time: endDate.toTimeString().slice(0, 5),
        location: apt.location || '',
        notes: apt.notes || '',
      })
    } catch (err) {
      console.error('Error:', err)
      setError('Error al cargar la cita.')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!appointment || !tenantId) return
    setSaving(true)

    const startTime = new Date(`${form.start_date}T${form.start_time}`)
    const endTime = form.end_time
      ? new Date(`${form.start_date}T${form.end_time}`)
      : new Date(startTime.getTime() + 60 * 60 * 1000)

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        title: form.title,
        description: form.description || null,
        appointment_type: form.appointment_type,
        status: form.status,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        location: form.location || null,
        notes: form.notes || null,
      })
      .eq('id', appointment.id)
      .eq('tenant_id', tenantId)

    setSaving(false)

    if (!updateError) {
      setEditing(false)
      loadData()
    }
  }

  const handleDelete = async () => {
    if (!appointment || !tenantId) return
    if (!confirm('¿Eliminar esta cita? No se puede deshacer.')) return

    setDeleting(true)

    const { error: deleteError } = await supabase
      .from('appointments')
      .delete()
      .eq('id', appointment.id)
      .eq('tenant_id', tenantId)

    setDeleting(false)

    if (!deleteError) {
      router.push('/appointments')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando...</div>
      </div>
    )
  }

  if (error || !appointment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Cita no encontrada</h2>
          <p className="text-slate-500 mb-4">{error}</p>
          <Link href="/appointments" className="text-blue-500 hover:underline">
            Volver a Citas
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/appointments" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft size={20} />
            </Link>
            <span className="text-slate-900 font-medium">Detalle de Cita</span>
          </div>
          <div className="flex gap-2">
            {!editing ? (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition"
                >
                  <Edit size={18} />
                  Editar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition disabled:opacity-50"
                >
                  <Trash2 size={18} />
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="p-6 max-w-3xl mx-auto">
        {editing ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Editar Cita</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Titulo</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
                  <select
                    value={form.appointment_type}
                    onChange={(e) => setForm({ ...form, appointment_type: e.target.value as any })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {APPOINTMENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {APPOINTMENT_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Fecha</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Hora inicio</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Hora fin</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ubicacion</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Direccion o enlace"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 mb-2">{appointment.title}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[appointment.status].bg} ${STATUS_COLORS[appointment.status].text}`}>
                    {APPOINTMENT_STATUSES.find(s => s.value === appointment.status)?.label}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calendar size={20} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Fecha</p>
                    <p className="font-medium text-slate-900 capitalize">{formatDate(appointment.start_time)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Clock size={20} className="text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Hora</p>
                    <p className="font-medium text-slate-900">
                      {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
                    </p>
                  </div>
                </div>

                {appointment.location && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <MapPin size={20} className="text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Ubicacion</p>
                      <p className="font-medium text-slate-900">{appointment.location}</p>
                    </div>
                  </div>
                )}

                {appointment.leads && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <User size={20} className="text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Lead</p>
                      <p className="font-medium text-slate-900">
                        {appointment.leads.first_name} {appointment.leads.last_name}
                      </p>
                      {appointment.leads.phone && (
                        <p className="text-sm text-slate-500">{appointment.leads.phone}</p>
                      )}
                    </div>
                  </div>
                )}

                {appointment.properties && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Home size={20} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Propiedad</p>
                      <p className="font-medium text-slate-900">{appointment.properties.title}</p>
                    </div>
                  </div>
                )}
              </div>

              {appointment.description && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-sm text-slate-500 mb-2">Descripcion</p>
                  <p className="text-slate-700">{appointment.description}</p>
                </div>
              )}

              {appointment.notes && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-sm text-slate-500 mb-2">Notas</p>
                  <p className="text-slate-700">{appointment.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

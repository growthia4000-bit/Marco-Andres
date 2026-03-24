'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, Calendar, Clock, MapPin, AlertCircle, CheckCircle, User } from 'lucide-react'
import { APPOINTMENT_TYPES, APPOINTMENT_STATUSES, type AppointmentType } from '@/features/appointments/types'

function NewAppointmentForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [leads, setLeads] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [appointments, setAppointments] = useState<any[]>([])

  const generateTimeSlots = () => {
    const slots = []
    for (let h = 8; h < 21; h++) {
      for (let m = 0; m < 60; m += 30) {
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    return slots
  }

  const getOccupiedSlots = (date: string) => {
    const dayAppointments = appointments.filter(a => {
      const aptDate = new Date(a.start_time)
      const targetDate = new Date(date)
      return aptDate.getDate() === targetDate.getDate() &&
        aptDate.getMonth() === targetDate.getMonth() &&
        aptDate.getFullYear() === targetDate.getFullYear()
    })
    
    const occupied = new Set<string>()
    dayAppointments.forEach(apt => {
      const start = new Date(apt.start_time)
      const end = new Date(apt.end_time)
      const startHour = start.getHours()
      const startMin = start.getMinutes()
      const endHour = end.getHours()
      const endMin = end.getMinutes()
      
      let currentHour = startHour
      let currentMin = startMin
      
      while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
        occupied.add(`${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`)
        currentMin += 30
        if (currentMin >= 60) {
          currentHour += 1
          currentMin = 0
        }
      }
    })
    
    return occupied
  }

  const prefillLeadId = searchParams.get('lead_id')
  const prefillLeadName = searchParams.get('lead_name')
  const prefillLeadPhone = searchParams.get('lead_phone')
  const prefillDate = searchParams.get('date')
  const prefillTime = searchParams.get('time')

  const [form, setForm] = useState({
    title: prefillLeadName ? `Cita con ${prefillLeadName}` : '',
    description: '',
    appointment_type: 'visit' as AppointmentType,
    status: 'scheduled' as const,
    start_date: prefillDate || new Date().toISOString().split('T')[0],
    start_time: prefillTime || '',
    end_time: prefillTime ? `${String(parseInt(prefillTime.split(':')[0]) + 1).padStart(2, '0')}:${prefillTime.split(':')[1]}` : '',
    location: '',
    lead_id: prefillLeadId || '',
    property_id: '',
    notes: prefillLeadPhone ? `Tel: ${prefillLeadPhone}` : '',
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

      const [leadsData, propsData, appointmentsData] = await Promise.all([
        supabase
          .from('leads')
          .select('id, first_name, last_name')
          .eq('tenant_id', profile.tenant_id)
          .order('first_name'),
        supabase
          .from('properties')
          .select('id, title')
          .eq('tenant_id', profile.tenant_id)
          .eq('status', 'active')
          .order('title'),
        supabase
          .from('appointments')
          .select('*')
          .eq('tenant_id', profile.tenant_id),
      ])

      setLeads(leadsData.data || [])
      setProperties(propsData.data || [])
      setAppointments(appointmentsData.data || [])
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

    if (!form.title.trim()) {
      setError('El titulo es requerido')
      setSaving(false)
      return
    }

    if (!form.start_date || !form.start_time) {
      setError('La fecha y hora son requeridas')
      setSaving(false)
      return
    }

    const startTime = new Date(`${form.start_date}T${form.start_time}`)
    if (isNaN(startTime.getTime())) {
      setError('Fecha u hora invalida')
      setSaving(false)
      return
    }

    const endTime = form.end_time 
      ? new Date(`${form.start_date}T${form.end_time}`)
      : new Date(startTime.getTime() + 60 * 60 * 1000)

    if (isNaN(endTime.getTime())) {
      setError('Hora de fin invalida')
      setSaving(false)
      return
    }

    const data = {
      tenant_id: tenantId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      appointment_type: form.appointment_type,
      status: form.status,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      location: form.location.trim() || null,
      lead_id: form.lead_id || null,
      property_id: form.property_id || null,
      notes: form.notes.trim() || null,
      user_id: user?.id,
    }

    const { data: result, error: insertError } = await supabase
      .from('appointments')
      .insert(data)
      .select('id')
      .single()

    if (insertError) {
      console.error('Error inserting appointment:', insertError)
      setError(insertError.message || 'Error al guardar la cita')
      setSaving(false)
      return
    }

    if (!result?.id) {
      setError('Error al crear la cita. Intenta nuevamente.')
      setSaving(false)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/appointments')
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
            <Link href="/appointments" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft size={20} />
            </Link>
            <span className="text-slate-900 font-medium">Nueva Cita</span>
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
              <span>Cita guardada correctamente!</span>
            </div>
          )}

          {/* Basic Info */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Informacion de la Cita</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Titulo *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({...form, title: e.target.value})}
                  placeholder="Ej: Visita con Juan Garcia"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Cita</label>
                <select
                  value={form.appointment_type}
                  onChange={(e) => setForm({...form, appointment_type: e.target.value as AppointmentType})}
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
                  onChange={(e) => setForm({...form, status: e.target.value as any})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {APPOINTMENT_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Descripcion</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({...form, description: e.target.value})}
                  placeholder="Detalles de la cita..."
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
            </div>
          </div>

          {/* Date & Time */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Fecha y Hora</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({...form, start_date: e.target.value})}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-2">Hora Inicio *</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                  <select
                    value={form.start_time}
                    onChange={(e) => {
                      const slot = e.target.value
                      if (slot) {
                        const [h, m] = slot.split(':')
                        const endHour = parseInt(h) + 1
                        setForm({
                          ...form,
                          start_time: slot,
                          end_time: `${String(endHour).padStart(2, '0')}:${m}`
                        })
                      } else {
                        setForm({...form, start_time: slot})
                      }
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
                  >
                    <option value="">Seleccionar hora...</option>
                    {generateTimeSlots().map(slot => {
                      const occupied = getOccupiedSlots(form.start_date).has(slot)
                      const hour = parseInt(slot.split(':')[0])
                      const isPast = form.start_date === new Date().toISOString().split('T')[0] && 
                        (hour < new Date().getHours() || (hour === new Date().getHours() && parseInt(slot.split(':')[1]) <= new Date().getMinutes()))
                      return (
                        <option key={slot} value={slot} disabled={occupied || isPast} className={occupied ? 'text-slate-400' : isPast ? 'text-slate-300' : ''}>
                          {slot} {occupied ? '(ocupado)' : isPast ? '(pasado)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Hora Fin</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({...form, end_time: e.target.value})}
                    placeholder="Opcional"
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Related */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Relacionado con</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Lead</label>
                <select
                  value={form.lead_id}
                  onChange={(e) => setForm({...form, lead_id: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Seleccionar lead...</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>{l.first_name} {l.last_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Propiedad</label>
                <select
                  value={form.property_id}
                  onChange={(e) => setForm({...form, property_id: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Seleccionar propiedad...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Ubicacion</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({...form, location: e.target.value})}
                    placeholder="Direccion o enlace de videollamada"
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              placeholder="Notas adicionales..."
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link
              href="/appointments"
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
              {saving ? 'Guardando...' : 'Guardar Cita'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando...</div>
      </div>
    }>
      <NewAppointmentForm />
    </Suspense>
  )
}

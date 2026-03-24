'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Calendar, Clock, MapPin, Phone, Home, User, ChevronLeft, ChevronRight, Trash2, AlertCircle, ExternalLink, X } from 'lucide-react'
import { APPOINTMENT_STATUSES, type Appointment } from '@/features/appointments/types'

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  no_show: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistio',
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  const generateTimeSlots = () => {
    const slots = []
    for (let h = 8; h < 21; h++) {
      for (let m = 0; m < 60; m += 30) {
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    return slots
  }

  const getOccupiedSlots = (date: Date | null) => {
    if (!date) return new Set<string>()
    
    const dayAppointments = appointments.filter(a => {
      const aptDate = new Date(a.start_time)
      return aptDate.getDate() === date.getDate() &&
        aptDate.getMonth() === date.getMonth() &&
        aptDate.getFullYear() === date.getFullYear()
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

  const handleCreateAppointment = (date: Date) => {
    setSelectedDate(date)
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    router.push(`/appointments/new?date=${dateString}`)
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
  }

  const handleTimeSlotClick = (slot: string) => {
    if (!selectedDate) return
    const dateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    router.push(`/appointments/new?date=${dateString}&time=${slot}`)
  }

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

      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0)

      const { data, error: appointmentsError } = await supabase
        .from('appointments')
        .select('*, leads(id, first_name, last_name, phone), properties(id, title)')
        .eq('tenant_id', profile.tenant_id)
        .gte('start_time', startOfMonth.toISOString())
        .lte('start_time', endOfMonth.toISOString())
        .order('start_time', { ascending: true })

      if (appointmentsError) {
        setError('Error al cargar citas.')
        setLoading(false)
        return
      }

      setAppointments(data || [])
    } catch (err) {
      setError('Error de conexion.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [currentDate])

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta cita?')) return
    
    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user?.id)
      .single()
    
    if (!profile?.tenant_id) return
    
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
    
    if (!error) loadData()
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: Date[] = []
    
    const startPadding = firstDay.getDay()
    for (let i = startPadding - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i))
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }
    
    const endPadding = 42 - days.length
    for (let i = 1; i <= endPadding; i++) {
      days.push(new Date(year, month + 1, i))
    }
    
    return days
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
  }

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth()
  }

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter(a => {
      const aptDate = new Date(a.start_time)
      return aptDate.getDate() === date.getDate() &&
        aptDate.getMonth() === date.getMonth() &&
        aptDate.getFullYear() === date.getFullYear()
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }

  const calendarDays = getDaysInMonth(currentDate)
  const selectedDateAppointments = selectedDate ? getAppointmentsForDate(selectedDate) : []

  const stats = {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'scheduled').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    completed: appointments.filter(a => a.status === 'completed').length,
    today: appointments.filter(a => {
      const aptDate = new Date(a.start_time)
      const today = new Date()
      return aptDate.getDate() === today.getDate() &&
        aptDate.getMonth() === today.getMonth() &&
        aptDate.getFullYear() === today.getFullYear()
    }).length,
  }

  const getDateString = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
            <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">
              Dashboard
            </Link>
            <span className="text-slate-400">/</span>
            <span className="text-slate-900 font-medium">Citas</span>
          </div>
          <Link 
            href="/appointments/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
          >
            <Plus size={18} />
            Nueva Cita
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Total Mes</p>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Hoy</p>
            <p className="text-2xl font-bold text-blue-600">{stats.today}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Programadas</p>
            <p className="text-2xl font-bold text-slate-900">{stats.scheduled}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Confirmadas</p>
            <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Completadas</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.completed}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-900 capitalize">
                {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={goToToday}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition font-medium"
                >
                  Hoy
                </button>
                <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition">
                  <ChevronLeft size={20} className="text-slate-600" />
                </button>
                <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition">
                  <ChevronRight size={20} className="text-slate-600" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map(d => (
                <div key={d} className="text-center text-sm font-semibold text-slate-500 py-2">{d}</div>
              ))}
              {calendarDays.map((date, i) => {
                const dayAppointments = getAppointmentsForDate(date)
                const isSelected = selectedDate && 
                  date.getDate() === selectedDate.getDate() &&
                  date.getMonth() === selectedDate.getMonth() &&
                  date.getFullYear() === selectedDate.getFullYear()
                
                return (
                  <button
                    key={i}
                    onClick={() => handleDateClick(date)}
                    onDoubleClick={() => handleCreateAppointment(date)}
                    className={`min-h-28 border rounded-lg p-2 text-left transition relative ${
                      isToday(date) ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 
                      isSelected ? 'border-blue-400 bg-blue-50' :
                      isCurrentMonth(date) ? 'border-slate-200 hover:border-slate-300 hover:bg-slate-50' : 'border-slate-100 bg-slate-50'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${
                      isToday(date) ? 'text-blue-600' : 
                      isCurrentMonth(date) ? 'text-slate-700' : 'text-slate-400'
                    }`}>
                      {date.getDate()}
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {dayAppointments.slice(0, 3).map(apt => (
                        <div
                          key={apt.id}
                          className={`text-xs px-1 py-0.5 rounded truncate ${STATUS_COLORS[apt.status]?.bg || 'bg-slate-100'} ${STATUS_COLORS[apt.status]?.text || 'text-slate-700'}`}
                        >
                          {formatTime(apt.start_time)} {apt.title}
                        </div>
                      ))}
                      {dayAppointments.length > 3 && (
                        <p className="text-xs text-slate-500 font-medium">+{dayAppointments.length - 3}</p>
                      )}
                    </div>
                    {dayAppointments.length === 0 && isCurrentMonth(date) && (
                      <div className="absolute bottom-1 right-1">
                        <Plus size={12} className="text-slate-300" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

            {/* Appointments Detail */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedDate 
                  ? `${selectedDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}`
                  : 'Citas'}
              </h2>
            </div>
            
            {/* Time Slots - visible list */}
            {selectedDate && (
              <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-sm font-medium text-slate-600 mb-2">Horarios disponibles:</p>
                <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto">
                  {generateTimeSlots().map(slot => {
                    const occupied = getOccupiedSlots(selectedDate).has(slot)
                    const hour = parseInt(slot.split(':')[0])
                    const isPast = selectedDate.toDateString() === new Date().toDateString() && 
                      (hour < new Date().getHours() || (hour === new Date().getHours() && parseInt(slot.split(':')[1]) <= new Date().getMinutes()))
                    
                    return (
                      <button
                        key={slot}
                        disabled={occupied || isPast}
                        onClick={() => handleTimeSlotClick(slot)}
                        className={`p-2 rounded-lg text-xs font-medium transition ${
                          occupied 
                            ? 'bg-red-100 text-red-400 cursor-not-allowed line-through' 
                            : isPast
                            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800'
                        }`}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-100 rounded"></span> Libre
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-100 rounded"></span> Ocupado
                  </span>
                </div>
              </div>
            )}
            
            {selectedDateAppointments.length === 0 ? (
              <div className="text-center py-8 flex-1 flex flex-col items-center justify-center">
                <Calendar className="mx-auto text-slate-300 mb-3" size={40} />
                <p className="text-slate-500 text-sm mb-2">No hay citas</p>
                {selectedDate && (
                  <p className="text-slate-400 text-xs">
                    {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto flex-1">
                <p className="text-sm text-slate-500 font-medium">
                  {selectedDateAppointments.length} cita{selectedDateAppointments.length > 1 ? 's' : ''} en este dia
                </p>
                {selectedDateAppointments.map(apt => (
                  <div key={apt.id} className="p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${STATUS_COLORS[apt.status]?.dot || 'bg-slate-400'}`} />
                        <span className="font-semibold text-slate-900">{apt.title}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[apt.status]?.bg || 'bg-slate-100'} ${STATUS_COLORS[apt.status]?.text || 'text-slate-700'}`}>
                        {STATUS_LABELS[apt.status] || apt.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                        {apt.appointment_type === 'visit' ? 'Visita' : 
                         apt.appointment_type === 'meeting' ? 'Reunion' :
                         apt.appointment_type === 'call' ? 'Llamada' :
                         apt.appointment_type === 'video_call' ? 'Videollamada' : 'Inspeccion'}
                      </span>
                    </div>
                    
                    {apt.leads && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-sm">
                          <User size={14} className="text-slate-400" />
                          <span className="text-slate-700">{apt.leads.first_name} {apt.leads.last_name}</span>
                          {apt.leads.phone && (
                            <a href={`tel:${apt.leads.phone}`} className="text-blue-500 hover:text-blue-600 ml-2">
                              <Phone size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {apt.properties && (
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <Home size={14} className="text-slate-400" />
                        <span className="text-slate-600">{apt.properties.title}</span>
                      </div>
                    )}
                    
                    {apt.location && (
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <MapPin size={14} className="text-slate-400" />
                        <span className="text-slate-500 truncate">{apt.location}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-slate-100">
                      <Link
                        href={`/appointments/${apt.id}`}
                        className="px-3 py-1 text-sm text-blue-500 hover:bg-blue-50 rounded-lg transition"
                      >
                        Ver Detalle
                      </Link>
                      <button
                        onClick={() => handleDelete(apt.id)}
                        className="px-3 py-1 text-sm text-red-500 hover:bg-red-50 rounded-lg transition"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

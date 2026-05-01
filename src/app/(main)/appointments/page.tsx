'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Calendar, Clock, MapPin, Phone, Home, User, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { type Appointment, type AppointmentStatus } from '@/features/appointments/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getAppointmentStatusLabel } from '@/i18n/pageLabels'
import { getOccupiedSlotTimesForDate, isAppointmentOnDate } from '@/features/conversations/scheduling-engine'

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  no_show: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
}

const KPI_STYLES = [
  {
    shell: 'border-slate-200 bg-white',
    iconShell: 'bg-slate-900 text-white',
    valueTone: 'text-slate-900',
  },
  {
    shell: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white',
    iconShell: 'bg-blue-500 text-white',
    valueTone: 'text-blue-700',
  },
  {
    shell: 'border-sky-200 bg-gradient-to-br from-sky-50 to-white',
    iconShell: 'bg-sky-500 text-white',
    valueTone: 'text-sky-700',
  },
  {
    shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
    iconShell: 'bg-emerald-500 text-white',
    valueTone: 'text-emerald-700',
  },
  {
    shell: 'border-teal-200 bg-gradient-to-br from-teal-50 to-white',
    iconShell: 'bg-teal-500 text-white',
    valueTone: 'text-teal-700',
  },
] as const

export default function AppointmentsPage() {
  const [activeQuickFilter, setActiveQuickFilter] = useState<'today' | AppointmentStatus | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()
  const { t, formatTime, formatDate } = useI18n()

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

    return getOccupiedSlotTimesForDate(appointments, date).occupied
  }

  const handleCreateAppointment = (date: Date) => {
    setSelectedDate(date)
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    router.push(`/appointments/new?date=${dateString}`)
  }

  const handleDateClick = (date: Date) => {
    if (activeQuickFilter === 'today') setActiveQuickFilter(null)
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
        setError(t('appointmentsPage.errors.profile'))
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
        setError(t('appointmentsPage.errors.load'))
        setLoading(false)
        return
      }

      setAppointments(data || [])
    } catch (err) {
      setError(t('appointmentsPage.errors.connection'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [currentDate])

  const handleDelete = async (id: string) => {
    if (!confirm(t('appointmentsPage.deleteConfirm'))) return
    
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
    if (activeQuickFilter === 'today') setActiveQuickFilter(null)
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    if (activeQuickFilter === 'today') setActiveQuickFilter(null)
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  const getAppointmentsForDate = (date: Date, sourceAppointments = appointments) => {
    return sourceAppointments.filter(a => {
      return isAppointmentOnDate(a, date)
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }

  const handleQuickFilter = (filter: 'total' | 'today' | AppointmentStatus) => {
    if (filter === 'total') {
      setActiveQuickFilter(null)
      return
    }

    if (filter === 'today') {
      setActiveQuickFilter('today')
      goToToday()
      return
    }

    setActiveQuickFilter((current) => current === filter ? null : filter)
  }

  const visibleAppointments = activeQuickFilter === 'scheduled' || activeQuickFilter === 'confirmed' || activeQuickFilter === 'completed'
    ? appointments.filter((appointment) => appointment.status === activeQuickFilter)
    : appointments

  const calendarDays = getDaysInMonth(currentDate)
  const selectedDateAppointments = selectedDate ? getAppointmentsForDate(selectedDate, visibleAppointments) : []

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

  const formatDisplayDate = (date: Date, options: Intl.DateTimeFormatOptions) => {
    const formatted = formatDate(date, options)
    return formatted ? formatted.charAt(0).toUpperCase() + formatted.slice(1) : formatted
  }

  const statCards = [
    { key: 'total' as const, label: t('appointmentsPage.totalMonth'), value: stats.total, icon: Calendar },
    { key: 'today' as const, label: t('appointmentsPage.today'), value: stats.today, icon: Clock },
    { key: 'scheduled' as const, label: t('appointmentsPage.scheduled'), value: stats.scheduled, icon: Calendar },
    { key: 'confirmed' as const, label: t('appointmentsPage.confirmed'), value: stats.confirmed, icon: User },
    { key: 'completed' as const, label: t('appointmentsPage.completed'), value: stats.completed, icon: Home },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <section className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_40%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                    {t('dashboard.title')}
                  </Link>
                  <span className="text-slate-300">/</span>
                  <span className="font-medium text-slate-900">{t('appointmentsPage.title')}</span>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('appointmentsPage.title')}</h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('appointmentsPage.subtitle')}</p>
                </div>
              </div>
              <Link
                href="/appointments/new"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"
              >
                <Plus size={18} />
                {t('appointmentsPage.new')}
              </Link>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {statCards.map((card, index) => {
            const Icon = card.icon
            const style = KPI_STYLES[index]
            const isActive = activeQuickFilter === card.key
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => handleQuickFilter(card.key)}
                aria-pressed={isActive}
                className={`rounded-3xl border p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${style.shell} ${isActive ? 'border-slate-300 ring-2 ring-slate-300' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-500">{card.label}</p>
                    <p className={`text-3xl font-semibold tracking-tight ${style.valueTone}`}>{card.value}</p>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm ${style.iconShell}`}>
                    <Icon size={18} />
                  </div>
                </div>
              </button>
            )
          })}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('appointmentsPage.calendarTitle')}</p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {formatDisplayDate(currentDate, { month: 'long', year: 'numeric' })}
                </h2>
                <p className="max-w-2xl text-sm text-slate-500">{t('appointmentsPage.calendarSubtitle')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2">
                <button
                  onClick={goToToday}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
                >
                  {t('appointmentsPage.today')}
                </button>
                <button onClick={prevMonth} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100">
                  <ChevronLeft size={18} />
                </button>
                <button onClick={nextMonth} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-sm">
                  {t(`appointmentsPage.weekdays.${d}`)}
                </div>
              ))}
              {calendarDays.map((date, i) => {
                const dayAppointments = getAppointmentsForDate(date, visibleAppointments)
                const isSelected = selectedDate
                  && date.getDate() === selectedDate.getDate()
                  && date.getMonth() === selectedDate.getMonth()
                  && date.getFullYear() === selectedDate.getFullYear()

                return (
                  <button
                    key={i}
                    onClick={() => handleDateClick(date)}
                    onDoubleClick={() => handleCreateAppointment(date)}
                    className={`relative min-h-[8.75rem] rounded-2xl border p-3 text-left transition sm:min-h-[9.5rem] ${
                      isToday(date)
                        ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-100'
                        : isSelected
                          ? 'border-slate-300 bg-slate-50 shadow-sm'
                          : isCurrentMonth(date)
                            ? 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50'
                            : 'border-slate-100 bg-slate-50/80 hover:border-slate-200'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                        isToday(date)
                          ? 'bg-blue-600 text-white'
                          : isSelected
                            ? 'bg-slate-900 text-white'
                            : isCurrentMonth(date)
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-white text-slate-400'
                      }`}>
                        {date.getDate()}
                      </span>
                      {dayAppointments.length > 0 ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                          {dayAppointments.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      {dayAppointments.slice(0, 2).map((apt) => (
                        <div
                          key={apt.id}
                          className={`overflow-hidden rounded-xl px-2 py-1.5 text-[11px] shadow-sm ${STATUS_COLORS[apt.status]?.bg || 'bg-slate-100'} ${STATUS_COLORS[apt.status]?.text || 'text-slate-700'}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-white/70 px-1.5 py-0.5 font-semibold">
                              {formatTime(apt.start_time)}
                            </span>
                            <span className="truncate font-medium">{apt.title}</span>
                          </div>
                        </div>
                      ))}
                      {dayAppointments.length > 2 ? (
                        <p className="px-1 text-[11px] font-medium text-slate-500">+{dayAppointments.length - 2}</p>
                      ) : null}
                    </div>

                    {dayAppointments.length === 0 && isCurrentMonth(date) ? (
                      <div className="absolute bottom-3 right-3 rounded-full bg-slate-100 p-1 text-slate-300">
                        <Plus size={12} />
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>

          <aside className="xl:col-span-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('appointmentsPage.dayPanelTitle')}</p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {selectedDate
                    ? formatDisplayDate(selectedDate, { weekday: 'short', day: 'numeric', month: 'short' })
                    : t('appointmentsPage.title')}
                </h2>
              </div>
              {selectedDate ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                  {selectedDateAppointments.length}
                </span>
              ) : null}
            </div>

            {selectedDate && (
              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{t('appointmentsPage.availableSlots')}</p>
                    <p className="text-xs text-slate-500">{formatDisplayDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  </div>
                </div>
                <div className="grid max-h-40 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                  {generateTimeSlots().map((slot) => {
                    const occupied = getOccupiedSlots(selectedDate).has(slot)
                    const hour = parseInt(slot.split(':')[0])
                    const isPast = selectedDate.toDateString() === new Date().toDateString()
                      && (hour < new Date().getHours() || (hour === new Date().getHours() && parseInt(slot.split(':')[1]) <= new Date().getMinutes()))

                    return (
                      <button
                        key={slot}
                        disabled={occupied || isPast}
                        onClick={() => handleTimeSlotClick(slot)}
                        className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
                          occupied
                            ? 'cursor-not-allowed bg-red-100 text-red-400 line-through'
                            : isPast
                              ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800'
                        }`}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-blue-100"></span>
                    {t('appointmentsPage.free')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-red-100"></span>
                    {t('appointmentsPage.occupied')}
                  </span>
                </div>
              </div>
            )}

            {selectedDateAppointments.length === 0 ? (
              <div className="flex min-h-[22rem] flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
                  <Calendar className="text-slate-300" size={28} />
                </div>
                <p className="text-base font-semibold text-slate-900">{t('appointmentsPage.dayPanelEmptyTitle')}</p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">{t('appointmentsPage.dayPanelEmptyDescription')}</p>
                {selectedDate ? (
                  <p className="mt-3 text-xs font-medium text-slate-400">
                    {formatDisplayDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex max-h-[44rem] flex-1 flex-col overflow-hidden">
                <p className="mb-3 text-sm font-medium text-slate-500">
                  {t('appointmentsPage.appointmentsInDay', { count: selectedDateAppointments.length, suffix: selectedDateAppointments.length > 1 ? 's' : '' })}
                </p>
                <div className="space-y-3 overflow-y-auto pr-1">
                  {selectedDateAppointments.map((apt) => (
                    <div key={apt.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[apt.status]?.dot || 'bg-slate-400'}`} />
                            <p className="truncate font-semibold text-slate-900">{apt.title}</p>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                              <Clock size={13} />
                              {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                              {apt.appointment_type === 'visit'
                                ? t('appointmentsPage.types.visit')
                                : apt.appointment_type === 'meeting'
                                  ? t('appointmentsPage.types.meeting')
                                  : apt.appointment_type === 'call'
                                    ? t('appointmentsPage.types.call')
                                    : apt.appointment_type === 'video_call'
                                      ? t('appointmentsPage.types.video_call')
                                      : t('appointmentsPage.types.inspection')}
                            </span>
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[apt.status]?.bg || 'bg-slate-100'} ${STATUS_COLORS[apt.status]?.text || 'text-slate-700'}`}>
                          {getAppointmentStatusLabel(t, apt.status)}
                        </span>
                      </div>

                      <div className="space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                        {apt.leads && (
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-slate-400" />
                            <span className="truncate text-slate-700">{apt.leads.first_name} {apt.leads.last_name}</span>
                            {apt.leads.phone ? (
                              <a href={`tel:${apt.leads.phone}`} className="ml-auto rounded-full p-1 text-blue-500 transition hover:bg-blue-50 hover:text-blue-600">
                                <Phone size={14} />
                              </a>
                            ) : null}
                          </div>
                        )}

                        {apt.properties && (
                          <div className="flex items-center gap-2">
                            <Home size={14} className="text-slate-400" />
                            <span className="truncate">{apt.properties.title}</span>
                          </div>
                        )}

                        {apt.location && (
                          <div className="flex items-center gap-2">
                            <MapPin size={14} className="text-slate-400" />
                            <span className="truncate text-slate-500">{apt.location}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                        <Link
                          href={`/appointments/${apt.id}`}
                          className="rounded-xl px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50"
                        >
                          {t('appointmentsPage.viewDetail')}
                        </Link>
                        <button
                          onClick={() => handleDelete(apt.id)}
                          className="rounded-xl px-3 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50"
                        >
                          {t('appointmentsPage.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  )
}

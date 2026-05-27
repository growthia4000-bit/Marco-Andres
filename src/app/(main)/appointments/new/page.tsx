'use client'

import { type ReactNode, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronLeft,
  Clock,
  Home,
  MapPin,
  Save,
  User,
} from 'lucide-react'
import { APPOINTMENT_TYPES, APPOINTMENT_STATUSES, type AppointmentType } from '@/features/appointments/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getAppointmentStatusLabel, getAppointmentTypeLabel } from '@/i18n/pageLabels'
import { createAppointmentAction } from '../actions'
import { buildSlotFromDateAndTime } from '@/features/conversations/scheduling-engine'

const inputClassName = 'w-full rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-700 outline-none transition focus:bg-white focus:ring-2'

function NewAppointmentForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { t } = useI18n()

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
    const dayAppointments = appointments.filter((appointment) => {
      const aptDate = new Date(appointment.start_time)
      const targetDate = new Date(date)
      return aptDate.getDate() === targetDate.getDate()
        && aptDate.getMonth() === targetDate.getMonth()
        && aptDate.getFullYear() === targetDate.getFullYear()
    })

    const occupied = new Set<string>()
    dayAppointments.forEach((appointment) => {
      const start = new Date(appointment.start_time)
      const end = new Date(appointment.end_time)
      let currentHour = start.getHours()
      let currentMin = start.getMinutes()
      const endHour = end.getHours()
      const endMin = end.getMinutes()

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
  const appointmentTitle = prefillLeadName ? t('appointmentForm.prefillTitle', { name: prefillLeadName }) : t('appointmentsPage.new')

  const [form, setForm] = useState({
    title: prefillLeadName ? t('appointmentForm.prefillTitle', { name: prefillLeadName }) : '',
    description: '',
    appointment_type: 'visit' as AppointmentType,
    status: 'scheduled' as const,
    start_date: prefillDate || new Date().toISOString().split('T')[0],
    start_time: prefillTime || '',
    end_time: prefillTime ? `${String(parseInt(prefillTime.split(':')[0], 10) + 1).padStart(2, '0')}:${prefillTime.split(':')[1]}` : '',
    location: '',
    lead_id: prefillLeadId || '',
    property_id: '',
    notes: prefillLeadPhone ? t('appointmentForm.prefillPhone', { phone: prefillLeadPhone }) : '',
  })

  const selectedLead = leads.find((lead) => lead.id === form.lead_id) || null

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
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
        setError(t('appointmentsPage.errors.profile'))
        setLoading(false)
        return
      }

      if (!profile?.tenant_id) {
        setError(t('appointmentForm.errors.tenant'))
        setLoading(false)
        return
      }

      setTenantId(profile.tenant_id)

      const [leadsData, propsData, appointmentsData] = await Promise.all([
        supabase
          .from('leads')
          .select('id, first_name, last_name, phone')
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
      setError(t('appointmentsPage.errors.connection'))
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
      setError(t('appointmentForm.errors.tenant'))
      setSaving(false)
      return
    }

    if (!form.title.trim()) {
      setError(t('appointmentForm.errors.titleRequired'))
      setSaving(false)
      return
    }

    if (!form.start_date || !form.start_time) {
      setError(t('appointmentForm.errors.dateTimeRequired'))
      setSaving(false)
      return
    }

    const [startHour, startMinute] = form.start_time.split(':').map(Number)
    if (!Number.isFinite(startHour) || !Number.isFinite(startMinute)) {
      setError(t('appointmentForm.errors.invalidDateTime'))
      setSaving(false)
      return
    }

    const [endHour, endMinute] = (form.end_time || '').split(':').map(Number)
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = form.end_time ? endHour * 60 + endMinute : startMinutes + 60

    if (form.end_time && (!Number.isFinite(endHour) || !Number.isFinite(endMinute))) {
      setError(t('appointmentForm.errors.invalidEndTime'))
      setSaving(false)
      return
    }

    if (endMinutes <= startMinutes) {
      setError(t('appointmentForm.errors.invalidEndTime'))
      setSaving(false)
      return
    }

    const slot = buildSlotFromDateAndTime(new Date(`${form.start_date}T12:00:00Z`), form.start_time, endMinutes - startMinutes)
    if (!slot) {
      setError(t('appointmentForm.errors.invalidDateTime'))
      setSaving(false)
      return
    }

    const data = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      appointment_type: form.appointment_type,
      status: form.status,
      start_time: slot.start,
      end_time: slot.end,
      location: form.location.trim() || null,
      lead_id: form.lead_id || null,
      property_id: form.property_id || null,
      notes: form.notes.trim() || null,
    }

    try {
      const result = await createAppointmentAction(data)
      if (!result?.id) {
        setError(t('appointmentForm.errors.create'))
        setSaving(false)
        return
      }
    } catch (err) {
      console.error('Error inserting appointment:', err)
      setError(err instanceof Error ? err.message : t('appointmentForm.errors.save'))
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
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <section className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_40%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                    <Home size={14} />
                    {t('dashboard.title')}
                  </Link>
                  <span className="text-slate-300">/</span>
                  <Link href="/appointments" className="font-medium text-slate-600 transition hover:text-slate-900">{t('appointmentsPage.title')}</Link>
                  {prefillLeadId && prefillLeadName ? (
                    <>
                      <span className="text-slate-300">/</span>
                      <Link href={`/leads/${prefillLeadId}`} className="font-medium text-slate-600 transition hover:text-slate-900">{prefillLeadName}</Link>
                    </>
                  ) : null}
                  <span className="text-slate-300">/</span>
                  <span className="font-medium text-slate-900">{appointmentTitle}</span>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-sky-500 via-cyan-400 to-blue-300 text-white shadow-lg shadow-sky-400/15">
                    <Calendar size={24} />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{appointmentTitle}</h1>
                    <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('appointmentForm.subtitle')}</p>
                  </div>
                </div>

                {prefillLeadName ? (
                  <div className="flex flex-wrap gap-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800">
                      <User size={13} />
                      {prefillLeadName}
                    </span>
                    {prefillLeadPhone ? (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-700">
                        {t('appointmentForm.prefillPhone', { phone: prefillLeadPhone })}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <Link href="/appointments" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                <ChevronLeft size={18} />
                {t('appointmentForm.backToAppointments')}
              </Link>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600 flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-green-600 flex items-center gap-2">
              <CheckCircle size={18} />
              <span>{t('appointmentForm.success')}</span>
            </div>
          ) : null}

          <SectionCard icon={<Calendar size={18} />} title={t('appointmentForm.infoTitle')} tone="blue">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('appointmentForm.title')} className="md:col-span-2">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={t('appointmentForm.titlePlaceholder')}
                  className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}
                />
              </Field>
              <Field label={t('appointmentForm.type')}>
                <select
                  value={form.appointment_type}
                  onChange={(e) => setForm({ ...form, appointment_type: e.target.value as AppointmentType })}
                  className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}
                >
                  {APPOINTMENT_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>{getAppointmentTypeLabel(t, item.value)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('appointmentForm.status')}>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
                  className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}
                >
                  {APPOINTMENT_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>{getAppointmentStatusLabel(t, item.value)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('appointmentForm.description')} className="md:col-span-2">
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t('appointmentForm.descriptionPlaceholder')}
                  className={`${inputClassName} resize-none border-blue-100 focus:border-blue-400 focus:ring-blue-100`}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={<Clock size={18} />} title={t('appointmentForm.dateTime')} tone="emerald">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label={t('appointmentForm.date')}>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className={`${inputClassName} pl-11 border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`}
                  />
                </div>
              </Field>
              <Field label={t('appointmentForm.startTime')}>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
                  <select
                    value={form.start_time}
                    onChange={(e) => {
                      const slot = e.target.value
                      if (slot) {
                        const [h, m] = slot.split(':')
                        const endHour = parseInt(h, 10) + 1
                        setForm({
                          ...form,
                          start_time: slot,
                          end_time: `${String(endHour).padStart(2, '0')}:${m}`,
                        })
                      } else {
                        setForm({ ...form, start_time: slot })
                      }
                    }}
                    className={`${inputClassName} appearance-none pl-11 border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`}
                  >
                    <option value="">{t('appointmentForm.selectHour')}</option>
                    {generateTimeSlots().map((slot) => {
                      const occupied = getOccupiedSlots(form.start_date).has(slot)
                      const hour = parseInt(slot.split(':')[0], 10)
                      const isPast = form.start_date === new Date().toISOString().split('T')[0]
                        && (hour < new Date().getHours() || (hour === new Date().getHours() && parseInt(slot.split(':')[1], 10) <= new Date().getMinutes()))
                      return (
                        <option key={slot} value={slot} disabled={occupied || isPast}>
                          {slot} {occupied ? t('appointmentForm.occupied') : isPast ? t('appointmentForm.past') : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </Field>
              <Field label={t('appointmentForm.endTime')}>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    placeholder={t('appointmentForm.optional')}
                    className={`${inputClassName} pl-11 border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`}
                  />
                </div>
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={<User size={18} />} title={t('appointmentForm.related')} tone="violet">
            <div className="space-y-4">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-blue-900">{t('appointmentForm.leadContextTitle')}</p>
                    <p className="text-sm leading-6 text-blue-700">{t('appointmentForm.whatsAppInfo')}</p>
                    {selectedLead?.phone ? <p className="text-sm font-medium text-blue-800">{t('appointmentForm.whatsAppPhone', { phone: selectedLead.phone })}</p> : null}
                    {!selectedLead?.phone && selectedLead ? <p className="text-sm font-medium text-amber-700">{t('appointmentForm.whatsAppMissingPhone')}</p> : null}
                  </div>
                  <Link href="/leads/new" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100">
                    <User size={16} />
                    {t('appointmentForm.createLeadWithPhone')}
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t('appointmentForm.lead')}>
                  <select
                    value={form.lead_id}
                    onChange={(e) => setForm({ ...form, lead_id: e.target.value })}
                    className={`${inputClassName} border-violet-100 focus:border-violet-400 focus:ring-violet-100`}
                  >
                    <option value="">{t('appointmentForm.selectLead')}</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.first_name} {lead.last_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('appointmentForm.property')}>
                  <select
                    value={form.property_id}
                    onChange={(e) => setForm({ ...form, property_id: e.target.value })}
                    className={`${inputClassName} border-violet-100 focus:border-violet-400 focus:ring-violet-100`}
                  >
                    <option value="">{t('appointmentForm.selectProperty')}</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>{property.title}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={<MapPin size={18} />} title={t('appointmentForm.location')} tone="amber">
            <Field label={t('appointmentForm.location')}>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder={t('appointmentForm.locationPlaceholder')}
                  className={`${inputClassName} pl-11 border-amber-100 focus:border-amber-400 focus:ring-amber-100`}
                />
              </div>
            </Field>
          </SectionCard>

          <SectionCard icon={<AlertCircle size={18} />} title={t('appointmentForm.notes')} tone="slate">
            <Field label={t('appointmentForm.notes')}>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t('appointmentForm.notesPlaceholder')}
                className={`${inputClassName} resize-none border-slate-200 focus:border-slate-400 focus:ring-slate-200`}
              />
            </Field>
          </SectionCard>

          <div className="sticky bottom-0 z-10 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Link href="/appointments" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                {t('appointmentForm.cancel')}
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <Save size={18} />
                {saving ? t('appointmentForm.saving') : t('appointmentForm.save')}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}

function SectionCard({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone: 'blue' | 'emerald' | 'violet' | 'amber' | 'slate' }) {
  const tones = {
    blue: {
      shell: 'border-blue-100 bg-blue-50/45',
      icon: 'bg-blue-500/12 text-blue-700 ring-1 ring-blue-100',
    },
    emerald: {
      shell: 'border-emerald-100 bg-emerald-50/45',
      icon: 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-100',
    },
    violet: {
      shell: 'border-violet-100 bg-violet-50/45',
      icon: 'bg-violet-500/12 text-violet-700 ring-1 ring-violet-100',
    },
    amber: {
      shell: 'border-amber-100 bg-amber-50/45',
      icon: 'bg-amber-500/12 text-amber-700 ring-1 ring-amber-100',
    },
    slate: {
      shell: 'border-slate-200 bg-slate-50/55',
      icon: 'bg-slate-500/12 text-slate-700 ring-1 ring-slate-200',
    },
  } as const

  const palette = tones[tone]
  return (
    <section className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${palette.shell}`}>
      <div className="mb-5 flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm ${palette.icon}`}>{icon}</div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function AppointmentSuspenseFallback() {
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-500">{t('common.loading')}</div>
    </div>
  )
}

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={<AppointmentSuspenseFallback />}>
      <NewAppointmentForm />
    </Suspense>
  )
}

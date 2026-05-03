'use client'

import { type ReactNode, useEffect, useState, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Edit, Trash2, Calendar, Clock, MapPin, Home, User, AlertCircle, MessageCircle, Building2, BadgeInfo, Tag } from 'lucide-react'
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, type Appointment } from '@/features/appointments/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getAppointmentStatusLabel, getAppointmentTypeLabel } from '@/i18n/pageLabels'
import { buildSlotFromDateAndTime } from '@/features/conversations/scheduling-engine'
import { sendAppointmentWhatsAppAction } from '../actions'

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-700' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-700' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700' },
  no_show: { bg: 'bg-amber-100', text: 'text-amber-700' },
}

const inputClassName = 'w-full rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-700 outline-none transition focus:bg-white focus:ring-2 focus:ring-blue-500'

export default function AppointmentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const { t, formatDate, formatTime, timezone } = useI18n()

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendingWhatsApp, startSendingWhatsApp] = useTransition()
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

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

  const getInputParts = (value: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(value))

    const get = (type: string) => parts.find((part) => part.type === type)?.value || ''

    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      time: `${get('hour')}:${get('minute')}`,
    }
  }

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, tenant_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile?.tenant_id) {
        setError(t('appointmentDetail.errors.profile'))
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
        setError(t('appointmentDetail.errors.missing'))
        setLoading(false)
        return
      }

      setAppointment(apt)

      const startInput = getInputParts(apt.start_time)
      const endInput = getInputParts(apt.end_time)

      setForm({
        title: apt.title || '',
        description: apt.description || '',
        appointment_type: apt.appointment_type,
        status: apt.status,
        start_date: startInput.date,
        start_time: startInput.time,
        end_time: endInput.time,
        location: apt.location || '',
        notes: apt.notes || '',
      })
    } catch (err) {
      console.error('Error:', err)
      setError(t('appointmentDetail.errors.load'))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!appointment || !tenantId) return
    setSaving(true)

    const [startHour, startMinute] = form.start_time.split(':').map(Number)
    const [endHour, endMinute] = (form.end_time || '').split(':').map(Number)
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = form.end_time ? endHour * 60 + endMinute : startMinutes + 60

    if (!Number.isFinite(startHour) || !Number.isFinite(startMinute) || !form.start_date) {
      setError(t('appointmentForm.errors.invalidDateTime'))
      setSaving(false)
      return
    }

    if (form.end_time && (!Number.isFinite(endHour) || !Number.isFinite(endMinute) || endMinutes <= startMinutes)) {
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

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        title: form.title,
        description: form.description || null,
        appointment_type: form.appointment_type,
        status: form.status,
        start_time: slot.start,
        end_time: slot.end,
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
    if (!confirm(t('appointmentDetail.deleteConfirm'))) return

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

  const handleSendWhatsApp = () => {
    if (!appointment?.leads?.id) {
      setWhatsAppFeedback({ type: 'error', message: t('appointmentDetail.errors.missingLead') })
      return
    }

    if (!appointment.leads.phone?.trim()) {
      setWhatsAppFeedback({ type: 'error', message: t('appointmentDetail.errors.missingLeadPhone') })
      return
    }

    setWhatsAppFeedback(null)

    startSendingWhatsApp(async () => {
      try {
        const result = await sendAppointmentWhatsAppAction(appointment.id)

        if (!result.ok) {
          setWhatsAppFeedback({ type: 'error', message: result.error || t('appointmentDetail.errors.sendWhatsApp') })
          return
        }

        setWhatsAppFeedback({ type: 'success', message: t('appointmentDetail.whatsAppSuccess') })
      } catch (err) {
        setWhatsAppFeedback({ type: 'error', message: err instanceof Error ? err.message : t('appointmentDetail.errors.sendWhatsApp') })
      }
    })
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>
  }

  if (error || !appointment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('appointmentDetail.notFound')}</h2>
          <p className="text-slate-500 mb-4">{error}</p>
          <Link href="/appointments" className="text-blue-500 hover:underline">{t('appointmentDetail.back')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
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
                  <span className="text-slate-300">/</span>
                  <span className="font-medium text-slate-900">{t('appointmentDetail.detail')}</span>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-sky-500 via-cyan-400 to-blue-300 text-white shadow-lg shadow-sky-400/15">
                    <Calendar size={24} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">{t('appointmentDetail.detail')}</p>
                    <div className="space-y-1.5">
                      <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{appointment.title || t('appointmentDetail.emptyTitle')}</h1>
                      <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('appointmentDetail.detailSubtitle')}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <Badge className={`${STATUS_COLORS[appointment.status].bg} ${STATUS_COLORS[appointment.status].text}`}>{getAppointmentStatusLabel(t, appointment.status)}</Badge>
                  <Badge className="border border-slate-200 bg-white/85 text-slate-700">{getAppointmentTypeLabel(t, appointment.appointment_type)}</Badge>
                  <Badge className="border border-slate-200 bg-white/85 text-slate-700"><Calendar size={13} />{formatDate(appointment.start_time, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Badge>
                  <Badge className="border border-slate-200 bg-white/85 text-slate-700"><Clock size={13} />{formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}</Badge>
                  {appointment.leads ? <Badge className="border border-slate-200 bg-white/85 text-slate-700"><User size={13} />{appointment.leads.first_name} {appointment.leads.last_name}</Badge> : null}
                  {appointment.properties ? <Badge className="border border-slate-200 bg-white/85 text-slate-700"><Building2 size={13} />{appointment.properties.title}</Badge> : null}
                </div>
              </div>

              <div className="flex w-full flex-col gap-3 xl:max-w-md xl:items-end">
                <div className="flex w-full flex-col gap-3 sm:flex-row xl:justify-end">
                  <Link href="/appointments" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                    <ArrowLeft size={18} />
                    {t('appointmentDetail.back')}
                  </Link>
                  <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                    <Home size={18} />
                    {t('appointmentDetail.backToDashboard')}
                  </Link>
                </div>

                <div className="flex w-full flex-col gap-3 sm:flex-row xl:justify-end">
                  {!editing ? (
                    <>
                      <button onClick={handleSendWhatsApp} disabled={sendingWhatsApp} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-100 disabled:opacity-50">
                        <MessageCircle size={18} />
                        {sendingWhatsApp ? t('appointmentDetail.sendingWhatsApp') : t('appointmentDetail.sendWhatsApp')}
                      </button>
                      <button onClick={() => setEditing(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700">
                        <Edit size={18} />
                        {t('appointmentDetail.edit')}
                      </button>
                      <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-medium text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100 disabled:opacity-50">
                        <Trash2 size={18} />
                        {deleting ? t('appointmentDetail.deleting') : t('appointmentDetail.delete')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditing(false)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">{t('appointmentDetail.cancel')}</button>
                      <button onClick={handleSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:opacity-50">
                        <Edit size={18} />
                        {saving ? t('appointmentDetail.saving') : t('appointmentDetail.save')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {whatsAppFeedback ? (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-medium ${whatsAppFeedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {whatsAppFeedback.message}
          </div>
        ) : null}

        <div className="mx-auto max-w-5xl">
        {editing ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-700 ring-1 ring-blue-100 shadow-sm"><Edit size={18} /></div>
              <h2 className="text-lg font-semibold text-slate-900">{t('appointmentDetail.editTitle')}</h2>
            </div>
            <div className="space-y-5">
              <Field label={t('appointmentForm.title')}>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClassName} />
              </Field>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t('appointmentDetail.fields.type')}>
                  <select value={form.appointment_type} onChange={(e) => setForm({ ...form, appointment_type: e.target.value as typeof form.appointment_type })} className={inputClassName}>
                    {APPOINTMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{getAppointmentTypeLabel(t, item.value)}</option>)}
                  </select>
                </Field>
                <Field label={t('appointmentDetail.fields.status')}>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} className={inputClassName}>
                    {APPOINTMENT_STATUSES.map((item) => <option key={item.value} value={item.value}>{getAppointmentStatusLabel(t, item.value)}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label={t('appointmentDetail.fields.date')}>
                  <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputClassName} />
                </Field>
                <Field label={t('appointmentDetail.fields.startTime')}>
                  <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={inputClassName} />
                </Field>
                <Field label={t('appointmentDetail.fields.endTime')}>
                  <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={inputClassName} />
                </Field>
              </div>

              <Field label={t('appointmentDetail.fields.location')}>
                <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={t('appointmentDetail.placeholders.location')} className={inputClassName} />
              </Field>

              <Field label={t('appointmentDetail.fields.notes')}>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className={`${inputClassName} resize-none`} />
              </Field>
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-[linear-gradient(180deg,_rgba(248,250,252,0.95),_rgba(255,255,255,0.98))] px-6 py-5 sm:px-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('appointmentDetail.detail')}</p>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{appointment.title || t('appointmentDetail.emptyTitle')}</h2>
                    <p className="max-w-2xl text-sm text-slate-500">{t('appointmentDetail.detailSubtitle')}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t('appointmentDetail.fields.time')}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-7">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <InfoTile icon={<Calendar size={18} className="text-blue-600" />} label={t('appointmentDetail.fields.date')} value={formatDate(appointment.start_time, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} tone="blue" />
                  <InfoTile icon={<Clock size={18} className="text-emerald-600" />} label={t('appointmentDetail.fields.time')} value={`${formatTime(appointment.start_time)} - ${formatTime(appointment.end_time)}`} tone="emerald" />
                  <InfoTile icon={<Tag size={18} className="text-violet-600" />} label={t('appointmentDetail.fields.type')} value={getAppointmentTypeLabel(t, appointment.appointment_type)} tone="violet" />

                  {appointment.location ? (
                    <InfoTile icon={<MapPin size={18} className="text-amber-600" />} label={t('appointmentDetail.fields.location')} value={appointment.location} tone="amber" />
                  ) : null}

                  {appointment.leads ? (
                    <InfoTile
                      icon={<User size={18} className="text-sky-600" />}
                      label={t('appointmentDetail.fields.lead')}
                      value={`${appointment.leads.first_name} ${appointment.leads.last_name}`}
                      meta={appointment.leads.email || undefined}
                      tone="sky"
                    />
                  ) : null}

                  {appointment.leads?.phone ? (
                    <InfoTile icon={<MessageCircle size={18} className="text-cyan-600" />} label={t('appointmentDetail.fields.leadPhone')} value={appointment.leads.phone} tone="cyan" />
                  ) : null}

                  {appointment.properties ? (
                    <InfoTile icon={<Building2 size={18} className="text-slate-600" />} label={t('appointmentDetail.fields.property')} value={appointment.properties.title} tone="slate" />
                  ) : null}
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {appointment.description ? (
                    <DetailSection icon={<BadgeInfo size={18} />} title={t('appointmentDetail.fields.description')} tone="blue">
                      <p className="text-sm leading-7 text-slate-700">{appointment.description}</p>
                    </DetailSection>
                  ) : null}

                  {appointment.notes ? (
                    <DetailSection icon={<Edit size={18} />} title={t('appointmentDetail.fields.notes')} tone="violet">
                      <p className="text-sm leading-7 text-slate-700">{appointment.notes}</p>
                    </DetailSection>
                  ) : null}

                  {!appointment.description && !appointment.notes ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm text-slate-500 lg:col-span-2">
                      {t('appointmentDetail.emptySupplemental')}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${className}`}>{children}</span>
}

function InfoTile({ icon, label, value, meta, tone }: { icon: ReactNode; label: string; value: string; meta?: string; tone: 'blue' | 'emerald' | 'violet' | 'amber' | 'sky' | 'cyan' | 'slate' }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/60',
    emerald: 'border-emerald-100 bg-emerald-50/60',
    violet: 'border-violet-100 bg-violet-50/60',
    amber: 'border-amber-100 bg-amber-50/60',
    sky: 'border-sky-100 bg-sky-50/60',
    cyan: 'border-cyan-100 bg-cyan-50/60',
    slate: 'border-slate-200 bg-slate-50/80',
  } as const

  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold leading-6 text-slate-950">{value}</p>
      {meta ? <p className="mt-1 text-sm text-slate-500">{meta}</p> : null}
    </div>
  )
}

function DetailSection({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone: 'blue' | 'violet' }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/45 text-blue-700 ring-blue-100',
    violet: 'border-violet-100 bg-violet-50/45 text-violet-700 ring-violet-100',
  } as const

  const palette = tones[tone]
  const [borderClass, bgClass, textClass, ringClass] = palette.split(' ')

  return (
    <section className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${borderClass} ${bgClass}`}>
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ${textClass} ${ringClass}`}>{icon}</div>
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

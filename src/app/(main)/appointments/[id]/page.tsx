'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Edit, Trash2, Calendar, Clock, MapPin, Home, User, AlertCircle, MessageCircle } from 'lucide-react'
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
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <Link href="/appointments" className="text-slate-500 hover:text-slate-700"><ArrowLeft size={20} /></Link>
                <span className="text-slate-900 font-medium">{t('appointmentDetail.detail')}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/appointments" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800">
                  <ArrowLeft size={16} />
                  {t('appointmentDetail.back')}
                </Link>
                <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  <Home size={16} />
                  {t('appointmentDetail.backToDashboard')}
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {!editing ? (
                <>
                  <button onClick={handleSendWhatsApp} disabled={sendingWhatsApp} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                    <MessageCircle size={18} />
                    {sendingWhatsApp ? t('appointmentDetail.sendingWhatsApp') : t('appointmentDetail.sendWhatsApp')}
                  </button>
                  <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition">
                    <Edit size={18} />
                    {t('appointmentDetail.edit')}
                  </button>
                  <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition disabled:opacity-50">
                    <Trash2 size={18} />
                    {deleting ? t('appointmentDetail.deleting') : t('appointmentDetail.delete')}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition">{t('appointmentDetail.cancel')}</button>
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50">
                    {saving ? t('appointmentDetail.saving') : t('appointmentDetail.save')}
                  </button>
                </>
              )}
            </div>
          </div>
          {whatsAppFeedback ? (
            <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${whatsAppFeedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {whatsAppFeedback.message}
            </div>
          ) : null}
          </div>
      </header>

      <main className="p-6 max-w-3xl mx-auto">
        {editing ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">{t('appointmentDetail.editTitle')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('appointmentForm.title')}</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('appointmentDetail.fields.type')}</label>
                  <select value={form.appointment_type} onChange={(e) => setForm({ ...form, appointment_type: e.target.value as typeof form.appointment_type })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                    {APPOINTMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{getAppointmentTypeLabel(t, item.value)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('appointmentDetail.fields.status')}</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                    {APPOINTMENT_STATUSES.map((item) => <option key={item.value} value={item.value}>{getAppointmentStatusLabel(t, item.value)}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('appointmentDetail.fields.date')}</label>
                  <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('appointmentDetail.fields.startTime')}</label>
                  <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('appointmentDetail.fields.endTime')}</label>
                  <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('appointmentDetail.fields.location')}</label>
                <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={t('appointmentDetail.placeholders.location')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('appointmentDetail.fields.notes')}</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 mb-2">{appointment.title || t('appointmentDetail.emptyTitle')}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[appointment.status].bg} ${STATUS_COLORS[appointment.status].text}`}>
                    {getAppointmentStatusLabel(t, appointment.status)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Calendar size={20} className="text-blue-500" /></div>
                  <div>
                    <p className="text-sm text-slate-500">{t('appointmentDetail.fields.date')}</p>
                    <p className="font-medium text-slate-900 capitalize">{formatDate(appointment.start_time, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><Clock size={20} className="text-green-500" /></div>
                  <div>
                    <p className="text-sm text-slate-500">{t('appointmentDetail.fields.time')}</p>
                    <p className="font-medium text-slate-900">{formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}</p>
                  </div>
                </div>

                {appointment.location && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><MapPin size={20} className="text-purple-500" /></div>
                    <div>
                      <p className="text-sm text-slate-500">{t('appointmentDetail.fields.location')}</p>
                      <p className="font-medium text-slate-900">{appointment.location}</p>
                    </div>
                  </div>
                )}

                {appointment.leads && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><User size={20} className="text-amber-500" /></div>
                    <div>
                      <p className="text-sm text-slate-500">{t('appointmentDetail.fields.lead')}</p>
                      <p className="font-medium text-slate-900">{appointment.leads.first_name} {appointment.leads.last_name}</p>
                      {appointment.leads.phone && <p className="text-sm text-slate-500">{appointment.leads.phone}</p>}
                    </div>
                  </div>
                )}

                {appointment.properties && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><Home size={20} className="text-slate-500" /></div>
                    <div>
                      <p className="text-sm text-slate-500">{t('appointmentDetail.fields.property')}</p>
                      <p className="font-medium text-slate-900">{appointment.properties.title}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><Edit size={20} className="text-slate-500" /></div>
                  <div>
                    <p className="text-sm text-slate-500">{t('appointmentDetail.fields.type')}</p>
                    <p className="font-medium text-slate-900">{getAppointmentTypeLabel(t, appointment.appointment_type)}</p>
                  </div>
                </div>
              </div>

              {appointment.description && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-sm text-slate-500 mb-2">{t('appointmentDetail.fields.description')}</p>
                  <p className="text-slate-700">{appointment.description}</p>
                </div>
              )}

              {appointment.notes && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-sm text-slate-500 mb-2">{t('appointmentDetail.fields.notes')}</p>
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

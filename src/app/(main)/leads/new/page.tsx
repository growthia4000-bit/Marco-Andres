'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  FileText,
  Home,
  MapPin,
  Save,
  UserPlus,
} from 'lucide-react'
import { LEAD_SOURCES, LEAD_STATUSES, type LeadStatus } from '@/features/leads/types'
import { PROPERTY_TYPES } from '@/features/properties/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getLeadSourceLabel, getLeadStatusLabel, getPropertyTypeLabel } from '@/i18n/pageLabels'

const inputClassName = 'w-full rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-700 outline-none transition focus:bg-white focus:ring-2'

export default function NewLeadPage() {
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorKey, setErrorKey] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
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
        setErrorKey('leadFormExtra.errors.profile')
        setLoading(false)
        return
      }

      if (!profile?.tenant_id) {
        setErrorKey('leadFormExtra.errors.tenantMissing')
        setLoading(false)
        return
      }

      setTenantId(profile.tenant_id)
    } catch (err) {
      console.error('Error:', err)
      setErrorKey('leadFormExtra.errors.retry')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrorKey('')
    setErrorMessage('')
    setSuccess(false)

    if (!tenantId) {
      setErrorKey('leadFormExtra.errors.tenant')
      setSaving(false)
      return
    }

    if (!form.first_name.trim()) {
      setErrorKey('leadFormExtra.errors.firstNameRequired')
      setSaving(false)
      return
    }

    if (!form.phone.trim()) {
      setErrorKey('leadFormExtra.errors.phoneRequired')
      setSaving(false)
      return
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErrorKey('leadFormExtra.errors.invalidEmail')
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

    const { data: result, error: insertError } = await supabase.from('leads').insert(data).select('id').single()
    if (insertError) {
      if (insertError.message) setErrorMessage(insertError.message)
      else setErrorKey('leadFormExtra.errors.save')
      setSaving(false)
      return
    }

    if (!result?.id) {
      setErrorKey('leadFormExtra.errors.create')
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
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>
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
                  <Link href="/leads" className="font-medium text-slate-600 transition hover:text-slate-900">{t('leadsPageExtra.title')}</Link>
                  <span className="text-slate-300">/</span>
                  <span className="font-medium text-slate-900">{t('leadFormExtra.newTitle')}</span>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-sky-500 via-cyan-400 to-blue-300 text-white shadow-lg shadow-sky-400/15">
                    <UserPlus size={24} />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('leadFormExtra.newTitle')}</h1>
                    <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('leadFormExtra.subtitle')}</p>
                  </div>
                </div>
              </div>
              <Link href="/leads" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                <ChevronLeft size={18} />
                {t('leadFormExtra.backToLeads')}
              </Link>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {(errorKey || errorMessage) ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600 flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span>{errorKey ? t(errorKey as never) : errorMessage}</span>
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-green-600 flex items-center gap-2">
              <CheckCircle size={18} />
              <span>{t('leadFormExtra.successCreate')}</span>
            </div>
          ) : null}

          <SectionCard icon={<UserPlus size={18} />} title={t('leadFormExtra.contactInfo')} tone="blue">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('leadFormExtra.firstName')}>
                <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder={t('leadFormExtra.placeholders.firstName')} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`} />
              </Field>
              <Field label={t('leadFormExtra.lastName')}>
                <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder={t('leadFormExtra.placeholders.lastName')} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`} />
              </Field>
              <Field label={t('leadFormExtra.phone')}>
                <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('leadFormExtra.placeholders.phone')} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`} />
              </Field>
              <Field label={t('leadFormExtra.email')}>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('leadFormExtra.placeholders.email')} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`} />
              </Field>
              <Field label={t('leadFormExtra.source')}>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}>
                  {LEAD_SOURCES.map((item) => <option key={item.value} value={item.value}>{getLeadSourceLabel(t, item.value)}</option>)}
                </select>
              </Field>
              <Field label={t('leadFormExtra.status')}>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}>
                  {LEAD_STATUSES.map((item) => <option key={item.value} value={item.value}>{getLeadStatusLabel(t, item.value)}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={<MapPin size={18} />} title={t('leadFormExtra.preferences')} tone="emerald">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('leadFormExtra.budgetMinLong')}>
                <input type="number" min="0" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} placeholder={t('leadFormExtra.placeholders.budgetMin')} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`} />
              </Field>
              <Field label={t('leadFormExtra.budgetMaxLong')}>
                <input type="number" min="0" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} placeholder={t('leadFormExtra.placeholders.budgetMax')} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`} />
              </Field>
              <Field label={t('leadFormExtra.preferredLocationLong')}>
                <input type="text" value={form.preferred_location} onChange={(e) => setForm({ ...form, preferred_location: e.target.value })} placeholder={t('leadFormExtra.placeholders.preferredLocation')} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`} />
              </Field>
              <Field label={t('leadFormExtra.preferredType')}>
                <select value={form.preferred_type} onChange={(e) => setForm({ ...form, preferred_type: e.target.value })} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`}>
                  <option value="">{t('leadFormExtra.select')}</option>
                  {PROPERTY_TYPES.map((item) => <option key={item.value} value={item.value}>{getPropertyTypeLabel(t, item.value)}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={<FileText size={18} />} title={t('leadFormExtra.notes')} tone="violet">
            <Field label={t('leadFormExtra.notes')}>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('leadFormExtra.notesPlaceholder')} rows={5} className={`${inputClassName} resize-y border-violet-100 focus:border-violet-400 focus:ring-violet-100`} />
            </Field>
          </SectionCard>

          <div className="sticky bottom-0 z-10 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Link href="/leads" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                {t('common.cancel')}
              </Link>
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                <Save size={18} />
                {saving ? t('leadFormExtra.saving') : t('leadFormExtra.save')}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}

function SectionCard({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone: 'blue' | 'emerald' | 'violet' }) {
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

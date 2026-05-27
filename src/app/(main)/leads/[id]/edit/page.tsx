'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, AlertCircle, CheckCircle, Mail, Phone, UserRound } from 'lucide-react'
import { LEAD_SOURCES, LEAD_STATUSES, type LeadStatus } from '@/features/leads/types'
import { PROPERTY_TYPES } from '@/features/properties/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getLeadSourceLabel, getLeadStatusLabel, getPropertyTypeLabel } from '@/i18n/pageLabels'

export default function EditLeadPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const { t } = useI18n()

  const [loading, setLoading] = useState(true)
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

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile, error: profileError } = await supabase.from('users').select('id, tenant_id').eq('id', user.id).single()
      if (profileError) { setErrorKey('leadFormExtra.errors.profile'); setLoading(false); return }
      if (!profile?.tenant_id) { setErrorKey('leadFormExtra.errors.tenantMissing'); setLoading(false); return }

      setTenantId(profile.tenant_id)

      const { data: lead, error: leadError } = await supabase.from('leads').select('*').eq('id', params.id).eq('tenant_id', profile.tenant_id).single()
      if (leadError || !lead) { setErrorKey('leadFormExtra.errors.notFound'); setLoading(false); return }

      setForm({
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        email: lead.email || '',
        phone: lead.phone || '',
        source: lead.source || 'web',
        budget_min: lead.budget_min?.toString() || '',
        budget_max: lead.budget_max?.toString() || '',
        preferred_location: lead.preferred_location || '',
        preferred_type: lead.preferred_type || '',
        notes: lead.notes || '',
        status: lead.status || 'new',
      })
    } catch (err) {
      console.error('Error:', err)
      setErrorKey('leadFormExtra.errors.retry')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErrorKey(''); setErrorMessage(''); setSuccess(false)
    if (!tenantId) { setErrorKey('leadFormExtra.errors.tenant'); setSaving(false); return }
    if (!form.first_name.trim()) { setErrorKey('leadFormExtra.errors.firstNameRequired'); setSaving(false); return }
    if (!form.phone.trim()) { setErrorKey('leadFormExtra.errors.phoneRequired'); setSaving(false); return }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErrorKey('leadFormExtra.errors.invalidEmail'); setSaving(false); return }

    const data = {
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
      tenant_id: tenantId,
    }

    const { error: updateError } = await supabase.from('leads').update(data).eq('id', params.id).eq('tenant_id', tenantId)
    if (updateError) { if (updateError.message) setErrorMessage(updateError.message); else setErrorKey('leadFormExtra.errors.update'); setSaving(false); return }

    setSuccess(true)
    setTimeout(() => { router.push(`/leads/${params.id}`); router.refresh() }, 1000)
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>

  const fullName = [form.first_name, form.last_name].filter(Boolean).join(' ').trim() || t('leadFormExtra.editTitle')
  const leadInitials = `${form.first_name[0] || ''}${form.last_name[0] || ''}`.trim().toUpperCase() || 'L'
  const leadSourceLabel = getLeadSourceLabel(t, form.source)
  const leadStatusLabel = getLeadStatusLabel(t, form.status)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 pt-4 pb-5">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#eef2ff_100%)] p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200/70 pb-4">
              <Link href={`/leads/${params.id}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-900">
                <ArrowLeft size={16} />
                <span>{t('leadDetailExtra.back')}</span>
              </Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {leadStatusLabel}
              </div>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]">
                  {leadInitials}
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{t('leadFormExtra.editTitle')}</p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{fullName}</h1>
                  </div>
                  <p className="max-w-2xl text-sm text-slate-600">Actualiza la informacion del lead manteniendo visible su contexto comercial actual.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[380px]">
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm shadow-slate-200/40">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('leadFormExtra.phone')}</p>
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700"><Phone size={14} className="text-slate-400" />{form.phone || t('common.notSpecified')}</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm shadow-slate-200/40 sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('leadFormExtra.email')}</p>
                  <p className="mt-2 flex min-w-0 items-start gap-2 text-sm font-medium text-slate-700"><Mail size={14} className="mt-0.5 shrink-0 text-slate-400" /><span className="min-w-0 break-words">{form.email || t('common.notSpecified')}</span></p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm shadow-slate-200/40">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('leadFormExtra.sourceShort')}</p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{leadSourceLabel}</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm shadow-slate-200/40">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('leadFormExtra.status')}</p>
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700"><UserRound size={14} className="text-slate-400" />{leadStatusLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <form onSubmit={handleSubmit} noValidate className="rounded-xl border border-slate-200 bg-white p-6">
          {(errorKey || errorMessage) && (
            <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-600">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span>{errorKey ? t(errorKey as never) : errorMessage}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-green-600">
              <CheckCircle size={18} />
              <span>{t('leadFormExtra.successEdit')}</span>
            </div>
          )}

          <div className="mb-8">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">{t('leadFormExtra.contactInfo')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.firstName')}</label>
                <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.lastName')}</label>
                <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.phone')}</label>
                <input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.email')}</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">{t('leadFormExtra.preferencesShort')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.source')}</label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500">
                  {LEAD_SOURCES.map((source) => <option key={source.value} value={source.value}>{getLeadSourceLabel(t, source.value)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.status')}</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500">
                  {LEAD_STATUSES.map((status) => <option key={status.value} value={status.value}>{getLeadStatusLabel(t, status.value)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.budgetMin')}</label>
                <input type="number" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.budgetMax')}</label>
                <input type="number" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.preferredLocation')}</label>
                <input type="text" value={form.preferred_location} onChange={(e) => setForm({ ...form, preferred_location: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.preferredType')}</label>
                <select value={form.preferred_type} onChange={(e) => setForm({ ...form, preferred_type: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t('leadFormExtra.select')}</option>
                  {PROPERTY_TYPES.map((type) => <option key={type.value} value={type.value}>{getPropertyTypeLabel(t, type.value)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <label className="mb-2 block text-sm font-medium text-slate-700">{t('leadFormExtra.notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex justify-end gap-3">
            <Link href={`/leads/${params.id}`} className="rounded-xl border border-slate-200 px-6 py-2 text-slate-600 transition hover:bg-slate-50">{t('common.cancel')}</Link>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50">
              <Save size={18} />
              {saving ? t('leadFormExtra.saving') : t('leadFormExtra.saveChanges')}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Save, AlertCircle, CheckCircle } from 'lucide-react'
import { LEAD_SOURCES, LEAD_STATUSES, type LeadStatus } from '@/features/leads/types'
import { PROPERTY_TYPES } from '@/features/properties/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getLeadSourceLabel, getLeadStatusLabel, getPropertyTypeLabel } from '@/i18n/pageLabels'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'

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
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', source: 'web', budget_min: '', budget_max: '', preferred_location: '', preferred_type: '', notes: '', status: 'new' as LeadStatus })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const { data: profile, error: profileError } = await supabase.from('users').select('id, tenant_id').eq('id', user.id).single()
      if (profileError) { setErrorKey('leadFormExtra.errors.profile'); setLoading(false); return }
      if (!profile?.tenant_id) { setErrorKey('leadFormExtra.errors.tenantMissing'); setLoading(false); return }
      setTenantId(profile.tenant_id)
    } catch (err) {
      console.error('Error:', err)
      setErrorKey('leadFormExtra.errors.retry')
    } finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErrorKey(''); setErrorMessage(''); setSuccess(false)
    if (!tenantId) { setErrorKey('leadFormExtra.errors.tenant'); setSaving(false); return }
    if (!form.first_name.trim()) { setErrorKey('leadFormExtra.errors.firstNameRequired'); setSaving(false); return }
    if (!form.phone.trim()) { setErrorKey('leadFormExtra.errors.phoneRequired'); setSaving(false); return }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErrorKey('leadFormExtra.errors.invalidEmail'); setSaving(false); return }
    const data = { tenant_id: tenantId, first_name: form.first_name.trim(), last_name: form.last_name.trim() || null, email: form.email.trim() || null, phone: form.phone.trim(), source: form.source || null, budget_min: form.budget_min ? parseFloat(form.budget_min) : null, budget_max: form.budget_max ? parseFloat(form.budget_max) : null, preferred_location: form.preferred_location.trim() || null, preferred_type: form.preferred_type || null, notes: form.notes.trim() || null, status: form.status, created_by: user?.id }
    const { data: result, error: insertError } = await supabase.from('leads').insert(data).select('id').single()
    if (insertError) { if (insertError.message) setErrorMessage(insertError.message); else setErrorKey('leadFormExtra.errors.save'); setSaving(false); return }
    if (!result?.id) { setErrorKey('leadFormExtra.errors.create'); setSaving(false); return }
    setSuccess(true); setTimeout(() => { router.push('/leads'); router.refresh() }, 1000)
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader
        title={t('leadFormExtra.newTitle')}
        breadcrumbs={[
          { label: t('dashboard.title'), href: '/dashboard' },
          { label: t('leadsPageExtra.title'), href: '/leads' },
          { label: t('leadFormExtra.newTitle') },
        ]}
      />
      <main className="p-6 max-w-4xl mx-auto"><form onSubmit={handleSubmit} noValidate className="bg-white rounded-xl border border-slate-200 p-6">{(errorKey || errorMessage) && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2"><AlertCircle size={18} className="flex-shrink-0 mt-0.5" /><span>{errorKey ? t(errorKey as never) : errorMessage}</span></div>}{success && <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 flex items-center gap-2"><CheckCircle size={18} /><span>{t('leadFormExtra.successCreate')}</span></div>}<div className="mb-8"><h3 className="text-lg font-semibold text-slate-900 mb-4">{t('leadFormExtra.contactInfo')}</h3><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.firstName')}</label><input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder={t('leadFormExtra.placeholders.firstName')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.lastName')}</label><input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder={t('leadFormExtra.placeholders.lastName')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.phone')}</label><input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('leadFormExtra.placeholders.phone')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.email')}</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('leadFormExtra.placeholders.email')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.source')}</label><select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">{LEAD_SOURCES.map((item) => <option key={item.value} value={item.value}>{getLeadSourceLabel(t, item.value)}</option>)}</select></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.status')}</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">{LEAD_STATUSES.filter((item) => ['new', 'contacted', 'qualified', 'visit', 'negotiation'].includes(item.value)).map((item) => <option key={item.value} value={item.value}>{getLeadStatusLabel(t, item.value)}</option>)}</select></div></div></div><div className="mb-8"><h3 className="text-lg font-semibold text-slate-900 mb-4">{t('leadFormExtra.preferences')}</h3><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.budgetMin')}</label><input type="number" min="0" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} placeholder={t('leadFormExtra.placeholders.budgetMin')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.budgetMax')}</label><input type="number" min="0" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} placeholder={t('leadFormExtra.placeholders.budgetMax')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.preferredLocation')}</label><input type="text" value={form.preferred_location} onChange={(e) => setForm({ ...form, preferred_location: e.target.value })} placeholder={t('leadFormExtra.placeholders.preferredLocation')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('leadFormExtra.preferredType')}</label><select value={form.preferred_type} onChange={(e) => setForm({ ...form, preferred_type: e.target.value })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"><option value="">{t('leadFormExtra.select')}</option>{PROPERTY_TYPES.map((item) => <option key={item.value} value={item.value}>{getPropertyTypeLabel(t, item.value)}</option>)}</select></div></div></div><div className="mb-8"><h3 className="text-lg font-semibold text-slate-900 mb-4">{t('leadFormExtra.notes')}</h3><textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('leadFormExtra.notesPlaceholder')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" /></div><div className="flex justify-end gap-4"><Link href="/leads" className="px-6 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition">{t('common.cancel')}</Link><button type="submit" disabled={saving} className="px-6 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"><Save size={18} />{saving ? t('leadFormExtra.saving') : t('leadFormExtra.save')}</button></div></form></main>
    </div>
  )
}

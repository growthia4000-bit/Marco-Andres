'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  AlertCircle,
  Bath,
  Bed,
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Filter,
  Home,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MapPin,
  Save,
  Square,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react'
import { PROPERTY_TYPES, DEAL_TYPES, PROPERTY_STATUSES } from '@/features/properties/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getDealTypeLabel, getPropertyStatusLabel, getPropertyTypeLabel } from '@/i18n/pageLabels'
import { SUPPORTED_CURRENCIES } from '@/i18n/currencies'

const inputClassName = 'w-full rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-700 outline-none transition focus:bg-white focus:ring-2'

export default function NewPropertyPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t, currencyCode } = useI18n()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenantCurrencyCode, setTenantCurrencyCode] = useState<string>(currencyCode)
  const [saving, setSaving] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [newImageUrl, setNewImageUrl] = useState('')

  const [form, setForm] = useState({
    title: '',
    description: '',
    property_type: 'apartment' as const,
    deal_type: 'sale' as const,
    price: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'Espana',
    area_sqm: '',
    rooms: '',
    bathrooms: '',
    parking: '0',
    status: 'active' as const,
  })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const { data: profile, error: profileError } = await supabase.from('users').select('id, tenant_id').eq('id', user.id).single()
      if (profileError) { setError(t('propertiesExtra.errors.profile')); setLoading(false); return }
      if (!profile?.tenant_id) { setError(t('propertiesExtra.errors.tenant')); setLoading(false); return }
      setTenantId(profile.tenant_id)
      const { data: tenantSettings } = await supabase.from('tenants').select('default_currency_code').eq('id', profile.tenant_id).single()
      if (tenantSettings?.default_currency_code) setTenantCurrencyCode(tenantSettings.default_currency_code)
    } catch (err) {
      console.error('Error:', err)
      setError(t('propertyForm.errors.retry'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)

    if (!tenantId) { setError(t('propertyForm.errors.tenant')); setSaving(false); return }
    if (!form.title.trim()) { setError(t('propertyForm.errors.titleRequired')); setSaving(false); return }
    if (!form.price || parseFloat(form.price) <= 0) { setError(t('propertyForm.errors.pricePositive')); setSaving(false); return }

    const numericPrice = parseFloat(form.price)
    const data = {
      tenant_id: tenantId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      property_type: form.property_type,
      deal_type: form.deal_type,
      price: numericPrice,
      price_amount: numericPrice,
      currency_code: tenantCurrencyCode,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      postal_code: form.postal_code.trim() || null,
      country: form.country,
      area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null,
      rooms: form.rooms ? parseInt(form.rooms) : null,
      bathrooms: form.bathrooms ? parseInt(form.bathrooms) : null,
      parking: form.parking ? parseInt(form.parking) : 0,
      images,
      status: form.status,
      agent_id: user?.id,
    }

    const { data: result, error: insertError } = await supabase.from('properties').insert(data).select('id').single()
    if (insertError) { setError(insertError.message || t('propertyForm.errors.save')); setSaving(false); return }
    if (!result?.id) { setError(t('propertyForm.errors.create')); setSaving(false); return }
    setSuccess(true)
    setTimeout(() => { router.push('/properties'); router.refresh() }, 1000)
  }

  const handleImageUrl = () => {
    if (newImageUrl && newImageUrl.startsWith('http')) { setImages([...images, newImageUrl]); setNewImageUrl('') }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadProgress('')
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress(`${t('propertiesExtra.uploadingImages')} ${i + 1}/${files.length}`)
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/upload', { method: 'POST', body: formData })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || t('propertyForm.errors.save'))
        }
        const data = await response.json()
        setImages((prev) => [...prev, data.url])
      }
    } catch (err: any) {
      setError(err.message || t('propertyForm.errors.save'))
    } finally {
      setUploading(false)
      setUploadProgress('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <section className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_40%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                    <Home size={14} />
                    {t('dashboard.title')}
                  </Link>
                  <span className="text-slate-300">/</span>
                  <Link href="/properties" className="font-medium text-slate-600 transition hover:text-slate-900">{t('propertiesExtra.title')}</Link>
                  <span className="text-slate-300">/</span>
                  <span className="font-medium text-slate-900">{t('propertyForm.newTitle')}</span>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('propertyForm.newTitle')}</h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('propertyForm.subtitle')}</p>
                </div>
              </div>
              <Link href="/properties" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                <ChevronLeft size={18} />
                {t('propertyForm.backToProperties')}
              </Link>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 flex items-start gap-2"><AlertCircle size={18} className="flex-shrink-0 mt-0.5" /><span>{error}</span></div>}
          {success && <div className="p-4 bg-green-50 border border-green-200 rounded-2xl text-green-600 flex items-center gap-2"><CheckCircle size={18} /><span>{t('propertyForm.success')}</span></div>}

          <SectionCard icon={<Building2 size={18} />} title={t('propertyForm.basic')} tone="blue">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('propertyForm.title')} className="md:col-span-2">
                <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('propertyForm.titlePlaceholder')} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`} />
              </Field>
              <Field label={t('propertyForm.type')}>
                <select value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value as typeof form.property_type })} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}>
                  {PROPERTY_TYPES.map((item) => <option key={item.value} value={item.value}>{getPropertyTypeLabel(t, item.value)}</option>)}
                </select>
              </Field>
              <Field label={t('propertyForm.operation')}>
                <select value={form.deal_type} onChange={(e) => setForm({ ...form, deal_type: e.target.value as typeof form.deal_type })} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}>
                  {DEAL_TYPES.map((item) => <option key={item.value} value={item.value}>{getDealTypeLabel(t, item.value)}</option>)}
                </select>
              </Field>
              <Field label={t('propertyForm.price', { currency: tenantCurrencyCode })}>
                <input type="number" required min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="150000" className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`} />
              </Field>
              <Field label={t('propertyForm.currency')}>
                <select value={tenantCurrencyCode} onChange={(e) => setTenantCurrencyCode(e.target.value)} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}>
                  {SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </Field>
              <Field label={t('propertyForm.status')}>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} className={`${inputClassName} border-blue-100 focus:border-blue-400 focus:ring-blue-100`}>
                  {PROPERTY_STATUSES.map((item) => <option key={item.value} value={item.value}>{getPropertyStatusLabel(t, item.value)}</option>)}
                </select>
              </Field>
              <Field label={t('propertyForm.description')} className="md:col-span-2">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('propertyForm.descriptionPlaceholder')} rows={5} className={`${inputClassName} resize-y border-blue-100 focus:border-blue-400 focus:ring-blue-100`} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={<MapPin size={18} />} title={t('propertyForm.location')} tone="emerald">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('propertyForm.address')} className="md:col-span-2">
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t('propertyForm.addressPlaceholder')} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`} />
              </Field>
              <Field label={t('propertyForm.city')}>
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={t('propertyForm.cityPlaceholder')} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`} />
              </Field>
              <Field label={t('propertyForm.postalCode')}>
                <input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder={t('propertyForm.postalPlaceholder')} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`} />
              </Field>
              <Field label={t('propertyForm.state')}>
                <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder={t('propertyForm.statePlaceholder')} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`} />
              </Field>
              <Field label={t('propertyForm.country')}>
                <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder={t('propertyForm.countryPlaceholder')} className={`${inputClassName} border-emerald-100 focus:border-emerald-400 focus:ring-emerald-100`} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={<Filter size={18} />} title={t('propertyForm.features')} tone="violet">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Field label={t('propertyForm.area')}>
                <div className="relative">
                  <Square size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" min="0" value={form.area_sqm} onChange={(e) => setForm({ ...form, area_sqm: e.target.value })} placeholder="85" className={`${inputClassName} pl-11 border-violet-100 focus:border-violet-400 focus:ring-violet-100`} />
                </div>
              </Field>
              <Field label={t('propertyForm.rooms')}>
                <div className="relative">
                  <Bed size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" min="0" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} placeholder="3" className={`${inputClassName} pl-11 border-violet-100 focus:border-violet-400 focus:ring-violet-100`} />
                </div>
              </Field>
              <Field label={t('propertyForm.bathrooms')}>
                <div className="relative">
                  <Bath size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" min="0" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} placeholder="2" className={`${inputClassName} pl-11 border-violet-100 focus:border-violet-400 focus:ring-violet-100`} />
                </div>
              </Field>
              <Field label={t('propertyForm.parking')}>
                <input type="number" min="0" value={form.parking} onChange={(e) => setForm({ ...form, parking: e.target.value })} placeholder="1" className={`${inputClassName} border-violet-100 focus:border-violet-400 focus:ring-violet-100`} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={<ImagePlus size={18} />} title={t('propertyForm.images')} tone="cyan">
            <div className="space-y-5">
              <div className="rounded-3xl border border-cyan-100 bg-cyan-50/60 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap gap-4">
                  {images.map((url, i) => (
                    <div key={i} className="relative h-32 w-32 overflow-hidden rounded-2xl border border-cyan-100 bg-white group shadow-sm">
                      <button type="button" onClick={() => { setGalleryIndex(i); setGalleryOpen(true) }} className="h-full w-full">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                          <ZoomIn size={24} className="text-white opacity-0 transition group-hover:opacity-100" />
                        </div>
                      </button>
                      <button type="button" onClick={() => setImages(images.filter((_, index) => index !== i))} className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-sm transition group-hover:opacity-100">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {images.length === 0 && (
                    <div className="flex h-32 w-32 items-center justify-center rounded-2xl border-2 border-dashed border-cyan-200 bg-white">
                      <ImageIcon size={32} className="text-cyan-300" />
                    </div>
                  )}
                </div>
                <p className="text-sm text-slate-500">{images.length === 0 ? t('propertyForm.noImagesYet') : t('propertyForm.uploadOrPaste')}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-3xl border-2 border-dashed border-cyan-200 bg-cyan-50/40 p-6 text-left transition hover:border-cyan-400 hover:bg-cyan-50/80">
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500 text-white shadow-sm"><Upload size={20} /></div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">{t('propertyForm.uploadFromDevice')}</p>
                      <p className="text-sm text-slate-500">{t('propertyForm.uploadSpecs')}</p>
                      {uploading && <div className="flex items-center gap-2 pt-2 text-sm text-blue-600"><Loader2 size={16} className="animate-spin" />{uploadProgress}</div>}
                    </div>
                  </div>
                </button>

                <div className="rounded-3xl border border-cyan-100 bg-cyan-50/40 p-5 shadow-sm">
                  <p className="font-semibold text-slate-900">{t('propertyForm.pasteUrl')}</p>
                  <p className="mt-1 text-sm text-slate-500">{t('propertyForm.uploadOrPaste')}</p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input type="url" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder={t('propertyForm.imageUrlPlaceholder')} className={`${inputClassName} flex-1 border-cyan-100 focus:border-cyan-400 focus:ring-cyan-100`} />
                    <button type="button" onClick={handleImageUrl} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-cyan-700">
                      <ImagePlus size={16} />
                      {t('propertyForm.addImageUrl')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="sticky bottom-0 z-10 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Link href="/properties" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                {t('common.cancel')}
              </Link>
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                <Save size={18} />
                {saving ? t('propertyForm.saving') : t('propertyForm.save')}
              </button>
            </div>
          </div>
        </form>
      </main>

      {galleryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <button onClick={() => setGalleryOpen(false)} className="absolute top-4 right-4 p-2 text-white hover:text-slate-300 transition"><X size={32} /></button>
          <button onClick={() => setGalleryIndex(galleryIndex > 0 ? galleryIndex - 1 : images.length - 1)} className="absolute left-4 p-2 text-white hover:text-slate-300 transition"><ChevronLeft size={48} /></button>
          <img src={images[galleryIndex]} alt="" className="max-w-full max-h-[85vh] object-contain" />
          <button onClick={() => setGalleryIndex(galleryIndex < images.length - 1 ? galleryIndex + 1 : 0)} className="absolute right-4 p-2 text-white hover:text-slate-300 transition"><ChevronRight size={48} /></button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">{galleryIndex + 1} / {images.length}</div>
        </div>
      )}
    </div>
  )
}

function SectionCard({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone: 'blue' | 'emerald' | 'violet' | 'cyan' }) {
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
    cyan: {
      shell: 'border-cyan-100 bg-cyan-50/45',
      icon: 'bg-cyan-500/12 text-cyan-700 ring-1 ring-cyan-100',
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

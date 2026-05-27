'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Save, Upload, X, AlertCircle, CheckCircle, Image as ImageIcon, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { PROPERTY_TYPES, DEAL_TYPES, PROPERTY_STATUSES } from '@/features/properties/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getDealTypeLabel, getPropertyStatusLabel, getPropertyTypeLabel } from '@/i18n/pageLabels'
import { SUPPORTED_CURRENCIES } from '@/i18n/currencies'
import { PageHeader } from '@/components/PageHeader'

export default function PropertyEditPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const { t, currencyCode } = useI18n()
  const isEditing = params.id && params.id !== 'new'
  const propertyId = String(params.id)

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenantCurrencyCode, setTenantCurrencyCode] = useState<string>(currencyCode)
  const [saving, setSaving] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [error, setError] = useState('')
  const [uploadErrorCode, setUploadErrorCode] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [newImageUrl, setNewImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  const [form, setForm] = useState({
    title: '', description: '', property_type: 'apartment' as const, deal_type: 'sale' as const, price: '', address: '', city: '', state: '', postal_code: '', country: 'Espana', area_sqm: '', rooms: '', bathrooms: '', parking: '0', status: 'active' as const,
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

      if (isEditing) {
        const { data: property, error: propertyError } = await supabase.from('properties').select('*').eq('id', params.id).eq('tenant_id', profile.tenant_id).single()
        if (propertyError || !property) { setError(t('propertyForm.errors.notFound')); setLoading(false); return }
        setForm({ title: property.title || '', description: property.description || '', property_type: property.property_type, deal_type: property.deal_type, price: (property.price_amount ?? property.price)?.toString() || '', address: property.address || '', city: property.city || '', state: property.state || '', postal_code: property.postal_code || '', country: property.country || 'Espana', area_sqm: property.area_sqm?.toString() || '', rooms: property.rooms?.toString() || '', bathrooms: property.bathrooms?.toString() || '', parking: property.parking?.toString() || '0', status: property.status })
        if (property.currency_code) setTenantCurrencyCode(property.currency_code)
        setImages(property.images || [])
      }
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
    const data = { tenant_id: tenantId, title: form.title.trim(), description: form.description.trim() || null, property_type: form.property_type, deal_type: form.deal_type, price: numericPrice, price_amount: numericPrice, currency_code: tenantCurrencyCode, address: form.address.trim() || null, city: form.city.trim() || null, state: form.state.trim() || null, postal_code: form.postal_code.trim() || null, country: form.country, area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null, rooms: form.rooms ? parseInt(form.rooms) : null, bathrooms: form.bathrooms ? parseInt(form.bathrooms) : null, parking: form.parking ? parseInt(form.parking) : 0, images, status: form.status, agent_id: user?.id }

    const response = isEditing
      ? await supabase.from('properties').update(data).eq('id', params.id).eq('tenant_id', tenantId).select('id').single()
      : await supabase.from('properties').insert(data).select('id').single()

    if (response.error) { setError(response.error.message || t('propertyForm.errors.save')); setSaving(false); return }
    if (!response.data?.id) { setError(t('propertyForm.errors.create')); setSaving(false); return }

    setSuccess(true)
    setTimeout(() => { router.push(`/properties/${response.data.id}`); router.refresh() }, 1000)
  }


  const getUploadErrorCode = (message?: string) => {
    if (!message) return 'uploadGeneric'
    const normalized = message.toLowerCase()
    if (normalized.includes('row-level security') || normalized.includes('rls')) return 'uploadStoragePermissions'
    if (normalized.includes('no image url')) return 'uploadMissingUrl'
    if (normalized.includes('public url')) return 'uploadPublicUrl'
    if (normalized.includes('invalid file type')) return 'uploadInvalidType'
    if (normalized.includes('file too large')) return 'uploadTooLarge'
    if (normalized.includes('unauthorized')) return 'uploadUnauthorized'
    return 'uploadGeneric'
  }

  const handleImageUrl = () => {
    if (newImageUrl && newImageUrl.startsWith('http')) {
      setImages([...images, newImageUrl])
      setNewImageUrl('')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !tenantId) return
    setUploading(true)
    setUploadProgress('')
    setError('')
    setUploadErrorCode(null)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress(`${t('propertiesExtra.uploadingImages')} ${i + 1}/${files.length}`)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('propertyId', propertyId)
        const response = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'uploadGeneric')
        }
        if (!data?.url || typeof data.url !== 'string') {
          throw new Error('Upload completed but no image URL was returned')
        }
        setImages((prev) => [...prev, data.url])
      }
    } catch (err: any) {
      setUploadErrorCode(getUploadErrorCode(err?.message))
    } finally {
      setUploading(false)
      setUploadProgress('')
      e.target.value = ''
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader
        title={isEditing ? t('propertyForm.editTitle') : t('propertyForm.newTitle')}
        breadcrumbs={[
          { label: t('dashboard.title'), href: '/dashboard' },
          { label: t('propertiesExtra.title'), href: '/properties' },
          ...(isEditing ? [{ label: t('propertiesExtra.detail'), href: `/properties/${propertyId}` }] : []),
          { label: isEditing ? t('propertyForm.editTitle') : t('propertyForm.newTitle') },
        ]}
      />
      <main className="p-6 max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6">
          {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2"><AlertCircle size={18} className="flex-shrink-0 mt-0.5" /><span>{error}</span></div>}
          {uploadErrorCode && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2"><AlertCircle size={18} className="flex-shrink-0 mt-0.5" /><span>{t(`propertyForm.errors.${uploadErrorCode}` as never)}</span></div>}
          {success && <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 flex items-center gap-2"><CheckCircle size={18} /><span>{t('propertyForm.success')}</span></div>}

          <div className="mb-8"><h3 className="text-lg font-semibold text-slate-900 mb-4">{t('propertyForm.basic')}</h3><div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.title')}</label><input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('propertyForm.titlePlaceholder')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.type')}</label><select value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value as typeof form.property_type })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">{PROPERTY_TYPES.map((item) => <option key={item.value} value={item.value}>{getPropertyTypeLabel(t, item.value)}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.operation')}</label><select value={form.deal_type} onChange={(e) => setForm({ ...form, deal_type: e.target.value as typeof form.deal_type })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">{DEAL_TYPES.map((item) => <option key={item.value} value={item.value}>{getDealTypeLabel(t, item.value)}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.price', { currency: tenantCurrencyCode })}</label><input type="number" required min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="150000" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.currency')}</label><select value={tenantCurrencyCode} onChange={(e) => setTenantCurrencyCode(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">{SUPPORTED_CURRENCIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.status')}</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">{PROPERTY_STATUSES.map((item) => <option key={item.value} value={item.value}>{getPropertyStatusLabel(t, item.value)}</option>)}</select></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.description')}</label><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('propertyForm.descriptionPlaceholder')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" /></div>
          </div></div>

          <div className="mb-8"><h3 className="text-lg font-semibold text-slate-900 mb-4">{t('propertyForm.location')}</h3><div className="grid grid-cols-2 gap-4"><div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.address')}</label><input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t('propertyForm.addressPlaceholder')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.city')}</label><input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={t('propertyForm.cityPlaceholder')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.postalCode')}</label><input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder={t('propertyForm.postalPlaceholder')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div></div></div>

          <div className="mb-8"><h3 className="text-lg font-semibold text-slate-900 mb-4">{t('propertyForm.features')}</h3><div className="grid grid-cols-4 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.area')}</label><input type="number" min="0" value={form.area_sqm} onChange={(e) => setForm({ ...form, area_sqm: e.target.value })} placeholder="85" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.rooms')}</label><input type="number" min="0" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} placeholder="3" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.bathrooms')}</label><input type="number" min="0" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} placeholder="2" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">{t('propertyForm.parking')}</label><input type="number" min="0" value={form.parking} onChange={(e) => setForm({ ...form, parking: e.target.value })} placeholder="1" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></div></div></div>

          <div className="mb-8"><h3 className="text-lg font-semibold text-slate-900 mb-4">{t('propertyForm.images')}</h3><div className="flex flex-wrap gap-4">{images.map((url, i) => <div key={i} className="relative w-32 h-32 rounded-xl overflow-hidden border border-slate-200 group"><button type="button" onClick={() => { setGalleryIndex(i); setGalleryOpen(true) }} className="w-full h-full"><img src={url} alt="" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition"><ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition" /></div></button><button type="button" onClick={() => setImages(images.filter((_, index) => index !== i))} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"><X size={14} /></button></div>)}{images.length === 0 && <div className="w-32 h-32 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center"><ImageIcon size={32} className="text-slate-300" /></div>}</div><div className="mt-4 flex flex-col gap-3"><div className="flex gap-2"><label htmlFor="file-upload" className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition flex items-center gap-2 cursor-pointer"><Upload size={16} />{t('propertyForm.uploadFromPc')}</label><input id="file-upload" type="file" accept="image/*" multiple onChange={handleFileUpload} disabled={uploading} className="hidden" />{uploading && <div className="flex items-center gap-2 px-3 text-sm text-slate-500"><span className="animate-spin">◌</span><span>{uploadProgress || t('propertiesExtra.uploadingImages')}</span></div>}<input type="url" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleImageUrl())} placeholder={t('propertiesExtra.urlPlaceholder')} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" /><button type="button" onClick={handleImageUrl} disabled={!newImageUrl} className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"><Upload size={16} />{t('propertyForm.addImageUrl')}</button></div><p className="text-xs text-slate-500">{uploading ? t('propertiesExtra.uploadingImages') : t('propertiesExtra.uploadHint')}</p></div></div>

          <div className="flex justify-end gap-4"><Link href={isEditing ? `/properties/${propertyId}` : '/properties'} className="px-6 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition">{t('common.cancel')}</Link><button type="submit" disabled={saving} className="px-6 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"><Save size={18} />{saving ? t('propertyForm.saving') : t('propertyForm.save')}</button></div>
        </form>
      </main>

      {galleryOpen && <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"><button onClick={() => setGalleryOpen(false)} className="absolute top-4 right-4 p-2 text-white hover:text-slate-300 transition"><X size={32} /></button><button onClick={() => setGalleryIndex(galleryIndex > 0 ? galleryIndex - 1 : images.length - 1)} className="absolute left-4 p-2 text-white hover:text-slate-300 transition"><ChevronLeft size={48} /></button><img src={images[galleryIndex]} alt="" className="max-w-full max-h-[85vh] object-contain" /><button onClick={() => setGalleryIndex(galleryIndex < images.length - 1 ? galleryIndex + 1 : 0)} className="absolute right-4 p-2 text-white hover:text-slate-300 transition"><ChevronRight size={48} /></button><div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">{galleryIndex + 1} / {images.length}</div></div>}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Edit, MapPin, Bed, Bath, Square, Image as ImageIcon, ChevronLeft, ChevronRight, ZoomIn, X, Building2, Home } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { getDealTypeLabel, getPropertyStatusLabel, getPropertyTypeLabel } from '@/i18n/pageLabels'

export default function PropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const { t, formatCurrency, currencyCode } = useI18n()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [property, setProperty] = useState<any>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)

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

      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (!profile?.tenant_id) {
        setError(t('propertyForm.errors.tenant'))
        return
      }

      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', params.id)
        .eq('tenant_id', profile.tenant_id)
        .single()

      if (error || !data) {
        setError(t('propertyForm.errors.notFound'))
        return
      }

      setProperty(data)
    } catch (err) {
      console.error('Error:', err)
      setError(t('propertyForm.errors.retry'))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{error || t('propertyForm.errors.notFound')}</h2>
          <Link href="/properties" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition">
            <ArrowLeft size={18} />
            {t('common.back')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
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
                  <span className="font-medium text-slate-900">{t('propertiesExtra.detail')}</span>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-blue-500 via-sky-400 to-cyan-300 text-white shadow-lg shadow-sky-400/15">
                    <Building2 size={24} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">{t('propertiesExtra.detail')}</p>
                    <div className="space-y-1.5">
                      <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                        {property.title || t('propertiesExtra.untitled')}
                      </h1>
                      <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('propertiesExtra.detailSubtitle')}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${property.deal_type === 'sale' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>
                    {getDealTypeLabel(t, property.deal_type)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-700">
                    {getPropertyStatusLabel(t, property.status)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-700">
                    {getPropertyTypeLabel(t, property.property_type)}
                  </span>
                  {(property.city || property.address) && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-700">
                      <MapPin size={13} />
                      {[property.city, property.address].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex w-full max-w-sm flex-col gap-3 xl:items-end">
                <div className="w-full rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-sm xl:max-w-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t('propertyForm.price', { currency: property.currency_code ?? currencyCode })}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                    {formatCurrency(property.price_amount ?? property.price, property.currency_code ?? currencyCode)}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row xl:w-full xl:justify-end">
                  <Link href="/properties" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                    <ArrowLeft size={18} />
                    {t('propertyForm.backToProperties')}
                  </Link>
                  <Link href={`/properties/${property.id}/edit`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700">
                    <Edit size={18} />
                    {t('common.edit')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="h-80 bg-slate-100 relative">
            {property.images?.length ? (
              <button type="button" onClick={() => { setGalleryIndex(0); setGalleryOpen(true) }} className="w-full h-full">
                <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover" />
              </button>
            ) : (
              <div className="w-full h-full flex items-center justify-center"><ImageIcon size={48} className="text-slate-300" /></div>
            )}
            {property.images?.length > 1 && (
              <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-lg text-sm">
                {t('propertiesExtra.galleryMore', { count: property.images.length - 1 })}
              </div>
            )}
          </div>

          <div className="p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${property.deal_type === 'sale' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
                    {getDealTypeLabel(t, property.deal_type)}
                  </span>
                  <span className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">
                    {getPropertyStatusLabel(t, property.status)}
                  </span>
                  <span className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">
                    {getPropertyTypeLabel(t, property.property_type)}
                  </span>
                </div>
                <h1 className="text-2xl font-semibold text-slate-900">{property.title || t('propertiesExtra.untitled')}</h1>
                {(property.city || property.address) && (
                  <p className="text-slate-500 flex items-center gap-2 mt-2">
                    <MapPin size={16} />
                    {[property.city, property.address].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-blue-600">
                  {formatCurrency(property.price_amount ?? property.price, property.currency_code ?? currencyCode)}
                </p>
              </div>
            </div>

            {property.description && (
              <p className="text-slate-600 leading-relaxed mb-6">{property.description}</p>
            )}

            <div className="grid grid-cols-4 gap-4">
              {property.rooms ? <div className="bg-slate-50 rounded-xl p-4"><div className="flex items-center gap-2 text-slate-500 mb-1"><Bed size={16} />{t('propertyForm.rooms')}</div><p className="text-xl font-semibold text-slate-900">{property.rooms}</p></div> : null}
              {property.bathrooms ? <div className="bg-slate-50 rounded-xl p-4"><div className="flex items-center gap-2 text-slate-500 mb-1"><Bath size={16} />{t('propertyForm.bathrooms')}</div><p className="text-xl font-semibold text-slate-900">{property.bathrooms}</p></div> : null}
              {property.area_sqm ? <div className="bg-slate-50 rounded-xl p-4"><div className="flex items-center gap-2 text-slate-500 mb-1"><Square size={16} />{t('propertyForm.area')}</div><p className="text-xl font-semibold text-slate-900">{property.area_sqm}</p></div> : null}
              <div className="bg-slate-50 rounded-xl p-4"><div className="text-slate-500 mb-1">{t('common.currency')}</div><p className="text-xl font-semibold text-slate-900">{property.currency_code ?? currencyCode}</p></div>
            </div>
          </div>
        </div>

        {galleryOpen && property.images?.length > 0 && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
            <button onClick={() => setGalleryOpen(false)} className="absolute top-4 right-4 p-2 text-white hover:text-slate-300 transition"><X size={32} /></button>
            {property.images.length > 1 && (
              <>
                <button onClick={() => setGalleryIndex(galleryIndex > 0 ? galleryIndex - 1 : property.images.length - 1)} className="absolute left-4 p-2 text-white hover:text-slate-300 transition"><ChevronLeft size={48} /></button>
                <button onClick={() => setGalleryIndex(galleryIndex < property.images.length - 1 ? galleryIndex + 1 : 0)} className="absolute right-4 p-2 text-white hover:text-slate-300 transition"><ChevronRight size={48} /></button>
              </>
            )}
            <img src={property.images[galleryIndex]} alt={property.title} className="max-w-full max-h-[85vh] object-contain" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm flex items-center gap-2"><ZoomIn size={16} />{galleryIndex + 1} / {property.images.length}</div>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}

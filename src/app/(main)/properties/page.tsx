'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Plus, Search, Filter, MapPin, Bed, Bath, Square, Edit, Eye, Trash2, AlertCircle, Save, Bookmark, X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import type { Property } from '@/features/properties/types'
import { useSavedFilters } from '@/hooks/useSavedFilters'
import { useI18n } from '@/i18n/I18nProvider'
import { getDealTypeLabel, getPropertyStatusLabel, getPropertyTypeLabel } from '@/i18n/pageLabels'

const KPI_STYLES = [
  {
    shell: 'border-slate-200 bg-white',
    iconShell: 'bg-slate-900 text-white',
    valueTone: 'text-slate-900',
  },
  {
    shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
    iconShell: 'bg-emerald-500 text-white',
    valueTone: 'text-emerald-700',
  },
  {
    shell: 'border-sky-200 bg-gradient-to-br from-sky-50 to-white',
    iconShell: 'bg-sky-500 text-white',
    valueTone: 'text-sky-700',
  },
  {
    shell: 'border-violet-200 bg-gradient-to-br from-violet-50 to-white',
    iconShell: 'bg-violet-500 text-white',
    valueTone: 'text-violet-700',
  },
  {
    shell: 'border-slate-200 bg-gradient-to-br from-slate-100 to-white',
    iconShell: 'bg-slate-500 text-white',
    valueTone: 'text-slate-700',
  },
] as const

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterDeal, setFilterDeal] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [activeKpi, setActiveKpi] = useState<'total' | 'sale' | 'rent' | 'closed' | 'inactive' | null>(null)
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  const router = useRouter()
  const supabase = createClient()
  const { savedFilters, showSaveDialog, setShowSaveDialog, filterName, setFilterName, saveFilter, deleteFilter } = useSavedFilters('properties')
  const { t, formatCurrency, currencyCode } = useI18n()

  const currentFilters = { search, filterType, filterDeal, filterStatus, sortBy }
  const hasActiveFilters = Boolean(search) || filterType !== 'all' || filterDeal !== 'all' || filterStatus !== 'all'

  const propertyTypes = ['apartment', 'house', 'penthouse', 'villa', 'office', 'commercial', 'land', 'garage', 'storage']
  const propertyStatuses = ['active', 'inactive', 'sold', 'rented']
  const kpis = [
    { key: 'total' as const, label: t('propertiesExtra.total'), value: properties.length, icon: Building2 },
    { key: 'sale' as const, label: t('propertiesExtra.sale'), value: properties.filter((p) => p.deal_type === 'sale' && p.status === 'active').length, icon: Bookmark },
    { key: 'rent' as const, label: t('propertiesExtra.rent'), value: properties.filter((p) => p.deal_type === 'rent' && p.status === 'active').length, icon: KeyIcon },
    { key: 'closed' as const, label: t('propertiesExtra.closed'), value: properties.filter((p) => p.status === 'sold' || p.status === 'rented').length, icon: CheckBadgeIcon },
    { key: 'inactive' as const, label: t('propertiesExtra.inactive'), value: properties.filter((p) => p.status === 'inactive').length, icon: PauseBadgeIcon },
  ]

  const applyFilter = (filters: Record<string, string | undefined>) => {
    setSearch(filters.search || '')
    setFilterType(filters.filterType || 'all')
    setFilterDeal(filters.filterDeal || 'all')
    setFilterStatus(filters.filterStatus || 'all')
    setSortBy(filters.sortBy || 'newest')
  }

  const handleSaveFilter = () => {
    if (filterName.trim()) saveFilter(filterName.trim(), currentFilters)
  }

  const handleKpiFilter = (kpi: 'total' | 'sale' | 'rent' | 'closed' | 'inactive') => {
    if (kpi === 'total') {
      setActiveKpi(null)
      return
    }

    setActiveKpi((current) => current === kpi ? null : kpi)
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

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, tenant_id')
        .eq('id', user.id)
        .single()

      if (profileError) {
        setError(t('propertiesExtra.errors.profile'))
        setLoading(false)
        return
      }

      if (!profile?.tenant_id) {
        setError(t('propertiesExtra.errors.tenant'))
        setLoading(false)
        return
      }

      const { data, error: propertiesError } = await supabase
        .from('properties')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })

      if (propertiesError) {
        setError(t('propertiesExtra.errors.load'))
        setLoading(false)
        return
      }

      setProperties(data || [])
    } catch (err) {
      console.error('Error loading:', err)
      setError(t('propertiesExtra.errors.connection'))
    } finally {
      setLoading(false)
    }
  }

  const filteredProperties = useMemo(() => properties.filter((p) => {
    const query = search.toLowerCase()
    const matchesSearch = p.title.toLowerCase().includes(query) || p.city?.toLowerCase().includes(query) || p.address?.toLowerCase().includes(query)
    const matchesType = filterType === 'all' || p.property_type === filterType
    const matchesDeal = filterDeal === 'all' || p.deal_type === filterDeal
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus
    const matchesKpi = !activeKpi
      || (activeKpi === 'sale' && p.deal_type === 'sale' && p.status === 'active')
      || (activeKpi === 'rent' && p.deal_type === 'rent' && p.status === 'active')
      || (activeKpi === 'closed' && (p.status === 'sold' || p.status === 'rented'))
      || (activeKpi === 'inactive' && p.status === 'inactive')
    return matchesSearch && matchesType && matchesDeal && matchesStatus && matchesKpi
  }).sort((a, b) => {
    switch (sortBy) {
      case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'price_high': return b.price - a.price
      case 'price_low': return a.price - b.price
      case 'title': return a.title.localeCompare(b.title)
      default: return 0
    }
  }), [properties, search, filterType, filterDeal, filterStatus, sortBy, activeKpi])

  const handleDelete = async (id: string) => {
    if (!confirm(t('propertiesExtra.deleteConfirm'))) return
    const { error: deleteError } = await supabase.from('properties').delete().eq('id', id)
    if (!deleteError) loadData()
  }

  const resetFilters = () => {
    setSearch('')
    setFilterType('all')
    setFilterDeal('all')
    setFilterStatus('all')
    setSortBy('newest')
    setActiveKpi(null)
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm mb-6">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_40%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">{t('dashboard.title')}</Link>
                  <span className="text-slate-300">/</span>
                  <span className="font-medium text-slate-900">{t('propertiesExtra.title')}</span>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('propertiesExtra.title')}</h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('propertiesExtra.subtitle')}</p>
                </div>
              </div>
              <Link href="/properties/new" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"><Plus size={18} />{t('propertiesExtra.new')}</Link>
            </div>
          </div>
        </section>

        {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2"><AlertCircle size={18} className="flex-shrink-0 mt-0.5" /><span>{error}</span></div>}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-6">
          {kpis.map((kpi, index) => {
            const Icon = kpi.icon
            const style = KPI_STYLES[index]
            const isActive = activeKpi === kpi.key || (!activeKpi && kpi.key === 'total')
            return (
              <button
                key={kpi.label}
                type="button"
                onClick={() => handleKpiFilter(kpi.key)}
                aria-pressed={isActive}
                className={`rounded-3xl border p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${style.shell} ${isActive ? 'ring-2 ring-blue-200 border-blue-300' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                    <p className={`text-3xl font-semibold tracking-tight ${style.valueTone}`}>{kpi.value}</p>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm ${style.iconShell}`}>
                    <Icon size={20} />
                  </div>
                </div>
              </button>
            )
          })}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <Filter size={18} />
              </div>
              <div>
                <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 text-slate-900 hover:text-blue-700"><span className="font-semibold">{t('propertiesExtra.filters')}</span></button>
                <p className="text-sm text-slate-500">{t('propertiesExtra.filtersSubtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {savedFilters.length > 0 && (
                <div className="relative">
                  <select onChange={(e) => { if (e.target.value) { const filter = savedFilters.find((f) => f.id === e.target.value); if (filter) applyFilter(filter.filters); e.target.value = '' } }} className="pl-8 pr-4 py-2.5 border border-slate-200 bg-slate-50 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">{t('propertiesExtra.savedFilters')}</option>
                    {savedFilters.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <Bookmark className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              )}
              <button onClick={() => setShowSaveDialog(true)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50" title={t('propertiesExtra.saveFilters')}><Save size={14} />{t('common.save')}</button>
            </div>
          </div>

          {showFilters && (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="lg:col-span-12 xl:col-span-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" placeholder={t('propertiesExtra.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-200 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none" />
                </div>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="lg:col-span-4 xl:col-span-2 px-4 py-3 border border-slate-200 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">{t('propertiesExtra.allTypes')}</option>
                  {propertyTypes.map((type) => <option key={type} value={type}>{getPropertyTypeLabel(t, type)}</option>)}
                </select>
                <select value={filterDeal} onChange={(e) => { setFilterDeal(e.target.value); setActiveKpi(null) }} className="lg:col-span-4 xl:col-span-2 px-4 py-3 border border-slate-200 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">{t('propertiesExtra.saleRent')}</option>
                  <option value="sale">{t('propertiesExtra.onlySale')}</option>
                  <option value="rent">{t('propertiesExtra.onlyRent')}</option>
                </select>
                <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setActiveKpi(null) }} className="lg:col-span-4 xl:col-span-2 px-4 py-3 border border-slate-200 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">{t('propertiesExtra.allStatuses')}</option>
                  {propertyStatuses.map((status) => <option key={status} value={status}>{getPropertyStatusLabel(t, status)}</option>)}
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="lg:col-span-12 xl:col-span-2 px-4 py-3 border border-slate-200 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="newest">{t('propertiesExtra.newest')}</option>
                  <option value="oldest">{t('propertiesExtra.oldest')}</option>
                  <option value="price_high">{t('propertiesExtra.priceHigh')}</option>
                  <option value="price_low">{t('propertiesExtra.priceLow')}</option>
                  <option value="title">{t('propertiesExtra.byTitle')}</option>
                </select>
              </div>

              {savedFilters.length > 0 && <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">{savedFilters.map((f) => <div key={f.id} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 rounded-xl text-sm"><button onClick={() => applyFilter(f.filters)} className="text-slate-700 hover:text-blue-600">{f.name}</button><button onClick={() => deleteFilter(f.id)} className="text-slate-400 hover:text-red-500 ml-1"><X size={12} /></button></div>)}</div>}
            </>
          )}
          <p className="text-sm text-slate-500 mt-4">{t('propertiesExtra.showing', { filtered: filteredProperties.length, total: properties.length })}</p>
        </section>

        {showSaveDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold text-slate-900">{t('propertiesExtra.saveTitle')}</h3><button onClick={() => setShowSaveDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div>
              <input type="text" value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder={t('propertiesExtra.savePlaceholder')} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none mb-4" autoFocus />
              <div className="bg-slate-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-slate-500 mb-2">{t('propertiesExtra.filtersToSave')}</p>
                <div className="flex flex-wrap gap-1">
                  {search && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{search}</span>}
                  {filterType !== 'all' && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{getPropertyTypeLabel(t, filterType)}</span>}
                  {filterDeal !== 'all' && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{getDealTypeLabel(t, filterDeal)}</span>}
                  {filterStatus !== 'all' && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{getPropertyStatusLabel(t, filterStatus)}</span>}
                  <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{t(`propertiesExtra.${sortBy === 'title' ? 'byTitle' : sortBy === 'newest' ? 'newest' : sortBy === 'oldest' ? 'oldest' : sortBy === 'price_high' ? 'priceHigh' : 'priceLow'}`)}</span>
                </div>
              </div>
              <div className="flex gap-2"><button onClick={() => setShowSaveDialog(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50">{t('common.cancel')}</button><button onClick={handleSaveFilter} disabled={!filterName.trim()} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50">{t('common.save')}</button></div>
            </div>
          </div>
        )}

        {filteredProperties.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><Building2 className="mx-auto text-slate-300 mb-4" size={48} /><h3 className="text-lg font-semibold text-slate-900 mb-2">{t('propertiesExtra.none')}</h3><p className="text-slate-500 mb-4">{properties.length > 0 && hasActiveFilters ? t('propertiesExtra.emptyFiltered') : t('propertiesExtra.first')}</p>{properties.length > 0 && hasActiveFilters ? <button onClick={resetFilters} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition"><X size={18} />{t('propertiesExtra.clearFilters')}</button> : <Link href="/properties/new" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"><Plus size={18} />{t('propertiesExtra.new')}</Link>}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProperties.map((property) => (
              <div key={property.id} className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl">
                <div className="relative h-52 bg-slate-200">
                  <button onClick={() => { if (property.images && property.images.length > 0) { setGalleryImages(property.images); setGalleryIndex(0); setGalleryOpen(true) } }} className="block h-full w-full" disabled={!property.images || property.images.length === 0}>
                    {property.images && property.images.length > 0 ? <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Building2 className="text-slate-400" size={48} /></div>}
                  </button>
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent" />
                  {property.images && property.images.length > 1 && <div className="absolute bottom-3 right-3 bg-black/65 text-white px-2.5 py-1 rounded-xl text-xs shadow-sm">{t('propertiesExtra.galleryMore', { count: property.images.length - 1 })}</div>}
                  <div className="absolute top-3 left-3 flex gap-2 flex-wrap"><span className={`px-2.5 py-1 rounded-xl text-xs font-semibold shadow-sm ${property.deal_type === 'sale' ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'}`}>{getDealTypeLabel(t, property.deal_type)}</span><span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-white/90 text-slate-700 shadow-sm">{getPropertyStatusLabel(t, property.status)}</span></div>
                  <div className="absolute top-3 right-3 flex gap-2"><Link href={`/properties/${property.id}`} title={t('propertiesExtra.detail')} aria-label={t('propertiesExtra.detail')} className="p-2.5 bg-white/95 rounded-xl shadow-sm hover:bg-blue-50 transition"><Eye size={16} className="text-blue-600" /></Link><Link href={`/properties/${property.id}/edit`} title={t('propertiesExtra.edit')} aria-label={t('propertiesExtra.edit')} className="p-2.5 bg-white/95 rounded-xl shadow-sm hover:bg-slate-100 transition"><Edit size={16} className="text-slate-600" /></Link><button onClick={() => handleDelete(property.id)} title={t('common.delete')} aria-label={t('common.delete')} className="p-2.5 bg-white/95 rounded-xl shadow-sm hover:bg-red-50 transition"><Trash2 size={16} className="text-red-500" /></button></div>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2"><Link href={`/properties/${property.id}`} className="font-semibold text-lg leading-7 text-slate-950 truncate hover:text-blue-600 transition">{property.title || t('propertiesExtra.untitled')}</Link><span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap font-medium">{getPropertyTypeLabel(t, property.property_type)}</span></div>
                  {property.address && <Link href={`/properties/${property.id}`} className="text-sm text-slate-500 flex items-center gap-1.5 mb-4 hover:text-blue-600 transition"><MapPin size={14} />{property.city}, {property.address}</Link>}
                  <div className="flex items-center gap-4 text-sm text-slate-500 mb-4 flex-wrap">
                    {property.rooms && <span className="flex items-center gap-1"><Bed size={14} /> {property.rooms}</span>}
                    {property.bathrooms && <span className="flex items-center gap-1"><Bath size={14} /> {property.bathrooms}</span>}
                    {property.area_sqm && <span className="flex items-center gap-1"><Square size={14} /> {t('propertiesExtra.area', { value: property.area_sqm })}</span>}
                  </div>
                  <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-2xl font-bold tracking-tight text-blue-700">{formatCurrency(property.price_amount ?? property.price, property.currency_code ?? currencyCode)}</p><div className="flex items-center gap-2 text-xs text-slate-400"><span>{property.city || ''}</span></div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {galleryOpen && galleryImages.length > 0 && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <button onClick={() => setGalleryOpen(false)} className="absolute top-4 right-4 p-2 text-white hover:text-slate-300 transition"><X size={32} /></button>
          {galleryImages.length > 1 && <><button onClick={() => setGalleryIndex(galleryIndex > 0 ? galleryIndex - 1 : galleryImages.length - 1)} className="absolute left-4 p-2 text-white hover:text-slate-300 transition"><ChevronLeft size={48} /></button><button onClick={() => setGalleryIndex(galleryIndex < galleryImages.length - 1 ? galleryIndex + 1 : 0)} className="absolute right-4 p-2 text-white hover:text-slate-300 transition"><ChevronRight size={48} /></button></>}
          <img src={galleryImages[galleryIndex]} alt="" className="max-w-full max-h-[85vh] object-contain" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm flex items-center gap-2"><ZoomIn size={16} />{galleryIndex + 1} / {galleryImages.length}</div>
        </div>
      )}
    </div>
  )
}

function KeyIcon(props: { size?: number }) {
  return <Building2 {...props} />
}

function CheckBadgeIcon(props: { size?: number }) {
  return <Save {...props} />
}

function PauseBadgeIcon(props: { size?: number }) {
  return <AlertCircle {...props} />
}

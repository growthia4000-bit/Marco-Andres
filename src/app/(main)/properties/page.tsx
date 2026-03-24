'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Plus, Search, Filter, MapPin, Bed, Bath, Square, Edit, Trash2, AlertCircle, Save, Bookmark, Trash, X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import type { Property } from '@/features/properties/types'
import { useSavedFilters } from '@/hooks/useSavedFilters'

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterDeal, setFilterDeal] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const [showFilters, setShowFilters] = useState(true)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  const router = useRouter()
  const supabase = createClient()
  const { savedFilters, showSaveDialog, setShowSaveDialog, filterName, setFilterName, saveFilter, deleteFilter } = useSavedFilters('properties')

  const currentFilters = {
    search,
    filterType,
    filterDeal,
    filterStatus,
    sortBy,
  }

  const applyFilter = (filters: Record<string, string | undefined>) => {
    setSearch(filters.search || '')
    setFilterType(filters.filterType || 'all')
    setFilterDeal(filters.filterDeal || 'all')
    setFilterStatus(filters.filterStatus || 'all')
    setSortBy(filters.sortBy || 'newest')
  }

  const handleSaveFilter = () => {
    if (filterName.trim()) {
      saveFilter(filterName.trim(), currentFilters)
    }
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
      setUser(user)

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, tenant_id')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Error loading profile:', profileError)
        setError('Error al cargar tu perfil. Intenta cerrar sesion y volver a entrar.')
        setLoading(false)
        return
      }

      if (!profile?.tenant_id) {
        setError('No se encontro tu inmobiliaria. Por favor contacta a soporte.')
        setLoading(false)
        return
      }

      const { data, error: propertiesError } = await supabase
        .from('properties')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })

      if (propertiesError) {
        console.error('Error loading properties:', propertiesError)
        setError('Error al cargar propiedades.')
        setLoading(false)
        return
      }

      setProperties(data || [])
    } catch (err) {
      console.error('Error loading:', err)
      setError('Error de conexion.')
    } finally {
      setLoading(false)
    }
  }

  const filteredProperties = properties.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.city?.toLowerCase().includes(search.toLowerCase()) ||
      p.address?.toLowerCase().includes(search.toLowerCase())
    const matchesType = filterType === 'all' || p.property_type === filterType
    const matchesDeal = filterDeal === 'all' || p.deal_type === filterDeal
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus
    return matchesSearch && matchesType && matchesDeal && matchesStatus
  }).sort((a, b) => {
    switch (sortBy) {
      case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'price_high': return b.price - a.price
      case 'price_low': return a.price - b.price
      case 'title': return a.title.localeCompare(b.title)
      default: return 0
    }
  })

  const formatPrice = (price: number, dealType: string) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price)
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      apartment: 'Apartamento',
      house: 'Casa',
      penthouse: 'Atico',
      villa: 'Villa',
      office: 'Oficina',
      commercial: 'Local',
      land: 'Terreno',
      garage: 'Garaje',
      storage: 'Trastero'
    }
    return labels[type] || type
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta propiedad?')) return
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (!error) {
      loadData()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">
              Dashboard
            </Link>
            <span className="text-slate-400">/</span>
            <span className="text-slate-900 font-medium">Propiedades</span>
          </div>
          <Link 
            href="/properties/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
          >
            <Plus size={18} />
            Nueva Propiedad
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Total</p>
            <p className="text-2xl font-bold text-slate-900">{properties.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">En Venta</p>
            <p className="text-2xl font-bold text-green-600">{properties.filter(p => p.deal_type === 'sale' && p.status === 'active').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">En Alquiler</p>
            <p className="text-2xl font-bold text-blue-600">{properties.filter(p => p.deal_type === 'rent' && p.status === 'active').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Cerradas</p>
            <p className="text-2xl font-bold text-emerald-600">{properties.filter(p => p.status === 'sold' || p.status === 'rented').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Inactivas</p>
            <p className="text-2xl font-bold text-slate-400">{properties.filter(p => p.status === 'inactive').length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
            >
              <Filter size={18} />
              <span className="font-medium">Filtros</span>
            </button>
            <div className="flex items-center gap-2">
              {savedFilters.length > 0 && (
                <div className="relative">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        const filter = savedFilters.find(f => f.id === e.target.value)
                        if (filter) applyFilter(filter.filters)
                        e.target.value = ''
                      }
                    }}
                    className="pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Filtros guardados</option>
                    {savedFilters.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <Bookmark className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              )}
              <button
                onClick={() => setShowSaveDialog(true)}
                className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50"
                title="Guardar filtros"
              >
                <Save size={14} />
                Guardar
              </button>
            </div>
          </div>

          {showFilters && (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="Buscar por titulo, ciudad o direccion..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="all">Todos los tipos</option>
                  <option value="apartment">Apartamento</option>
                  <option value="house">Casa</option>
                  <option value="penthouse">Atico</option>
                  <option value="villa">villa</option>
                  <option value="office">Oficina</option>
                  <option value="commercial">Local</option>
                  <option value="land">Terreno</option>
                </select>
                <select
                  value={filterDeal}
                  onChange={(e) => setFilterDeal(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="all">Venta y Alquiler</option>
                  <option value="sale">Solo Venta</option>
                  <option value="rent">Solo Alquiler</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activas</option>
                  <option value="inactive">Inactivas</option>
                  <option value="sold">Vendidas</option>
                  <option value="rented">Alquiladas</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="newest">Mas recientes</option>
                  <option value="oldest">Mas antiguas</option>
                  <option value="price_high">Mayor precio</option>
                  <option value="price_low">Menor precio</option>
                  <option value="title">Por titulo</option>
                </select>
              </div>

              {savedFilters.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  {savedFilters.map(f => (
                    <div key={f.id} className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-sm">
                      <button onClick={() => applyFilter(f.filters)} className="text-slate-700 hover:text-blue-600">
                        {f.name}
                      </button>
                      <button onClick={() => deleteFilter(f.id)} className="text-slate-400 hover:text-red-500 ml-1">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="text-sm text-slate-500 mt-2">
            Mostrando {filteredProperties.length} de {properties.length} propiedades
          </p>
        </div>

        {showSaveDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Guardar Filtros</h3>
                <button onClick={() => setShowSaveDialog(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <input
                type="text"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Nombre del filtro (ej: Apartamentos en Madrid)"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none mb-4"
                autoFocus
              />
              <div className="bg-slate-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-slate-500 mb-2">Filtros a guardar:</p>
                <div className="flex flex-wrap gap-1">
                  {search && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{search}</span>}
                  {filterType !== 'all' && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{filterType}</span>}
                  {filterDeal !== 'all' && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{filterDeal}</span>}
                  {filterStatus !== 'all' && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{filterStatus}</span>}
                  <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{sortBy}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveFilter}
                  disabled={!filterName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Properties Grid */}
        {filteredProperties.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Building2 className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No hay propiedades</h3>
            <p className="text-slate-500 mb-4">Comienza agregando tu primera propiedad</p>
            <Link 
              href="/properties/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
            >
              <Plus size={18} />
              Nueva Propiedad
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6">
            {filteredProperties.map((property) => (
              <div key={property.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition">
                <div className="h-48 bg-slate-200 relative">
                  <button 
                    onClick={() => {
                      if (property.images && property.images.length > 0) {
                        setGalleryImages(property.images)
                        setGalleryIndex(0)
                        setGalleryOpen(true)
                      }
                    }}
                    className="block h-full w-full"
                    disabled={!property.images || property.images.length === 0}
                  >
                    {property.images && property.images.length > 0 ? (
                      <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="text-slate-400" size={48} />
                      </div>
                    )}
                  </button>
                  {property.images && property.images.length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-1 rounded-lg text-xs">
                      +{property.images.length - 1} fotos
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      property.deal_type === 'sale' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
                    }`}>
                      {property.deal_type === 'sale' ? 'Venta' : 'Alquiler'}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3 flex gap-2">
                    <Link 
                      href={`/properties/${property.id}`}
                      className="p-2 bg-white rounded-lg hover:bg-slate-100 transition"
                    >
                      <Edit size={16} className="text-slate-600" />
                    </Link>
                    <button 
                      onClick={() => handleDelete(property.id)}
                      className="p-2 bg-white rounded-lg hover:bg-red-50 transition"
                    >
                      <Trash2 size={16} className="text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 mb-1 truncate">{property.title}</h3>
                  {property.address && (
                    <p className="text-sm text-slate-500 flex items-center gap-1 mb-3">
                      <MapPin size={14} />
                      {property.city}, {property.address}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                    {property.rooms && (
                      <span className="flex items-center gap-1">
                        <Bed size={14} /> {property.rooms}
                      </span>
                    )}
                    {property.bathrooms && (
                      <span className="flex items-center gap-1">
                        <Bath size={14} /> {property.bathrooms}
                      </span>
                    )}
                    {property.area_sqm && (
                      <span className="flex items-center gap-1">
                        <Square size={14} /> {property.area_sqm}m2
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-bold text-blue-600">
                    {formatPrice(property.price, property.deal_type)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Gallery Modal */}
      {galleryOpen && galleryImages.length > 0 && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <button
            onClick={() => setGalleryOpen(false)}
            className="absolute top-4 right-4 p-2 text-white hover:text-slate-300 transition"
          >
            <X size={32} />
          </button>
          
          {galleryImages.length > 1 && (
            <>
              <button
                onClick={() => setGalleryIndex(galleryIndex > 0 ? galleryIndex - 1 : galleryImages.length - 1)}
                className="absolute left-4 p-2 text-white hover:text-slate-300 transition"
              >
                <ChevronLeft size={48} />
              </button>
              <button
                onClick={() => setGalleryIndex(galleryIndex < galleryImages.length - 1 ? galleryIndex + 1 : 0)}
                className="absolute right-4 p-2 text-white hover:text-slate-300 transition"
              >
                <ChevronRight size={48} />
              </button>
            </>
          )}
          
          <img
            src={galleryImages[galleryIndex]}
            alt=""
            className="max-w-full max-h-[85vh] object-contain"
          />
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm flex items-center gap-2">
            <ZoomIn size={16} />
            {galleryIndex + 1} / {galleryImages.length}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, Upload, X, AlertCircle, CheckCircle, Image as ImageIcon, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { PROPERTY_TYPES, DEAL_TYPES } from '@/features/properties/types'

export default function PropertyFormPage() {
  const router = useRouter()
  const params = useParams()
  const isEditing = params.id && params.id !== 'new'
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)

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
    country: 'España',
    area_sqm: '',
    rooms: '',
    bathrooms: '',
    parking: '0',
    status: 'active' as const,
  })

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

      setTenantId(profile.tenant_id)

      if (isEditing) {
        const { data: property, error: propertyError } = await supabase
          .from('properties')
          .select('*')
          .eq('id', params.id)
          .eq('tenant_id', profile.tenant_id)
          .single()

        if (propertyError || !property) {
          console.error('Error loading property:', propertyError)
          setError('Propiedad no encontrada o no tienes permisos.')
          setLoading(false)
          return
        }

        if (property) {
          setForm({
            title: property.title || '',
            description: property.description || '',
            property_type: property.property_type,
            deal_type: property.deal_type,
            price: property.price?.toString() || '',
            address: property.address || '',
            city: property.city || '',
            state: property.state || '',
            postal_code: property.postal_code || '',
            country: property.country || 'España',
            area_sqm: property.area_sqm?.toString() || '',
            rooms: property.rooms?.toString() || '',
            bathrooms: property.bathrooms?.toString() || '',
            parking: property.parking?.toString() || '0',
            status: property.status,
          })
          setImages(property.images || [])
        }
      }
    } catch (err) {
      console.error('Error:', err)
      setError('Error de conexion. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)

    if (!tenantId) {
      setError('No se encontro el tenant')
      setSaving(false)
      return
    }

    if (!form.title.trim()) {
      setError('El titulo es requerido')
      setSaving(false)
      return
    }

    if (!form.price || parseFloat(form.price) <= 0) {
      setError('El precio debe ser mayor a 0')
      setSaving(false)
      return
    }

    const data = {
      tenant_id: tenantId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      property_type: form.property_type,
      deal_type: form.deal_type,
      price: parseFloat(form.price),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      postal_code: form.postal_code.trim() || null,
      country: form.country,
      area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null,
      rooms: form.rooms ? parseInt(form.rooms) : null,
      bathrooms: form.bathrooms ? parseInt(form.bathrooms) : null,
      parking: form.parking ? parseInt(form.parking) : 0,
      images: images,
      status: form.status,
      agent_id: user?.id,
    }

    let result, insertError

    if (isEditing) {
      const response = await supabase
        .from('properties')
        .update(data)
        .eq('id', params.id)
        .eq('tenant_id', tenantId)
        .select('id')
        .single()
      result = response.data
      insertError = response.error
    } else {
      const response = await supabase
        .from('properties')
        .insert(data)
        .select('id')
        .single()
      result = response.data
      insertError = response.error
    }

    if (insertError) {
      console.error('Error saving property:', insertError)
      setError(insertError.message || 'Error al guardar la propiedad')
      setSaving(false)
      return
    }

    if (!result?.id) {
      setError('Error al guardar. Intenta nuevamente.')
      setSaving(false)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/properties')
      router.refresh()
    }, 1000)
  }

  const [newImageUrl, setNewImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)

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
    try {
      const uploadedUrls: string[] = []
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`
        const filePath = `properties/${tenantId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(filePath, file)

        if (uploadError) {
          console.error('Error uploading:', uploadError)
          continue
        }

        const { data: { publicUrl } } = supabase.storage
          .from('property-images')
          .getPublicUrl(filePath)

        uploadedUrls.push(publicUrl)
      }

      if (uploadedUrls.length > 0) {
        setImages([...images, ...uploadedUrls])
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
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
            <Link href="/properties" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft size={20} />
            </Link>
            <span className="text-slate-900 font-medium">
              {isEditing ? 'Editar Propiedad' : 'Nueva Propiedad'}
            </span>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="p-6 max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 flex items-center gap-2">
              <CheckCircle size={18} />
              <span>Propiedad guardada correctamente!</span>
            </div>
          )}

          {/* Basic Info */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Informacion Basica</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Titulo *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({...form, title: e.target.value})}
                  placeholder="Ej: Apartamento centrico 3 habitaciones"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
                <select
                  value={form.property_type}
                  onChange={(e) => setForm({...form, property_type: e.target.value as any})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {PROPERTY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Operacion</label>
                <select
                  value={form.deal_type}
                  onChange={(e) => setForm({...form, deal_type: e.target.value as any})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {DEAL_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Precio (EUR) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({...form, price: e.target.value})}
                  placeholder="150000"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({...form, status: e.target.value as any})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                  <option value="sold">Vendida</option>
                  <option value="rented">Alquilada</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Descripcion</label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({...form, description: e.target.value})}
                  placeholder="Describe la propiedad..."
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Ubicacion</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Direccion</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({...form, address: e.target.value})}
                  placeholder="Calle, numero"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ciudad</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({...form, city: e.target.value})}
                  placeholder="Madrid"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Codigo Postal</label>
                <input
                  type="text"
                  value={form.postal_code}
                  onChange={(e) => setForm({...form, postal_code: e.target.value})}
                  placeholder="28001"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Caracteristicas</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">m2</label>
                <input
                  type="number"
                  min="0"
                  value={form.area_sqm}
                  onChange={(e) => setForm({...form, area_sqm: e.target.value})}
                  placeholder="85"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Habitaciones</label>
                <input
                  type="number"
                  min="0"
                  value={form.rooms}
                  onChange={(e) => setForm({...form, rooms: e.target.value})}
                  placeholder="3"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Banos</label>
                <input
                  type="number"
                  min="0"
                  value={form.bathrooms}
                  onChange={(e) => setForm({...form, bathrooms: e.target.value})}
                  placeholder="2"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Garajes</label>
                <input
                  type="number"
                  min="0"
                  value={form.parking}
                  onChange={(e) => setForm({...form, parking: e.target.value})}
                  placeholder="1"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Images */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Imagenes</h3>
            <div className="flex flex-wrap gap-4">
              {images.map((url, i) => (
                <div key={i} className="relative w-32 h-32 rounded-xl overflow-hidden border border-slate-200 group">
                  <button
                    type="button"
                    onClick={() => { setGalleryIndex(i); setGalleryOpen(true) }}
                    className="w-full h-full"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition">
                      <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition" />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {images.length === 0 && (
                <div className="w-32 h-32 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                  <ImageIcon size={32} className="text-slate-300" />
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex gap-2">
                <label
                  htmlFor="file-upload"
                  className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition flex items-center gap-2 cursor-pointer"
                >
                  <Upload size={16} />
                  Subir desde PC
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <input
                  type="url"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleImageUrl())}
                  placeholder="O pega una URL de imagen..."
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={handleImageUrl}
                  disabled={!newImageUrl}
                  className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"
                >
                  <Upload size={16} />
                  Agregar
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {uploading ? 'Subiendo imagenes...' : 'Puedes subir imagenes desde tu PC o pegar una URL'}
              </p>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link
              href="/properties"
              className="px-6 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 transition"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={18} />
              {saving ? 'Guardando...' : 'Guardar Propiedad'}
            </button>
          </div>
        </form>
      </main>

      {/* Image Gallery Modal */}
      {galleryOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <button
            onClick={() => setGalleryOpen(false)}
            className="absolute top-4 right-4 p-2 text-white hover:text-slate-300 transition"
          >
            <X size={32} />
          </button>
          
          <button
            onClick={() => setGalleryIndex(galleryIndex > 0 ? galleryIndex - 1 : images.length - 1)}
            className="absolute left-4 p-2 text-white hover:text-slate-300 transition"
          >
            <ChevronLeft size={48} />
          </button>
          
          <img
            src={images[galleryIndex]}
            alt=""
            className="max-w-full max-h-[85vh] object-contain"
          />
          
          <button
            onClick={() => setGalleryIndex(galleryIndex < images.length - 1 ? galleryIndex + 1 : 0)}
            className="absolute right-4 p-2 text-white hover:text-slate-300 transition"
          >
            <ChevronRight size={48} />
          </button>
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
            {galleryIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  )
}

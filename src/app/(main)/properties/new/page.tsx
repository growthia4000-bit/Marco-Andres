'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, Upload, X, AlertCircle, CheckCircle, ImagePlus, Loader2, Image as ImageIcon, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { PROPERTY_TYPES, DEAL_TYPES } from '@/features/properties/types'

export default function NewPropertyPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

    const { data: result, error: insertError } = await supabase
      .from('properties')
      .insert(data)
      .select('id')
      .single()

    if (insertError) {
      console.error('Error inserting property:', insertError)
      setError(insertError.message || 'Error al guardar la propiedad')
      setSaving(false)
      return
    }

    if (!result?.id) {
      setError('Error al crear la propiedad. Intenta nuevamente.')
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

  const handleImageUrl = () => {
    if (newImageUrl && newImageUrl.startsWith('http')) {
      setImages([...images, newImageUrl])
      setNewImageUrl('')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setUploadProgress('')

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress(`Subiendo ${i + 1}/${files.length}...`)

        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Error uploading file')
        }

        const data = await response.json()
        setImages(prev => [...prev, data.url])
      }
    } catch (err: any) {
      setError(err.message || 'Error al subir imagen')
    } finally {
      setUploading(false)
      setUploadProgress('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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
            <span className="text-slate-900 font-medium">Nueva Propiedad</span>
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
            
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-blue-400 transition cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <ImagePlus className="mx-auto text-slate-400 mb-2" size={32} />
                <p className="text-sm font-medium text-slate-700">Subir imagenes</p>
                <p className="text-xs text-slate-500 mt-1">JPG, PNG, WebP hasta 10MB</p>
                {uploading && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Loader2 size={16} className="animate-spin text-blue-500" />
                    <span className="text-xs text-slate-500">{uploadProgress}</span>
                  </div>
                )}
              </div>
              
              <div className="border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-medium text-slate-700 mb-2">O pega una URL</p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleImageUrl())}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleImageUrl}
                    disabled={!newImageUrl}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition disabled:opacity-50 flex items-center gap-1 text-sm"
                  >
                    <Upload size={14} />
                    Agregar
                  </button>
                </div>
              </div>
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

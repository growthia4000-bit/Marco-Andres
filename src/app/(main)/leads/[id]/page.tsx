'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  ArrowLeft, Phone, Mail, DollarSign, MapPin, Calendar, 
  Edit, Trash2, MessageSquare, Eye, AlertCircle, User,
  Building2, Clock, Send
} from 'lucide-react'
import { LEAD_STATUSES, type Lead, type LeadStatus } from '@/features/leads/types'

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500',
  contacted: 'bg-amber-500',
  qualified: 'bg-cyan-500',
  visit: 'bg-green-500',
  negotiation: 'bg-purple-500',
  won: 'bg-emerald-500',
  lost: 'bg-red-500',
}

const STATUS_BG: Record<string, string> = {
  new: 'bg-blue-50 border-blue-200',
  contacted: 'bg-amber-50 border-amber-200',
  qualified: 'bg-cyan-50 border-cyan-200',
  visit: 'bg-green-50 border-green-200',
  negotiation: 'bg-purple-50 border-purple-200',
  won: 'bg-emerald-50 border-emerald-200',
  lost: 'bg-red-50 border-red-200',
}

export default function LeadDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [lead, setLead] = useState<Lead | null>(null)
  const [interactions, setInteractions] = useState<any[]>([])
  const [error, setError] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [tenantEmail, setTenantEmail] = useState<string>('')
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

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
      setCurrentUser(user)

      const { data: userProfile } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (!userProfile?.tenant_id) {
        setError('Error al cargar tu perfil.')
        setLoading(false)
        return
      }

      const { data: tenantData } = await supabase
        .from('tenants')
        .select('email')
        .eq('id', userProfile.tenant_id)
        .single()

      if (tenantData?.email) {
        setTenantEmail(tenantData.email)
      }

      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', params.id)
        .eq('tenant_id', userProfile.tenant_id)
        .single()

      if (leadError || !leadData) {
        console.error('Error loading lead:', leadError)
        setError('Lead no encontrado o no tienes permisos.')
        setLoading(false)
        return
      }

      setLead(leadData)

      const { data: interactionsData } = await supabase
        .from('interactions')
        .select('*')
        .eq('lead_id', params.id)
        .order('created_at', { ascending: false })

      setInteractions(interactionsData || [])
    } catch (err) {
      console.error('Error:', err)
      setError('Error al cargar el lead.')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (newStatus: LeadStatus) => {
    if (!lead) return
    
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', lead.id)
      .eq('tenant_id', lead.tenant_id)

    if (!error) {
      setLead({ ...lead, status: newStatus })
    }
  }

  const handleAddNote = async () => {
    if (!lead || !newNote.trim() || !currentUser) return
    
    setAddingNote(true)

    const { data, error } = await supabase
      .from('interactions')
      .insert({
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        user_id: currentUser.id,
        type: 'note',
        content: newNote.trim(),
      })
      .select()
      .single()

    if (!error && data) {
      setInteractions([data, ...interactions])
      setNewNote('')
    }

    setAddingNote(false)
  }

  const handleDelete = async () => {
    if (!lead) return
    if (!confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return

    const { error } = await supabase.from('leads').delete().eq('id', lead.id)

    if (!error) {
      router.push('/leads')
    }
  }

  const formatBudget = (min: number | null, max: number | null) => {
    if (!min && !max) return 'No definido'
    const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    if (min && max) return `${formatter.format(min)} - ${formatter.format(max)}`
    if (min) return `Desde ${formatter.format(min)}`
    if (max) return `Hasta ${formatter.format(max)}`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando...</div>
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Lead no encontrado</h2>
          <p className="text-slate-500 mb-4">{error}</p>
          <Link href="/leads" className="text-blue-500 hover:underline">
            Volver a Leads
          </Link>
        </div>
      </div>
    )
  }

  const statusInfo = LEAD_STATUSES.find(s => s.value === lead.status) || LEAD_STATUSES[0]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/leads" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft size={20} />
            </Link>
            <span className="text-slate-900 font-medium">Detalle del Lead</span>
          </div>
          <div className="flex items-center gap-2">
            <Link 
              href={`/leads/${lead.id}/edit`}
              className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition"
            >
              <Edit size={20} />
            </Link>
            <button 
              onClick={handleDelete}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Lead Info */}
          <div className="col-span-2 space-y-6">
            {/* Header Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-2xl">
                      {lead.first_name[0]?.toUpperCase()}{lead.last_name?.[0]?.toUpperCase() || ''}
                    </span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                      {lead.first_name} {lead.last_name}
                    </h1>
                    <p className="text-slate-500 flex items-center gap-2 mt-1">
                      <Phone size={14} /> {lead.phone}
                      {lead.email && (
                        <>
                          <span>•</span>
                          <Mail size={14} /> {lead.email}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-xl ${STATUS_BG[lead.status]} border`}>
                  <select
                    value={lead.status}
                    onChange={(e) => updateStatus(e.target.value as LeadStatus)}
                    className={`font-semibold bg-transparent outline-none cursor-pointer ${STATUS_COLORS[lead.status].replace('bg-', 'text-')}`}
                  >
                    {LEAD_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-slate-500 text-sm flex items-center gap-1">
                    <DollarSign size={14} /> Presupuesto
                  </p>
                  <p className="font-semibold text-slate-900 mt-1">
                    {formatBudget(lead.budget_min, lead.budget_max)}
                  </p>
                </div>
                {lead.preferred_location && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-slate-500 text-sm flex items-center gap-1">
                      <MapPin size={14} /> Zona Preferida
                    </p>
                    <p className="font-semibold text-slate-900 mt-1">{lead.preferred_location}</p>
                  </div>
                )}
                {lead.source && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-slate-500 text-sm flex items-center gap-1">
                      <Building2 size={14} /> Origen
                    </p>
                    <p className="font-semibold text-slate-900 mt-1 capitalize">{lead.source}</p>
                  </div>
                )}
              </div>

              {lead.notes && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-700 font-medium">Notas</p>
                  <p className="text-slate-700 mt-1">{lead.notes}</p>
                </div>
              )}
            </div>

            {/* Interactions */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <MessageSquare size={20} />
                Historial de Interacciones
              </h2>

              {/* Add Note */}
              <div className="mb-6">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Añadir una nota..."
                  rows={2}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addingNote}
                    className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send size={16} />
                    {addingNote ? 'Guardando...' : 'Añadir Nota'}
                  </button>
                </div>
              </div>

              {/* Interactions List */}
              {interactions.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="mx-auto text-slate-300 mb-3" size={32} />
                  <p className="text-slate-500">No hay interacciones registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {interactions.map((interaction) => (
                    <div key={interaction.id} className="flex gap-4 p-4 bg-slate-50 rounded-xl">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <MessageSquare size={18} className="text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-900 capitalize">
                            {interaction.type === 'note' ? 'Nota' : interaction.type}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={12} /> {formatDate(interaction.created_at)}
                          </span>
                        </div>
                        <p className="text-slate-600">{interaction.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Acciones Rápidas</h3>
              <div className="space-y-2">
                <a
                  href={`tel:${lead.phone}`}
                  className="w-full flex items-center gap-3 p-3 bg-green-50 rounded-xl hover:bg-green-100 transition text-green-700"
                >
                  <Phone size={18} className="text-green-500" />
                  <span>Llamar {lead.phone}</span>
                </a>
                {lead.email && (
                  <a
                    href={`mailto:${lead.email}?subject=Contacto desde InmoCRM&from=${tenantEmail}&body=Hola ${lead.first_name},%0D%0A%0D%0A`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 p-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition text-blue-700"
                  >
                    <Mail size={18} className="text-blue-500" />
                    <span>Enviar Email</span>
                  </a>
                )}
                <Link
                  href={`/appointments/new?lead_id=${lead.id}&lead_name=${encodeURIComponent(lead.first_name + ' ' + lead.last_name)}&lead_phone=${encodeURIComponent(lead.phone || '')}`}
                  className="w-full flex items-center gap-3 p-3 bg-purple-50 rounded-xl hover:bg-purple-100 transition text-purple-700"
                >
                  <Calendar size={18} className="text-purple-500" />
                  <span>Agendar Cita</span>
                </Link>
                {lead.phone && (
                  <a
                    href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 p-3 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition text-emerald-700"
                  >
                    <MessageSquare size={18} className="text-emerald-500" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Información</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Creado</span>
                  <span className="text-slate-700">{formatDate(lead.created_at)}</span>
                </div>
                {lead.preferred_type && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tipo Preferido</span>
                    <span className="text-slate-700 capitalize">{lead.preferred_type}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

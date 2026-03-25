'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Phone, Mail, User, DollarSign, MapPin, Edit, Trash2, Eye, AlertCircle, Save, Bookmark, X } from 'lucide-react'
import { LEAD_STATUSES, type Lead, type LeadStatus } from '@/features/leads/types'
import { useSavedFilters } from '@/hooks/useSavedFilters'

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

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()
  const { savedFilters, showSaveDialog, setShowSaveDialog, filterName, setFilterName, saveFilter, deleteFilter } = useSavedFilters('leads')

  const currentFilters = { search, filterStatus }

  const applyFilter = (filters: Record<string, string | undefined>) => {
    setSearch(filters.search || '')
    setFilterStatus(filters.filterStatus || 'all')
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

      const { data, error: leadsError } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })

      if (leadsError) {
        console.error('Error loading leads:', leadsError)
        setError('Error al cargar leads.')
        setLoading(false)
        return
      }

      setLeads(data || [])
    } catch (err) {
      console.error('Error loading:', err)
      setError('Error de conexion.')
    } finally {
      setLoading(false)
    }
  }

  const filteredLeads = leads.filter(l => {
    const fullName = `${l.first_name} ${l.last_name || ''}`.toLowerCase()
    const matchesSearch = !search || fullName.includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search)
    const matchesStatus = filterStatus === 'all' || l.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const leadsByStatus = (status: LeadStatus) => 
    filteredLeads.filter(l => l.status === status)

  const formatBudget = (min: number | null, max: number | null) => {
    if (!min && !max) return 'No definido'
    const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    if (min && max) return `${formatter.format(min)} - ${formatter.format(max)}`
    if (min) return `Desde ${formatter.format(min)}`
    if (max) return `Hasta ${formatter.format(max)}`
  }

  const updateLeadStatus = async (leadId: string, newStatus: LeadStatus) => {
    const { error } = await supabase.from('leads').update({ status: newStatus }).eq('id', leadId)
    if (!error) loadData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar este lead?')) return
    const { error } = await supabase.from('leads').delete().eq('id', id)
    if (!error) loadData()
  }

  const activeStatuses: LeadStatus[] = ['new', 'contacted', 'qualified', 'visit', 'negotiation']
  const closedStatuses: LeadStatus[] = ['won', 'lost']

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
            <span className="text-slate-900 font-medium">Leads</span>
          </div>
          <Link 
            href="/leads/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
          >
            <Plus size={18} />
            Nuevo Lead
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
          {LEAD_STATUSES.map(s => (
            <div key={s.value} className={`rounded-xl border p-4 ${STATUS_BG[s.value]}`}>
              <p className="text-slate-500 text-sm">{s.label}</p>
              <p className={`text-2xl font-bold`}>{leadsByStatus(s.value).length}</p>
            </div>
          ))}
        </div>

        {/* View Toggle & Search */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setView('pipeline')}
                className={`px-4 py-2 rounded-xl font-medium transition ${
                  view === 'pipeline' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Pipeline
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-4 py-2 rounded-xl font-medium transition ${
                  view === 'list' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Lista
              </button>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">Todos</option>
                {LEAD_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
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
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar leads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
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
                placeholder="Nombre del filtro (ej: Leads qualificados)"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none mb-4"
                autoFocus
              />
              <div className="bg-slate-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-slate-500 mb-2">Filtros a guardar:</p>
                <div className="flex flex-wrap gap-1">
                  {search && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{search}</span>}
                  {filterStatus !== 'all' && <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{filterStatus}</span>}
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

        {/* Pipeline View */}
        {view === 'pipeline' && (
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-4">
              {activeStatuses.map(status => {
                const statusInfo = LEAD_STATUSES.find(s => s.value === status)!
                const statusLeads = leadsByStatus(status)
                return (
                  <div key={status} className="w-80 flex-shrink-0">
                    <div className={`rounded-xl border-2 ${STATUS_BG[status]} p-4`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">{statusInfo.label}</h3>
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium text-white ${STATUS_COLORS[status]}`}>
                          {statusLeads.length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {statusLeads.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-4">Sin leads</p>
                        ) : (
                          statusLeads.map(lead => (
                            <div key={lead.id} className="bg-white rounded-xl border border-slate-200 p-3 hover:shadow-md transition cursor-pointer" onClick={() => router.push(`/leads/${lead.id}`)}>
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <p className="font-medium text-slate-900">{lead.first_name} {lead.last_name}</p>
                                  <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Phone size={10} /> {lead.phone}
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={(e) => { e.stopPropagation(); router.push(`/leads/${lead.id}`) }} className="p-1 hover:bg-blue-50 rounded">
                                    <Eye size={14} className="text-blue-500" />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); router.push(`/leads/${lead.id}/edit`) }} className="p-1 hover:bg-slate-100 rounded">
                                    <Edit size={14} className="text-slate-400" />
                                  </button>
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 space-y-1">
                                <p className="flex items-center gap-1">
                                  <DollarSign size={10} /> {formatBudget(lead.budget_min, lead.budget_max)}
                                </p>
                                {lead.preferred_location && (
                                  <p className="flex items-center gap-1">
                                    <MapPin size={10} /> {lead.preferred_location}
                                  </p>
                                )}
                              </div>
                              {lead.source && (
                                <span className="inline-block mt-2 px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">
                                  {lead.source}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* List View */}
        {view === 'list' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {filteredLeads.length === 0 ? (
              <div className="p-12 text-center">
                <User className="mx-auto text-slate-300 mb-4" size={48} />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No hay leads</h3>
                <p className="text-slate-500 mb-4">Comienza agregando tu primer lead</p>
                <Link 
                  href="/leads/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
                >
                  <Plus size={18} />
                  Nuevo Lead
                </Link>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Nombre</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Contacto</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Presupuesto</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Estado</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Origen</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map(lead => {
                    const statusInfo = LEAD_STATUSES.find(s => s.value === lead.status)!
                    return (
                      <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-blue-500">
                            {lead.first_name} {lead.last_name}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-600 flex items-center gap-1"><Phone size={14} /> {lead.phone}</p>
                          {lead.email && <p className="text-sm text-slate-500 flex items-center gap-1"><Mail size={14} /> {lead.email}</p>}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatBudget(lead.budget_min, lead.budget_max)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium text-white ${STATUS_COLORS[lead.status]}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {lead.source || '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/leads/${lead.id}`} className="p-2 hover:bg-blue-50 rounded-lg">
                              <Eye size={16} className="text-blue-500" />
                            </Link>
                            <Link href={`/leads/${lead.id}/edit`} className="p-2 hover:bg-slate-100 rounded-lg">
                              <Edit size={16} className="text-slate-500" />
                            </Link>
                            <button onClick={() => handleDelete(lead.id)} className="p-2 hover:bg-red-50 rounded-lg">
                              <Trash2 size={16} className="text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

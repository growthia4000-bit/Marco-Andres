'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AlertCircle,
  Bookmark,
  DollarSign,
  Edit,
  Eye,
  Filter,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import { LEAD_STATUSES, type Lead, type LeadStatus } from '@/features/leads/types'
import { useSavedFilters } from '@/hooks/useSavedFilters'
import { useI18n } from '@/i18n/I18nProvider'
import { getLeadSourceLabel, getLeadStatusLabel } from '@/i18n/pageLabels'

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500',
  contacted: 'bg-amber-500',
  qualified: 'bg-cyan-500',
  visit: 'bg-emerald-500',
  negotiation: 'bg-violet-500',
  won: 'bg-emerald-600',
  lost: 'bg-rose-500',
}

const STATUS_BG: Record<string, string> = {
  new: 'border-blue-200 bg-blue-50',
  contacted: 'border-amber-200 bg-amber-50',
  qualified: 'border-cyan-200 bg-cyan-50',
  visit: 'border-emerald-200 bg-emerald-50',
  negotiation: 'border-violet-200 bg-violet-50',
  won: 'border-emerald-200 bg-emerald-50',
  lost: 'border-rose-200 bg-rose-50',
}

const KPI_ICONS = [Users, Phone, MessageSquareText, Eye, DollarSign] as const

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [error, setError] = useState('')
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null)
  const pipelineContentRef = useRef<HTMLDivElement | null>(null)
  const pipelineScrollbarRef = useRef<HTMLDivElement | null>(null)
  const pipelineScrollWidthRef = useRef(0)
  const pipelineSyncingRef = useRef(false)
  const [pipelineScrollWidth, setPipelineScrollWidth] = useState(0)
  const router = useRouter()
  const supabase = createClient()
  const { savedFilters, showSaveDialog, setShowSaveDialog, filterName, setFilterName, saveFilter, deleteFilter } = useSavedFilters('leads')
  const { t, formatCurrency } = useI18n()

  const currentFilters = { search, filterStatus }
  const activeStatuses: LeadStatus[] = ['new', 'contacted', 'qualified', 'visit', 'negotiation']
  const activeQuickFilter = activeStatuses.includes(filterStatus as LeadStatus) ? (filterStatus as LeadStatus) : null
  const hasActiveFilters = Boolean(search) || filterStatus !== 'all'

  const applyFilter = (filters: Record<string, string | undefined>) => {
    setSearch(filters.search || '')
    setFilterStatus(filters.filterStatus || 'all')
  }

  const handleSaveFilter = () => {
    if (filterName.trim()) saveFilter(filterName.trim(), currentFilters)
  }

  const handleQuickFilter = (status: LeadStatus) => {
    setFilterStatus((current) => current === status ? 'all' : status)
  }

  useEffect(() => {
    loadData()
  }, [])

  const syncPipelineScroll = (source: 'board' | 'bar') => {
    if (pipelineSyncingRef.current) return

    const board = pipelineScrollRef.current
    const bar = pipelineScrollbarRef.current
    if (!board || !bar) return

    pipelineSyncingRef.current = true
    if (source === 'board') bar.scrollLeft = board.scrollLeft
    else board.scrollLeft = bar.scrollLeft
    requestAnimationFrame(() => {
      pipelineSyncingRef.current = false
    })
  }

  const loadData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

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
        setError(t('leadsPageExtra.errors.profile'))
        setLoading(false)
        return
      }

      if (!profile?.tenant_id) {
        setError(t('leadsPageExtra.errors.tenant'))
        setLoading(false)
        return
      }

      const { data, error: leadsError } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })

      if (leadsError) {
        setError(t('leadsPageExtra.errors.load'))
        setLoading(false)
        return
      }

      setLeads(data || [])
    } catch (err) {
      console.error('Error loading:', err)
      setError(t('leadsPageExtra.errors.connection'))
    } finally {
      setLoading(false)
    }
  }

  const filteredLeads = leads.filter((lead) => {
    const fullName = `${lead.first_name} ${lead.last_name || ''}`.toLowerCase()
    const query = search.toLowerCase()
    const matchesSearch = !search || fullName.includes(query) || lead.email?.toLowerCase().includes(query) || lead.phone.includes(search)
    const matchesStatus = filterStatus === 'all' || lead.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const kpiLeadsByStatus = (status: LeadStatus) => leads.filter((lead) => lead.status === status)
  const visibleLeadsByStatus = (status: LeadStatus) => filteredLeads.filter((lead) => lead.status === status)

  useEffect(() => {
    if (view !== 'pipeline' || filteredLeads.length === 0) return

    const updatePipelineScrollbar = () => {
      const scrollContainer = pipelineScrollRef.current
      const content = pipelineContentRef.current
      if (!scrollContainer || !content) return
      pipelineScrollWidthRef.current = content.scrollWidth
      setPipelineScrollWidth(content.scrollWidth)
    }

    updatePipelineScrollbar()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updatePipelineScrollbar)
      return () => window.removeEventListener('resize', updatePipelineScrollbar)
    }

    const observer = new ResizeObserver(updatePipelineScrollbar)
    if (pipelineScrollRef.current) observer.observe(pipelineScrollRef.current)
    if (pipelineContentRef.current) observer.observe(pipelineContentRef.current)

    return () => observer.disconnect()
  }, [view, filteredLeads.length])

  const formatBudget = (min: number | null, max: number | null) => {
    if (!min && !max) return t('leadsPageExtra.noBudget')
    if (min && max) return `${formatCurrency(min)} - ${formatCurrency(max)}`
    if (min) return t('common.from', { value: formatCurrency(min) })
    return t('common.until', { value: formatCurrency(max ?? 0) })
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('leadsPageExtra.deleteConfirm'))) return
    const { error: deleteError } = await supabase.from('leads').delete().eq('id', id)
    if (!deleteError) loadData()
  }

  const resetFilters = () => {
    setSearch('')
    setFilterStatus('all')
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>
  }

  const renderEmptyState = () => (
    <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
      <User className="mx-auto mb-4 text-slate-300" size={48} />
      <h3 className="mb-2 text-lg font-semibold text-slate-900">{t('leadsPageExtra.noLeads')}</h3>
      <p className="mb-4 text-slate-500">{leads.length > 0 && hasActiveFilters ? t('leadsPageExtra.emptyFiltered') : t('leadsPageExtra.first')}</p>
      {leads.length > 0 && hasActiveFilters ? (
        <button onClick={resetFilters} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 font-medium transition hover:bg-slate-50">
          <X size={18} />
          {t('leadsPageExtra.clearFilters')}
        </button>
      ) : (
        <Link href="/leads/new" className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700">
          <Plus size={18} />
          {t('leadsPageExtra.new')}
        </Link>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <section className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_40%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">{t('leadsPageExtra.dashboard')}</Link>
                  <span className="text-slate-300">/</span>
                  <span className="font-medium text-slate-900">{t('leadsPageExtra.title')}</span>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('leadsPageExtra.title')}</h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('leadsPageExtra.subtitle')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={loadData} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                  <RefreshCcw size={16} />
                  {t('tasksPage.refresh')}
                </button>
                <Link href="/leads/new" className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700">
                  <Plus size={18} />
                  {t('leadsPageExtra.new')}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {error && <div className="mb-6 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600"><AlertCircle size={18} className="mt-0.5 flex-shrink-0" /><span>{error}</span></div>}

        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {LEAD_STATUSES.slice(0, 5).map((status, index) => {
            const Icon = KPI_ICONS[index]
            const isActive = activeQuickFilter === status.value
            return (
              <button
                key={status.value}
                type="button"
                onClick={() => handleQuickFilter(status.value)}
                aria-pressed={isActive}
                className={`rounded-3xl border p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${STATUS_BG[status.value]} ${isActive ? 'ring-2 ring-slate-300 border-slate-300' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-500">{getLeadStatusLabel(t, status.value)}</p>
                    <p className="text-3xl font-semibold tracking-tight text-slate-900">{kpiLeadsByStatus(status.value).length}</p>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm ${STATUS_COLORS[status.value]}`}>
                    <Icon size={18} />
                  </div>
                </div>
              </button>
            )
          })}
        </section>

        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                  <Filter size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-950">{t('leadsPageExtra.controlsTitle')}</h2>
                  <p className="text-sm text-slate-500">{t('leadsPageExtra.controlsSubtitle')}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setView('pipeline')} className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${view === 'pipeline' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t('leadsPageExtra.pipeline')}</button>
                <button onClick={() => setView('list')} className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${view === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t('leadsPageExtra.list')}</button>
                <button onClick={() => setFilterStatus('all')} className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${filterStatus === 'all' ? 'bg-slate-900 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{t('leadsPageExtra.all')}</button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="relative xl:col-span-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder={t('leadsPageExtra.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" />
              </div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 xl:col-span-3">
                <option value="all">{t('leadsPageExtra.all')}</option>
                {LEAD_STATUSES.map((status) => <option key={status.value} value={status.value}>{getLeadStatusLabel(t, status.value)}</option>)}
              </select>
              <div className="flex flex-wrap items-center gap-2 xl:col-span-5 xl:justify-end">
                {savedFilters.length > 0 && (
                  <div className="relative min-w-[220px] flex-1 xl:flex-none">
                    <select onChange={(e) => { if (e.target.value) { const filter = savedFilters.find((f) => f.id === e.target.value); if (filter) applyFilter(filter.filters); e.target.value = '' } }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100">
                      <option value="">{t('leadsPageExtra.savedFilters')}</option>
                      {savedFilters.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <Bookmark className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  </div>
                )}
                <button onClick={() => setShowSaveDialog(true)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50" title={t('leadsPageExtra.saveTitle')}>
                  <Save size={14} />
                  {t('leadsPageExtra.save')}
                </button>
              </div>
            </div>

            {savedFilters.length > 0 && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">{savedFilters.map((f) => <div key={f.id} className="flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-sm"><button onClick={() => applyFilter(f.filters)} className="text-slate-700 hover:text-blue-600">{f.name}</button><button onClick={() => deleteFilter(f.id)} className="ml-1 text-slate-400 hover:text-red-500"><X size={12} /></button></div>)}</div>}
          </div>
        </section>

        {showSaveDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">{t('leadsPageExtra.saveTitle')}</h3><button onClick={() => setShowSaveDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div><input type="text" value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder={t('leadsPageExtra.savePlaceholder')} className="mb-4 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" autoFocus /><div className="mb-4 rounded-xl bg-slate-50 p-3"><p className="mb-2 text-xs text-slate-500">{t('leadsPageExtra.filtersToSave')}</p><div className="flex flex-wrap gap-1">{search && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs">{search}</span>}{filterStatus !== 'all' && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs">{getLeadStatusLabel(t, filterStatus)}</span>}</div></div><div className="flex gap-2"><button onClick={() => setShowSaveDialog(false)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-2 font-medium hover:bg-slate-50">{t('common.cancel')}</button><button onClick={handleSaveFilter} disabled={!filterName.trim()} className="flex-1 rounded-2xl bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{t('common.save')}</button></div></div></div>}

        {filteredLeads.length === 0 && renderEmptyState()}

        {view === 'pipeline' && filteredLeads.length > 0 && (
          <section className="space-y-3">
            <div ref={pipelineScrollRef} onScroll={() => syncPipelineScroll('board')} className="w-full overflow-x-auto overflow-y-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:p-5">
              <div ref={pipelineContentRef} className="flex min-w-max gap-5 items-start pb-2 pr-4">
                {activeStatuses.map((status) => {
                  const statusLeads = visibleLeadsByStatus(status)
                  return (
                    <div key={status} className="w-[336px] flex-shrink-0">
                      <div className={`rounded-3xl border ${STATUS_BG[status]} p-4 shadow-sm`}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-slate-900">{getLeadStatusLabel(t, status)}</h3>
                            <p className="text-xs text-slate-500">{t('leadsPageExtra.pipelineCount', { count: statusLeads.length })}</p>
                          </div>
                          <span className={`inline-flex min-w-8 items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold text-white ${STATUS_COLORS[status]}`}>{statusLeads.length}</span>
                        </div>
                        <div className="max-h-[calc(100vh-24rem)] space-y-3 overflow-y-auto pr-1">
                          {statusLeads.length === 0 ? (
                            <p className="py-6 text-center text-sm text-slate-400">{t('leadsPageExtra.noPipeline')}</p>
                          ) : statusLeads.map((lead) => (
                            <div key={lead.id} className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => router.push(`/leads/${lead.id}`)}>
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-base font-semibold text-slate-900">{lead.first_name} {lead.last_name}</p>
                                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Phone size={11} /> {lead.phone}</p>
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={(e) => { e.stopPropagation(); router.push(`/leads/${lead.id}`) }} className="rounded-xl p-2 transition hover:bg-blue-50"><Eye size={14} className="text-blue-500" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); router.push(`/leads/${lead.id}/edit`) }} className="rounded-xl p-2 transition hover:bg-slate-100"><Edit size={14} className="text-slate-500" /></button>
                                </div>
                              </div>
                              <div className="space-y-2 text-sm text-slate-600">
                                <p className="flex items-center gap-2"><DollarSign size={13} className="text-slate-400" /> {formatBudget(lead.budget_min, lead.budget_max)}</p>
                                {lead.preferred_location && <p className="flex items-center gap-2"><MapPin size={13} className="text-slate-400" /> {lead.preferred_location}</p>}
                                {lead.email && <p className="truncate flex items-center gap-2"><Mail size={13} className="text-slate-400" /> {lead.email}</p>}
                              </div>
                              {lead.source && <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{getLeadSourceLabel(t, lead.source)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {pipelineScrollWidth > 0 ? (
              <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
                <div ref={pipelineScrollbarRef} onScroll={() => syncPipelineScroll('bar')} className="overflow-x-auto overflow-y-hidden">
                  <div style={{ width: pipelineScrollWidthRef.current, height: 1 }} />
                </div>
              </div>
            ) : null}
          </section>
        )}

        {view === 'list' && filteredLeads.length > 0 && (
          <div className="w-full overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[960px] w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">{t('leadsPageExtra.name')}</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">{t('leadsPageExtra.contact')}</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">{t('leadsPageExtra.budget')}</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">{t('leadsPageExtra.status')}</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">{t('leadsPageExtra.source')}</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-slate-600">{t('leadsPageExtra.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                    <td className="px-6 py-4"><Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-blue-600">{lead.first_name} {lead.last_name}</Link></td>
                    <td className="px-6 py-4"><p className="flex items-center gap-2 text-sm text-slate-600"><Phone size={14} /> {lead.phone}</p>{lead.email && <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><Mail size={14} /> {lead.email}</p>}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{formatBudget(lead.budget_min, lead.budget_max)}</td>
                    <td className="px-6 py-4"><span className={`rounded-full px-3 py-1 text-xs font-medium text-white ${STATUS_COLORS[lead.status]}`}>{getLeadStatusLabel(t, lead.status)}</span></td>
                    <td className="px-6 py-4 text-sm text-slate-500">{lead.source ? getLeadSourceLabel(t, lead.source) : '-'}</td>
                    <td className="px-6 py-4 text-right"><div className="flex justify-end gap-2"><Link href={`/leads/${lead.id}`} className="rounded-xl p-2 transition hover:bg-blue-50"><Eye size={16} className="text-blue-500" /></Link><Link href={`/leads/${lead.id}/edit`} className="rounded-xl p-2 transition hover:bg-slate-100"><Edit size={16} className="text-slate-500" /></Link><button onClick={() => handleDelete(lead.id)} className="rounded-xl p-2 transition hover:bg-red-50"><Trash2 size={16} className="text-red-500" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

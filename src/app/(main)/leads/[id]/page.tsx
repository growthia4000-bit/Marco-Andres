'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Phone, Mail, DollarSign, MapPin, Calendar, Edit, Trash2, MessageSquare, AlertCircle, Building2, Clock, Send, Sparkles, Copy, RefreshCw, ExternalLink } from 'lucide-react'
import { type Lead, type LeadStatus } from '@/features/leads/types'
import { useI18n } from '@/i18n/I18nProvider'
import { getLeadSourceLabel, getLeadStatusLabel, getPropertyTypeLabel } from '@/i18n/pageLabels'
import { PageHeader } from '@/components/PageHeader'
import { ensureLeadWhatsAppConversationAction, generateLeadEmailDraftAction, reactivateLeadAction } from './actions'

const STATUS_COLORS: Record<string, string> = { new: 'bg-blue-500', contacted: 'bg-amber-500', qualified: 'bg-cyan-500', visit: 'bg-green-500', negotiation: 'bg-purple-500', won: 'bg-emerald-500', lost: 'bg-red-500' }
const STATUS_BG: Record<string, string> = { new: 'bg-blue-50 border-blue-200', contacted: 'bg-amber-50 border-amber-200', qualified: 'bg-cyan-50 border-cyan-200', visit: 'bg-green-50 border-green-200', negotiation: 'bg-purple-50 border-purple-200', won: 'bg-emerald-50 border-emerald-200', lost: 'bg-red-50 border-red-200' }

export default function LeadDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const { t, locale, formatDate, formatTime, formatCurrency } = useI18n()

  const [loading, setLoading] = useState(true)
  const [lead, setLead] = useState<Lead | null>(null)
  const [interactions, setInteractions] = useState<any[]>([])
  const [error, setError] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [showAiComposer, setShowAiComposer] = useState(false)
  const [generatingAiDraft, setGeneratingAiDraft] = useState(false)
  const [aiDraft, setAiDraft] = useState<{ subject: string; body: string; mode: 'ai' | 'fallback' } | null>(null)
  const [aiDraftSource, setAiDraftSource] = useState<string | null>(null)
  const [aiDraftVariationIndex, setAiDraftVariationIndex] = useState(0)
  const [aiDraftError, setAiDraftError] = useState('')
  const [copiedDraft, setCopiedDraft] = useState(false)
  const [reactivating, setReactivating] = useState(false)
  const [reactivationResult, setReactivationResult] = useState<{ success: boolean; template?: string; error?: string } | null>(null)
  const [openingWhatsAppConversation, setOpeningWhatsAppConversation] = useState(false)
  const [whatsAppConversationError, setWhatsAppConversationError] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUser(user)

      const { data: userProfile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userProfile?.tenant_id) { setError(t('leadDetailExtra.errors.profile')); setLoading(false); return }


      const { data: leadData, error: leadError } = await supabase.from('leads').select('*').eq('id', params.id).eq('tenant_id', userProfile.tenant_id).single()
      if (leadError || !leadData) { setError(t('leadDetailExtra.errors.missing')); setLoading(false); return }
      setLead(leadData)

      const { data: interactionsData } = await supabase.from('interactions').select('*').eq('lead_id', params.id).order('created_at', { ascending: false })
      setInteractions(interactionsData || [])
    } catch (err) {
      console.error('Error:', err)
      setError(t('leadDetailExtra.errors.load'))
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (newStatus: LeadStatus) => {
    if (!lead) return
    const { error: updateError } = await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id).eq('tenant_id', lead.tenant_id)
    if (!updateError) setLead({ ...lead, status: newStatus })
  }

  const handleAddNote = async () => {
    if (!lead || !newNote.trim() || !currentUser) return
    setAddingNote(true)
    const { data, error: insertError } = await supabase.from('interactions').insert({ tenant_id: lead.tenant_id, lead_id: lead.id, user_id: currentUser.id, type: 'note', content: newNote.trim() }).select().single()
    if (!insertError && data) { setInteractions([data, ...interactions]); setNewNote('') }
    setAddingNote(false)
  }

  const handleDelete = async () => {
    if (!lead) return
    if (!confirm(t('leadDetailExtra.deleteConfirm'))) return
    const { error: deleteError } = await supabase.from('leads').delete().eq('id', lead.id)
    if (!deleteError) router.push('/leads')
  }

  const formatBudget = (min: number | null, max: number | null) => !min && !max ? t('common.notSpecified') : min && max ? `${formatCurrency(min)} - ${formatCurrency(max)}` : min ? t('common.from', { value: formatCurrency(min) }) : t('common.until', { value: formatCurrency(max ?? 0) })
  const emailHref = lead?.email ? `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(t('leadDetailExtra.emailSubject'))}&body=${encodeURIComponent(`${t('leadDetailExtra.emailBody', { name: lead.first_name })}\n\n`)}` : null

  const aiDraftGmailHref = useMemo(() => {
    if (!lead?.email || !aiDraft) return null
    return `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(aiDraft.subject)}&body=${encodeURIComponent(aiDraft.body)}`
  }, [aiDraft, lead?.email])

  const getAiFallbackReasonLabel = (source: string | null) => {
    if (!source) return 'Motivo: desconocido'
    if (source.startsWith('fallback_guardrail_error')) return 'Motivo: guardrail'
    if (source.startsWith('fallback_parse_error')) return 'Motivo: parseo'
    if (source.startsWith('fallback_ai_error')) return 'Motivo: error IA'
    if (source.startsWith('fallback_no_provider')) return 'Motivo: sin provider'
    return `Motivo: ${source}`
  }

  const handleGenerateAiDraft = async (regenerate = false) => {
    if (!lead?.email) return
    const nextVariationIndex = regenerate ? aiDraftVariationIndex + 1 : aiDraftVariationIndex

    setShowAiComposer(true)
    setGeneratingAiDraft(true)
    setAiDraftError('')
    setCopiedDraft(false)
    setAiDraftSource(null)

    try {
      const result = await generateLeadEmailDraftAction({
        locale,
        variationIndex: nextVariationIndex,
        previousDraft: regenerate && aiDraft ? aiDraft : undefined,
        lead: {
          firstName: lead.first_name,
          lastName: lead.last_name,
          email: lead.email,
          phone: lead.phone,
          budget: formatBudget(lead.budget_min, lead.budget_max),
          preferredArea: lead.preferred_location,
          preferredType: lead.preferred_type ? getPropertyTypeLabel(t, lead.preferred_type) : null,
          source: lead.source ? getLeadSourceLabel(t, lead.source) : null,
          status: getLeadStatusLabel(t, lead.status),
          notes: lead.notes,
        },
      })

      setAiDraft({ subject: result.subject, body: result.body, mode: result.mode })
      setAiDraftSource(result.source)
      setAiDraftVariationIndex(nextVariationIndex)
    } catch (err) {
      console.error('[lead ai email] ui generation failed', err)
      setAiDraftError(t('leadDetailExtra.aiCompose.error'))
    } finally {
      setGeneratingAiDraft(false)
    }
  }

  const handleCopyAiDraft = async () => {
    if (!aiDraft) return
    try {
      await navigator.clipboard.writeText(`${aiDraft.subject}\n\n${aiDraft.body}`)
      setCopiedDraft(true)
      setTimeout(() => setCopiedDraft(false), 2000)
    } catch (err) {
      console.error('[lead ai email] copy failed', err)
      setAiDraftError(t('leadDetailExtra.aiCompose.copyError'))
    }
  }

  const handleReactivateLead = async () => {
    if (!lead?.phone || !lead.id) return
    setReactivating(true)
    setReactivationResult(null)
    try {
      const result = await reactivateLeadAction(lead.id)
      setReactivationResult(result)
    } catch (err) {
      console.error('[lead reactivate] failed', err)
      setReactivationResult({ success: false, error: String(err) })
    } finally {
      setReactivating(false)
    }
  }

  const handleOpenWhatsAppConversation = async () => {
    if (!lead?.id || !lead.phone) return
    setOpeningWhatsAppConversation(true)
    setWhatsAppConversationError('')
    try {
      await ensureLeadWhatsAppConversationAction(lead.id)
      router.push('/conversations')
    } catch (err) {
      console.error('[lead whatsapp] failed', err)
      setWhatsAppConversationError(err instanceof Error ? err.message : 'No se pudo abrir la conversación de WhatsApp')
    } finally {
      setOpeningWhatsAppConversation(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>
  if (error || !lead) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-center"><AlertCircle className="mx-auto text-red-500 mb-4" size={48} /><h2 className="text-xl font-semibold text-slate-900 mb-2">{t('leadDetailExtra.notFound')}</h2><p className="text-slate-500 mb-4">{error}</p><Link href="/leads" className="text-blue-500 hover:underline">{t('leadDetailExtra.back')}</Link></div></div>

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeader title={t('leadDetailExtra.detail')} breadcrumbs={[{ label: t('dashboard.title'), href: '/dashboard' }, { label: t('leadsPageExtra.title'), href: '/leads' }, { label: t('leadDetailExtra.detail') }]} actions={<><Link href="/leads" title={t('leadDetailExtra.back')} aria-label={t('leadDetailExtra.back')} className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition"><ArrowLeft size={20} /></Link><Link href={`/leads/${lead.id}/edit`} title={t('leadFormExtra.editTitle')} aria-label={t('leadFormExtra.editTitle')} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition"><Edit size={20} /></Link><button onClick={handleDelete} title={t('common.delete')} aria-label={t('common.delete')} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 size={20} /></button></>} />
      <main className="p-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-2xl">{lead.first_name[0]?.toUpperCase()}{lead.last_name?.[0]?.toUpperCase() || ''}</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">{lead.first_name} {lead.last_name}</h1>
                    <p className="text-slate-500 flex items-center gap-2 mt-1">
                      <Phone size={14} /> {lead.phone}
                      {lead.email && <><span>•</span><Mail size={14} /> {lead.email}</>}
                    </p>
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-xl ${STATUS_BG[lead.status]} border`}>
                  <select value={lead.status} onChange={(e) => updateStatus(e.target.value as LeadStatus)} className={`font-semibold bg-transparent outline-none cursor-pointer ${STATUS_COLORS[lead.status].replace('bg-', 'text-')}`}>
                    {['new', 'contacted', 'qualified', 'visit', 'negotiation', 'won', 'lost'].map((status) => (
                      <option key={status} value={status}>{getLeadStatusLabel(t, status)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-slate-500 text-sm flex items-center gap-1"><DollarSign size={14} /> {t('leadDetailExtra.budget')}</p>
                  <p className="font-semibold text-slate-900 mt-1">{formatBudget(lead.budget_min, lead.budget_max)}</p>
                </div>
                {lead.preferred_location && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-slate-500 text-sm flex items-center gap-1"><MapPin size={14} /> {t('leadDetailExtra.preferredArea')}</p>
                    <p className="font-semibold text-slate-900 mt-1">{lead.preferred_location}</p>
                  </div>
                )}
                {lead.source && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-slate-500 text-sm flex items-center gap-1"><Building2 size={14} /> {t('leadDetailExtra.source')}</p>
                    <p className="font-semibold text-slate-900 mt-1">{getLeadSourceLabel(t, lead.source)}</p>
                  </div>
                )}
              </div>

              {lead.notes && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-700 font-medium">{t('leadDetailExtra.notes')}</p>
                  <p className="text-slate-700 mt-1">{lead.notes}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2"><MessageSquare size={20} />{t('leadDetailExtra.interactions')}</h2>
              <div className="mb-6">
                <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder={t('leadDetailExtra.addNotePlaceholder')} rows={2} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
                <div className="flex justify-end mt-2">
                  <button onClick={handleAddNote} disabled={!newNote.trim() || addingNote} className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2">
                    <Send size={16} />{addingNote ? t('common.saving') : t('leadDetailExtra.addNote')}
                  </button>
                </div>
              </div>

              {interactions.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="mx-auto text-slate-300 mb-3" size={32} />
                  <p className="text-slate-500">{t('leadDetailExtra.noInteractions')}</p>
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
                          <span className="font-medium text-slate-900 capitalize">{interaction.type === 'note' ? t('leadDetailExtra.interactionTypes.note') : interaction.type}</span>
                          <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={12} /> {formatDate(interaction.created_at, { day: 'numeric', month: 'long', year: 'numeric' })} {formatTime(interaction.created_at)}</span>
                        </div>
                        <p className="text-slate-600">{interaction.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">{t('leadDetailExtra.quickActions')}</h3>
              <div className="space-y-2">
                <a href={`tel:${lead.phone}`} className="w-full flex items-center gap-3 p-3 bg-green-50 rounded-xl hover:bg-green-100 transition text-green-700">
                  <Phone size={18} className="text-green-500" />
                  <span>{t('leadDetailExtra.call', { phone: lead.phone })}</span>
                </a>

                {emailHref ? (
                  <a href={emailHref} className="w-full flex items-center gap-3 p-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition text-blue-700">
                    <Mail size={18} className="text-blue-500" />
                    <span>{t('leadDetailExtra.sendEmail')}</span>
                  </a>
                ) : (
                  <button type="button" disabled className="w-full flex items-center gap-3 p-3 bg-slate-100 rounded-xl text-slate-400 cursor-not-allowed">
                    <Mail size={18} className="text-slate-400" />
                    <span>{t('leadDetailExtra.sendEmail')}</span>
                  </button>
                )}

                {lead.email ? (
                  <button type="button" onClick={() => handleGenerateAiDraft(false)} disabled={generatingAiDraft} className="w-full flex items-center gap-3 p-3 bg-slate-900 rounded-xl hover:bg-slate-800 transition text-white disabled:opacity-60">
                    <Sparkles size={18} className="text-sky-300" />
                    <span>{generatingAiDraft ? t('leadDetailExtra.aiCompose.generating') : t('leadDetailExtra.aiCompose.trigger')}</span>
                  </button>
                ) : (
                  <button type="button" disabled className="w-full flex items-center gap-3 p-3 bg-slate-100 rounded-xl text-slate-400 cursor-not-allowed">
                    <Sparkles size={18} className="text-slate-400" />
                    <span>{t('leadDetailExtra.aiCompose.trigger')}</span>
                  </button>
                )}

                {lead.phone ? (
                  <button type="button" onClick={handleReactivateLead} disabled={reactivating} className="w-full flex items-center gap-3 p-3 bg-amber-500 rounded-xl hover:bg-amber-600 transition text-white disabled:opacity-60">
                    <RefreshCw size={18} />
                    <span>{reactivating ? t('common.sending') : t('leadDetailExtra.reactivate')}</span>
                  </button>
                ) : (
                  <button type="button" disabled className="w-full flex items-center gap-3 p-3 bg-slate-100 rounded-xl text-slate-400 cursor-not-allowed">
                    <RefreshCw size={18} className="text-slate-400" />
                    <span>{t('leadDetailExtra.reactivate')}</span>
                  </button>
                )}

                {reactivationResult && (
                  <div className={`p-3 rounded-xl text-sm ${reactivationResult.success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {reactivationResult.success ? `${t('leadDetailExtra.reactivateSuccess')}: ${reactivationResult.template}` : `${t('leadDetailExtra.reactivateError')}: ${reactivationResult.error}`}
                  </div>
                )}

                <Link href={`/appointments/new?lead_id=${lead.id}&lead_name=${encodeURIComponent(`${lead.first_name} ${lead.last_name || ''}`.trim())}&lead_phone=${encodeURIComponent(lead.phone || '')}`} className="w-full flex items-center gap-3 p-3 bg-purple-50 rounded-xl hover:bg-purple-100 transition text-purple-700">
                  <Calendar size={18} className="text-purple-500" />
                  <span>{t('leadDetailExtra.schedule')}</span>
                </Link>

                {lead.phone && (
                  <>
                    <button type="button" onClick={handleOpenWhatsAppConversation} disabled={openingWhatsAppConversation} className="w-full flex items-center gap-3 p-3 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition text-emerald-700 disabled:opacity-60">
                      <MessageSquare size={18} className="text-emerald-500" />
                      <span>{openingWhatsAppConversation ? t('common.loading') : t('leadDetailExtra.whatsapp')}</span>
                    </button>
                    <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition text-slate-700">
                      <ExternalLink size={18} className="text-slate-500" />
                      <span>{t('leadDetailExtra.openWhatsApp')}</span>
                    </a>
                    {whatsAppConversationError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{whatsAppConversationError}</div> : null}
                  </>
                )}
              </div>

              {showAiComposer && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">{t('leadDetailExtra.aiCompose.title')}</h4>
                      <p className="text-sm text-slate-500 mt-1">{t('leadDetailExtra.aiCompose.subtitle')}</p>
                    </div>
                    {aiDraft ? (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${aiDraft.mode === 'ai' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                        {aiDraft.mode === 'ai' ? t('leadDetailExtra.aiCompose.aiBadge') : t('leadDetailExtra.aiCompose.fallbackBadge')}
                      </span>
                    ) : null}
                  </div>

                  {aiDraft && aiDraft.mode === 'fallback' ? (
                    <div className="-mt-2 space-y-1">
                      <p className="text-xs text-amber-700">{aiDraftSource?.startsWith('fallback_no_provider') ? t('leadDetailExtra.aiCompose.fallbackNoProvider') : aiDraftSource?.includes('Insufficient credits') ? t('leadDetailExtra.aiCompose.fallbackCredits') : t('leadDetailExtra.aiCompose.fallbackGeneric')}</p>
                      <p className="text-[11px] text-slate-500">{getAiFallbackReasonLabel(aiDraftSource)}</p>
                    </div>
                  ) : null}

                  {aiDraft && aiDraft.mode === 'ai' && aiDraftSource ? (
                    <div className="text-[10px] text-slate-400 font-mono">
                      {aiDraftSource}
                    </div>
                  ) : null}

                  {aiDraftError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{aiDraftError}</div> : null}

                  {generatingAiDraft ? (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">{t('leadDetailExtra.aiCompose.generating')}</div>
                  ) : aiDraft ? (
                    <>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">{t('leadDetailExtra.aiCompose.subject')}</p>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">{aiDraft.subject}</div>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">{t('leadDetailExtra.aiCompose.body')}</p>
                        <textarea readOnly value={aiDraft.body} rows={8} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 resize-none outline-none" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleGenerateAiDraft(true)} disabled={generatingAiDraft} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition disabled:opacity-60">
                          <RefreshCw size={16} />
                          {t('leadDetailExtra.aiCompose.regenerate')}
                        </button>
                        <button type="button" onClick={handleCopyAiDraft} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition">
                          <Copy size={16} />
                          {copiedDraft ? t('leadDetailExtra.aiCompose.copied') : t('leadDetailExtra.aiCompose.copy')}
                        </button>
                        {aiDraftGmailHref ? (
                          <a href={aiDraftGmailHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
                            <ExternalLink size={16} />
                            {t('leadDetailExtra.aiCompose.openGmail')}
                          </a>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">{t('leadDetailExtra.info')}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('leadDetailExtra.created')}</span>
                  <span className="text-slate-700">{formatDate(lead.created_at, { day: 'numeric', month: 'long', year: 'numeric' })} {formatTime(lead.created_at)}</span>
                </div>
                {lead.preferred_type && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('leadDetailExtra.preferredType')}</span>
                    <span className="text-slate-700">{getPropertyTypeLabel(t, lead.preferred_type)}</span>
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

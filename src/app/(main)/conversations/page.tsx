'use client'

import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/i18n/I18nProvider'
import {
  MessageSquare, Plus, Send, Mail, MessageCircle, Globe, Bot,
  ArrowLeft, Clock, User, AlertTriangle, X, Check, Sparkles,
  Reply, SendHorizonal, Calendar, CalendarPlus, UserPlus, UserCheck, ShieldAlert, ChevronRight, Home
} from 'lucide-react'
import type {
  ConversationWithLead, MessageWithSender, ConversationChannel,
  ConversationStatus
} from '@/features/conversations/types'
import {
  CHANNEL_LABELS, STATUS_COLORS
} from '@/features/conversations/types'
import type {
  MessageMetadata, MessageMetadataWithReply, MessageMetadataFull, EscalationData
} from '@/features/conversations/intent-types'
import {
  INTENT_COLORS, INTENT_LABELS, DECISION_COLORS, DECISION_LABELS
} from '@/features/conversations/intent-types'
import {
   createConversationAction, sendMessageAction, updateConversationStatusAction,
    classifyMessageAction, classifyConversationAction,
    generateAutoReplyAction, sendDraftReplyAction,
    suggestAppointmentSlotsAction, createAppointmentFromConversationAction,
    escalateToHumanAction, generateHumanSuggestionAction, sendHumanReplyAction, assignConversationAction,
    sendEmailFromConversationAction,
    sendWhatsAppFromConversationAction, getWhatsAppTemplatesAction, renderWhatsAppTemplateAction
} from '@/features/conversations/actions'
import type { TimeSlot } from '@/features/conversations/scheduling-engine'
import { WhatsAppTemplatePicker } from '@/features/conversations/whatsapp-template-picker'

type ChannelDeliveryMeta = {
  email_delivery_status?: 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed'
  email_delivery_provider?: string
  email_delivery_error?: string
  whatsapp_delivery_status?: 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed'
  whatsapp_delivery_provider?: string
  whatsapp_delivery_error?: string
  whatsapp_delivery_requested_type?: 'text' | 'template'
  whatsapp_delivery_sent_type?: 'text' | 'template'
  whatsapp_delivery_template_fallback?: boolean
  whatsapp_delivery_sandbox?: boolean
  whatsapp_validation_failed?: boolean
  whatsapp_resolved_to?: string
  whatsapp_resolved_source?: 'metadata.last_whatsapp_to' | 'metadata.contact_phone' | 'lead.contact_phone' | null
}

type ConversationEmailActivity = {
  hasOutbound: boolean
  latestInboundFrom: string | null
  latestInboundSubject: string | null
  latestInboundContent: string | null
}

type TenantWhatsAppTemplateOption = {
  id: string
  template_key: string
  name: string
  language: string
  category: string
  params_required: number
  variables_schema: Array<{ key: string; label: string; example: string; required: boolean }>
  body_text: string
  status: string
  meta_status: string | null
  usable: boolean
  rejection_reason: string | null
}

function isIrrelevantInboundPreview(activity: ConversationEmailActivity | undefined) {
  if (!activity) return false

  const from = (activity.latestInboundFrom || '').toLowerCase()
  const subject = (activity.latestInboundSubject || '').toLowerCase()
  const content = (activity.latestInboundContent || '').toLowerCase()
  const text = `${subject} ${content}`

  const senderHints = ['no-reply', 'noreply', 'mailer-daemon', 'nextdoor', 'groupon', 'gumtree', 'survey.', 'jobplacements', 'moneybox', 'newsletter.', 'ubereats', 'uber@', 'samsung-', 'vodafone', 'amazonflex', 'indeedemail', 'fco.gov.uk', 'millbanklaw', 'morales.uk']
  const contentHints = ['unsubscribe', 'newsletter', 'job alert', 'loan application', 'survey', 'publicación destacada', 'publicacion destacada', 'groupon', 'nextdoor', 'gumtree', 'the panel station', 'employment', 'vacant', 'account cancellation', 'device plan', 'verification code', 'visa', 'policy documents', 'insurance', 'outstanding documents', 'order #', 'induction']

  return senderHints.some((hint) => from.includes(hint)) || contentHints.some((hint) => text.includes(hint))
}

function shouldDisplayConversation(conversation: ConversationWithLead, activity?: ConversationEmailActivity) {
  if (conversation.channel !== 'email') return true

  const metadata = (conversation.metadata || {}) as Record<string, unknown>
  const source = typeof metadata.email_thread_source === 'string' ? metadata.email_thread_source : null

  if (source !== 'new_inbound') return true
  if (!activity) return false
  if (isIrrelevantInboundPreview(activity)) return false
  return true
}

const CHANNEL_ICONS: Record<ConversationChannel, React.ReactNode> = {
  email: <Mail size={14} />,
  whatsapp: <MessageCircle size={14} />,
  chatbot: <Bot size={14} />,
  internal: <MessageSquare size={14} />,
  web_form: <Globe size={14} />,
}

export default function ConversationsPage() {
  const { t, formatDate } = useI18n()
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState<ConversationWithLead[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [suggestedSlots, setSuggestedSlots] = useState<TimeSlot[]>([])
  const [showSlotPicker, setShowSlotPicker] = useState<string | null>(null)
  const [creatingAppointment, setCreatingAppointment] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [showHumanReply, setShowHumanReply] = useState(false)
  const [humanReplyText, setHumanReplyText] = useState('')
  const [sendingHumanReply, setSendingHumanReply] = useState(false)
  const [showEscalationForm, setShowEscalationForm] = useState(false)
  const [escalationReason, setEscalationReason] = useState('')
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showWhatsAppForm, setShowWhatsAppForm] = useState(false)
  const [whatsAppTo, setWhatsAppTo] = useState('')
  const [whatsAppBody, setWhatsAppBody] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateParams, setTemplateParams] = useState<string[]>([])
  const [inlineSelectedTemplate, setInlineSelectedTemplate] = useState('')
  const [inlineTemplateParams, setInlineTemplateParams] = useState<string[]>([])
  const [whatsAppTemplates, setWhatsAppTemplates] = useState<TenantWhatsAppTemplateOption[]>([])
  const [loadingWhatsAppTemplates, setLoadingWhatsAppTemplates] = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const selected = conversations.find(c => c.id === selectedId)
  const leadContextId = searchParams.get('lead_id') || searchParams.get('leadId') || selected?.lead?.id || null

useEffect(() => { 
    loadConversations()
  }, [])

  useEffect(() => {
    let isStale = false
    const interval = setInterval(async () => {
      if (document.visibilityState === 'visible' && selectedId && !isStale) {
        isStale = true
        await loadMessages(selectedId)
        isStale = false
      }
    }, 5000)
    return () => {
      isStale = true
      clearInterval(interval)
    }
  }, [selectedId])

  useEffect(() => {
    async function loadWhatsAppTemplates() {
      if (selected?.channel !== 'whatsapp' && !showWhatsAppForm) return
      setLoadingWhatsAppTemplates(true)
      try {
        const templates = await getWhatsAppTemplatesAction() as TenantWhatsAppTemplateOption[]
        setWhatsAppTemplates(templates)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar las plantillas de WhatsApp')
      } finally {
        setLoadingWhatsAppTemplates(false)
      }
    }

    void loadWhatsAppTemplates()
  }, [selected?.channel, showWhatsAppForm])

  useEffect(() => {
    setInlineSelectedTemplate('')
    setInlineTemplateParams([])
    setSelectedTemplate('')
    setTemplateParams([])
  }, [selectedId])

  async function loadConversations() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setConversations([])
        setSelectedId(null)
        setError('No authenticated Supabase session found for /conversations')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('users').select('tenant_id').eq('id', user.id).single()
      if (profileError) {
        setConversations([])
        setSelectedId(null)
        setError(profileError.message)
        return
      }
      if (!profile?.tenant_id) {
        setConversations([])
        setSelectedId(null)
        setError(`Authenticated user ${user.email || user.id} has no tenant_id in users profile`)
        return
      }

      const { data, error: qErr } = await supabase
        .from('conversations')
        .select('id, tenant_id, lead_id, subject, channel, status, last_message_at, last_message_preview, metadata, created_by, created_at, updated_at, lead:leads(id, first_name, last_name, phone, email)')
        .eq('tenant_id', profile.tenant_id)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      if (qErr) { setError(qErr.message); return }

      const convos: ConversationWithLead[] = (data || []).map((c) => ({
        ...c,
        lead: Array.isArray(c.lead) ? c.lead[0] || null : c.lead,
        message_count: 0,
        unread_count: 0,
      }))

      const emailConversationIds = convos.filter((conversation) => conversation.channel === 'email').map((conversation) => conversation.id)
      const emailActivity = new Map<string, ConversationEmailActivity>()

      if (emailConversationIds.length > 0) {
        const { data: emailMessages } = await supabase
          .from('conversation_messages')
          .select('conversation_id, direction, content, metadata, created_at')
          .in('conversation_id', emailConversationIds)
          .eq('channel', 'email')
          .order('created_at', { ascending: false })

        for (const message of emailMessages || []) {
          const current = emailActivity.get(message.conversation_id) || {
            hasOutbound: false,
            latestInboundFrom: null,
            latestInboundSubject: null,
            latestInboundContent: null,
          }

          if (message.direction === 'outbound') {
            current.hasOutbound = true
          } else if (!current.latestInboundFrom) {
            const metadata = (message.metadata || {}) as Record<string, unknown>
            current.latestInboundFrom = typeof metadata.email_from === 'string' ? metadata.email_from : null
            current.latestInboundSubject = typeof metadata.email_subject === 'string' ? metadata.email_subject : null
            current.latestInboundContent = message.content || null
          }

          emailActivity.set(message.conversation_id, current)
        }
      }

      const visibleConversations = convos.filter((conversation) => shouldDisplayConversation(conversation, emailActivity.get(conversation.id)))
      setConversations(visibleConversations)
      setSelectedId((current) => {
        if (!current) return visibleConversations[0]?.id || null
        return visibleConversations.some((conversation) => conversation.id === current)
          ? current
          : visibleConversations[0]?.id || null
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from('conversation_messages')
      .select('*, sender:users(id, full_name, email)')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    setMessages((data || []).map(m => ({
      ...m,
      sender: Array.isArray(m.sender) ? m.sender[0] || null : m.sender,
    })))
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    const selectedTemplateRecord = whatsAppTemplates.find((template) => template.id === inlineSelectedTemplate) || null
    if ((!newMessage.trim() && !selectedTemplateRecord) || !selectedId) return
    setSending(true)
    const fd = new FormData()
    fd.set('conversationId', selectedId)
    fd.set('content', selectedTemplateRecord ? selectedTemplateRecord.body_text : newMessage.trim())
    fd.set('direction', 'outbound')
    if (selectedTemplateRecord) {
      fd.set('tenantTemplateId', selectedTemplateRecord.id)
      fd.set('templateParams', JSON.stringify(inlineTemplateParams))
    }
    try {
      await sendMessageAction(fd)
      setNewMessage('')
      setInlineSelectedTemplate('')
      setInlineTemplateParams([])
      await loadMessages(selectedId)
      await loadConversations()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al enviar')
      await loadMessages(selectedId)
      await loadConversations()
    } finally {
      setSending(false)
    }
  }

  async function handleStatusChange(status: ConversationStatus) {
    if (!selectedId) return
    const fd = new FormData()
    fd.set('conversationId', selectedId)
    fd.set('status', status)
    try {
      await updateConversationStatusAction(fd)
      await loadConversations()
    } catch { /* status update failed silently */ }
  }

  const channelStatus = selected?.channel === 'email'
    ? {
        tone: 'emerald' as const,
        badge: t('conversations.channelStatus.email.badge'),
        title: t('conversations.channelStatus.email.title'),
        description: t('conversations.channelStatus.email.description'),
        checklist: [] as string[],
      }
    : selected?.channel === 'whatsapp'
    ? {
        tone: 'amber' as const,
        badge: t('conversations.channelStatus.whatsapp.badge'),
        title: t('conversations.channelStatus.whatsapp.title'),
        description: t('conversations.channelStatus.whatsapp.description'),
        checklist: [
          t('conversations.channelStatus.whatsapp.checklist.token'),
          t('conversations.channelStatus.whatsapp.checklist.number'),
          t('conversations.channelStatus.whatsapp.checklist.window'),
          t('conversations.channelStatus.whatsapp.checklist.webhook'),
        ],
      }
    : null

  const showWhatsAppBadge = selected?.channel === 'whatsapp'

  async function handleClassifyAll() {
    if (!selectedId) return
    setClassifying(true)
    try {
      const fd = new FormData()
      fd.set('conversationId', selectedId)
      await classifyConversationAction(fd)
      await loadMessages(selectedId)
    } catch { /* classify failed */ }
    setClassifying(false)
  }

  async function handleClassifyMessage(msgId: string, content: string) {
    try {
      const fd = new FormData()
      fd.set('messageId', msgId)
      fd.set('content', content)
      await classifyMessageAction(fd)
      if (selectedId) await loadMessages(selectedId)
    } catch { /* classify failed */ }
  }

  async function handleGenerateReply(msgId: string) {
    try {
      const fd = new FormData()
      fd.set('messageId', msgId)
      await generateAutoReplyAction(fd)
      if (selectedId) await loadMessages(selectedId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al generar respuesta')
    }
  }

  async function handleSendDraft(msgId: string) {
    try {
      const fd = new FormData()
      fd.set('messageId', msgId)
      await sendDraftReplyAction(fd)
      if (selectedId) {
        await loadMessages(selectedId)
        await loadConversations()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al enviar borrador')
    }
  }

  async function handleSuggestSlots(convId: string) {
    try {
      const fd = new FormData()
      fd.set('conversationId', convId)
      const result = await suggestAppointmentSlotsAction(fd)
      setSuggestedSlots(result.slots)
      setShowSlotPicker(convId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al consultar disponibilidad')
    }
  }

  async function handleCreateAppointment(slot: TimeSlot) {
    if (!selectedId) return
    setCreatingAppointment(true)
    try {
      const fd = new FormData()
      fd.set('conversationId', selectedId)
      fd.set('startTime', slot.start)
      fd.set('endTime', slot.end)
      fd.set('title', 'Visita - ' + (selected?.subject || 'Conversación'))
      fd.set('appointmentType', 'visit')
      if (selected?.lead?.id) fd.set('leadId', selected.lead.id)
      await createAppointmentFromConversationAction(fd)
      setShowSlotPicker(null)
      setSuggestedSlots([])
      await loadMessages(selectedId)
      await loadConversations()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear la cita')
    } finally {
      setCreatingAppointment(false)
    }
  }

  async function handleEscalate(assignedTo?: string) {
    if (!selectedId) return
    setEscalating(true)
    try {
      const fd = new FormData()
      fd.set('conversationId', selectedId)
      if (assignedTo) fd.set('assignedTo', assignedTo)
      if (escalationReason) fd.set('reason', escalationReason)
      await escalateToHumanAction(fd)
      setShowEscalationForm(false)
      setEscalationReason('')
      if (selectedId) await loadMessages(selectedId)
      await loadConversations()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al escalar')
    } finally {
      setEscalating(false)
    }
  }

  async function handleGenerateHumanSuggestion(msgId: string) {
    try {
      const fd = new FormData()
      fd.set('messageId', msgId)
      await generateHumanSuggestionAction(fd)
      if (selectedId) await loadMessages(selectedId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al generar sugerencia')
    }
  }

  async function handleSendHumanReply(msgId: string) {
    if (!selectedId || !humanReplyText.trim()) return
    setSendingHumanReply(true)
    try {
      const fd = new FormData()
      fd.set('conversationId', selectedId)
      fd.set('content', humanReplyText.trim())
      if (msgId) fd.set('messageId', msgId)
      await sendHumanReplyAction(fd)
      setHumanReplyText('')
      setShowHumanReply(false)
      if (selectedId) {
        await loadMessages(selectedId)
        await loadConversations()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al enviar respuesta')
    } finally {
      setSendingHumanReply(false)
    }
  }

  async function handleSendEmail() {
    if (!selectedId || !emailTo || !emailBody) return
    setSendingEmail(true)
    try {
      const fd = new FormData()
      fd.set('conversationId', selectedId)
      fd.set('to', emailTo)
      if (emailSubject) fd.set('subject', emailSubject)
      fd.set('content', emailBody)
      await sendEmailFromConversationAction(fd)
      setEmailTo('')
      setEmailSubject('')
      setEmailBody('')
      setShowEmailForm(false)
      if (selectedId) {
        await loadMessages(selectedId)
        await loadConversations()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al enviar email')
    } finally {
      setSendingEmail(false)
    }
  }

  async function handleSendWhatsApp() {
    const selectedTemplateRecord = whatsAppTemplates.find((template) => template.id === selectedTemplate) || null
    if (!selectedId || !whatsAppTo || (!whatsAppBody && !selectedTemplateRecord)) return
    setSendingWhatsApp(true)
    try {
      const fd = new FormData()
      fd.set('conversationId', selectedId)
      fd.set('to', whatsAppTo)
      fd.set('content', selectedTemplateRecord ? selectedTemplateRecord.body_text : whatsAppBody)
      if (selectedTemplateRecord) {
        fd.set('tenantTemplateId', selectedTemplateRecord.id)
        fd.set('templateParams', JSON.stringify(templateParams))
      }
      await sendWhatsAppFromConversationAction(fd)
      setWhatsAppTo('')
      setWhatsAppBody('')
      setSelectedTemplate('')
      setTemplateParams([])
      setShowWhatsAppForm(false)
      if (selectedId) {
        await loadMessages(selectedId)
        await loadConversations()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al enviar WhatsApp')
    } finally {
      setSendingWhatsApp(false)
    }
  }

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col">
      <header className="px-6 py-4 border-b border-slate-200 bg-white">
        <div className="mb-4 flex items-center gap-3 text-sm text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-700">{t('dashboard.title')}</Link>
          <ChevronRight size={14} />
          <span className="font-medium text-slate-900">{t('conversations.title')}</span>
        </div>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold text-slate-900">{t('conversations.title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('conversations.subtitle')}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/leads"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              >
                <ArrowLeft size={16} />
                {t('conversations.navigation.backToLeads')}
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Home size={16} />
                {t('conversations.navigation.backToDashboard')}
              </Link>
              {leadContextId && (
                <Link
                  href={`/leads/${leadContextId}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                >
                  <User size={16} />
                  {t('conversations.navigation.backToLead')}
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Link
              href="/channels"
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
            >
              <ShieldAlert size={16} />
              {t('conversations.channelsPanel.open')}
            </Link>
            <button
              onClick={() => setShowNewForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              <Plus size={16} />
              {t('conversations.new')}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <div className={`w-full md:w-96 border-r border-slate-200 bg-white overflow-y-auto ${selectedId ? 'hidden md:block' : ''}`}>
          {loading ? (
            <div className="p-6 text-center text-slate-500">{t('common.loading')}</div>
          ) : conversations.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="mx-auto mb-3 text-slate-300" size={36} />
              <p className="text-slate-500">{t('conversations.empty')}</p>
              <p className="text-sm text-slate-400 mt-1">{t('conversations.emptyHint')}</p>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition ${selectedId === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{CHANNEL_ICONS[conv.channel]}</span>
                      <p className="font-medium text-sm text-slate-900 truncate">{conv.subject || t('conversations.noSubject')}</p>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {conv.lead
                        ? `${conv.lead.first_name} ${conv.lead.last_name || ''}`
                        : conv.last_message_preview || '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {(conv.metadata as MessageMetadataFull)?.escalation && (
                      <span className="inline-flex px-2 py-0.5 rounded-full border text-xs font-medium bg-red-50 text-red-700 border-red-200">
                        {t('conversations.escalation.' + ((conv.metadata as MessageMetadataFull).escalation!.status))}
                      </span>
                    )}
                    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_COLORS[conv.status]}`}>
                      {t(`conversations.status.${conv.status}`)}
                    </span>
                    {conv.last_message_at && (
                      <span className="text-xs text-slate-400">
                        {formatDate(conv.last_message_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Message view */}
        <div className={`flex-1 flex flex-col bg-slate-50 ${!selectedId ? 'hidden md:flex' : ''}`}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <MessageSquare className="mx-auto mb-3" size={40} />
                <p>{t('conversations.selectHint')}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedId(null)} className="md:hidden text-slate-400 hover:text-slate-600">
                    <ArrowLeft size={20} />
                  </button>
                  <div>
                    <p className="font-medium text-slate-900">{selected?.subject || t('conversations.noSubject')}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">{CHANNEL_ICONS[selected?.channel || 'internal']} {CHANNEL_LABELS[selected?.channel || 'internal']}</span>
                      {selected?.channel === 'whatsapp' && (
                        <span className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          Sandbox
                        </span>
                      )}
                      {selected?.lead && (
                        <>
                          <span>·</span>
                          <User size={12} />
                          <span>{selected.lead.first_name} {selected.lead.last_name || ''}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected?.channel === 'email' && (
                    <button
                      onClick={() => setShowEmailForm(!showEmailForm)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                      title={t('conversations.email.send')}
                    >
                      <Mail size={14} />
                      {t('conversations.email.send')}
                    </button>
                  )}
                  {selected?.channel === 'whatsapp' && (
                    <button
                      onClick={() => setShowWhatsAppForm(!showWhatsAppForm)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
                      title={t('conversations.whatsapp.send')}
                    >
                      <MessageCircle size={14} />
                      {t('conversations.whatsapp.send')}
                    </button>
                  )}
                  <button
                    onClick={handleClassifyAll}
                    disabled={classifying}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-50"
                    title={t('conversations.classify')}
                  >
                    <Sparkles size={14} />
                    {classifying ? '...' : t('conversations.classify')}
                  </button>
                  <select
                    value={selected?.status || 'open'}
                    onChange={(e) => handleStatusChange(e.target.value as ConversationStatus)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                  >
                    <option value="open">{t('conversations.status.open')}</option>
                    <option value="waiting">{t('conversations.status.waiting')}</option>
                    <option value="resolved">{t('conversations.status.resolved')}</option>
                    <option value="archived">{t('conversations.status.archived')}</option>
                  </select>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-slate-400 py-12">
                    <Clock className="mx-auto mb-2" size={24} />
                    <p className="text-sm">{t('conversations.noMessages')}</p>
                  </div>
                ) : (
                   messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-xl px-4 py-2.5 ${
                        msg.direction === 'outbound'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-900'
                      }`}>
                        {msg.sender?.full_name && msg.direction === 'outbound' && (
                          <p className={`text-xs font-medium mb-1 ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-slate-400'}`}>
                            {msg.sender.full_name}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        {/* Intent/decision badges for classified messages */}
                        {(msg.metadata as MessageMetadata)?.intent && (
                          <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${INTENT_COLORS[(msg.metadata as MessageMetadata).intent!.intent]}`}>
                              {INTENT_LABELS[(msg.metadata as MessageMetadata).intent!.intent]}
                              <span className="opacity-60">
                                {Math.round((msg.metadata as MessageMetadata).intent!.confidence * 100)}%
                              </span>
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${DECISION_COLORS[(msg.metadata as MessageMetadata).decision!.decision]}`}>
                              {DECISION_LABELS[(msg.metadata as MessageMetadata).decision!.decision]}
                            </span>
                          </div>
                        )}
                        {/* Auto-reply draft display */}
                        {(msg.metadata as MessageMetadataWithReply)?.auto_reply?.reply_status === 'draft' && (
                          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <div className="flex items-center gap-1 mb-1.5">
                              <Reply size={12} className="text-amber-600" />
                              <span className="text-xs font-medium text-amber-700">{t('conversations.reply.suggested')}</span>
                            </div>
                            <p className="text-sm text-amber-900 whitespace-pre-wrap">{(msg.metadata as MessageMetadataWithReply).auto_reply!.reply_text}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={() => handleSendDraft(msg.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
                              >
                                <SendHorizonal size={12} />
                                {t('conversations.reply.send')}
                              </button>
                              <span className="text-xs text-amber-500">
                                {t('conversations.reply.template')}: {(msg.metadata as MessageMetadataWithReply).auto_reply!.template_id}
                              </span>
                            </div>
                          </div>
                        )}
                        {/* Auto-reply sent indicator */}
                        {(msg.metadata as MessageMetadataWithReply)?.auto_reply?.reply_status === 'sent' && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                            <Check size={12} />
                            <span>{t('conversations.reply.sent')}</span>
                          </div>
                        )}
                        {/* Generate reply button for classified messages without auto_reply */}
                        {msg.direction === 'inbound' && (msg.metadata as MessageMetadata)?.intent && !(msg.metadata as MessageMetadataWithReply)?.auto_reply && (
                          <button
                            onClick={() => handleGenerateReply(msg.id)}
                            className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                          >
                            <Reply size={12} />
                            {t('conversations.reply.generate')}
                          </button>
                        )}
                        {/* Classify button for unclassified inbound messages */}
                        {msg.direction === 'inbound' && !(msg.metadata as MessageMetadata)?.intent && (
                          <button
                            onClick={() => handleClassifyMessage(msg.id, msg.content)}
                            className="mt-2 text-xs text-violet-500 hover:text-violet-700 flex items-center gap-1"
                          >
                            <Sparkles size={12} />
                            {t('conversations.classify')}
                          </button>
                        )}
                        {/* Suggest appointment button for classified messages with appointment_request intent */}
                        {msg.direction === 'inbound' && (msg.metadata as MessageMetadata)?.intent?.intent === 'appointment_request' && !(msg.metadata as MessageMetadataWithReply)?.auto_reply && (
                          <button
                            onClick={() => handleSuggestSlots(selectedId!)}
                            className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <CalendarPlus size={12} />
                            {t('conversations.appointment.suggestSlots')}
                          </button>
                        )}
                        {/* Escalate to human button for require_human decision */}
                        {msg.direction === 'inbound' && (msg.metadata as MessageMetadata)?.decision?.decision === 'require_human' && !(msg.metadata as MessageMetadataFull)?.escalation && (
                          <button
                            onClick={() => handleEscalate()}
                            className="mt-2 text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                          >
                            <ShieldAlert size={12} />
                            {t('conversations.escalate')}
                          </button>
                        )}
                        {/* Generate human suggestion for escalated messages */}
                        {msg.direction === 'inbound' && (msg.metadata as MessageMetadataFull)?.escalation?.status && !(msg.metadata as MessageMetadataFull)?.human_suggestion && (
                          <button
                            onClick={() => handleGenerateHumanSuggestion(msg.id)}
                            className="mt-2 text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1"
                          >
                            <UserPlus size={12} />
                            {t('conversations.human.suggestReply')}
                          </button>
                        )}
                        {/* Human suggestion display */}
                        {(msg.metadata as MessageMetadataFull)?.human_suggestion && (
                          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-1 mb-1.5">
                              <UserCheck size={12} className="text-blue-600" />
                              <span className="text-xs font-medium text-blue-700">{t('conversations.human.suggestedReply')}</span>
                            </div>
                            <p className="text-sm text-blue-900 whitespace-pre-wrap">{(msg.metadata as MessageMetadataFull).human_suggestion!.suggested_reply}</p>
                            <p className="text-xs text-blue-500 mt-1 italic">{(msg.metadata as MessageMetadataFull).human_suggestion!.rationale}</p>
                            <button
                              onClick={() => { setShowHumanReply(true); setHumanReplyText((msg.metadata as MessageMetadataFull).human_suggestion!.suggested_reply) }}
                              className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                            >
                              <SendHorizonal size={12} />
                              {t('conversations.human.useAndSend')}
                            </button>
                          </div>
                        )}
                        {/* Human reply sent indicator */}
                        {(msg.metadata as MessageMetadataFull)?.human_reply && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                            <UserCheck size={12} />
                            <span>{t('conversations.human.replySent')}</span>
                          </div>
                        )}
                        {msg.direction === 'outbound' && (msg.channel === 'email' || msg.channel === 'whatsapp') && (
                          <div className={`mt-2 flex flex-wrap gap-1.5 border-t pt-2 ${msg.direction === 'outbound' ? 'border-blue-500/30' : 'border-slate-100'}`}>
                            {msg.channel === 'email' && (() => {
                              const meta = msg.metadata as ChannelDeliveryMeta
                              return (
                                <>
                                  {meta.email_delivery_provider && (
                                    <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-blue-100">
                                      {t('conversations.delivery.provider', { provider: meta.email_delivery_provider })}
                                    </span>
                                  )}
                                  {meta.email_delivery_status && (
                                    <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-blue-100">
                                      {t(`conversations.delivery.status.${meta.email_delivery_status}`)}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                            {msg.channel === 'whatsapp' && (() => {
                              const meta = msg.metadata as ChannelDeliveryMeta
                              return (
                                <>
                                  {meta.whatsapp_delivery_provider && (
                                    <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-blue-100">
                                      {t('conversations.delivery.provider', { provider: meta.whatsapp_delivery_provider })}
                                    </span>
                                  )}
                                  {meta.whatsapp_delivery_status && (
                                    <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-blue-100">
                                      {t(`conversations.delivery.status.${meta.whatsapp_delivery_status}`)}
                                    </span>
                                  )}
                                  {meta.whatsapp_delivery_sent_type && (
                                    <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-blue-100">
                                      {t(`conversations.delivery.type.${meta.whatsapp_delivery_sent_type}`)}
                                    </span>
                                  )}
                                  {meta.whatsapp_delivery_template_fallback && (
                                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                                      {t('conversations.delivery.templateFallback')}
                                    </span>
                                  )}
                                  {meta.whatsapp_delivery_sandbox && (
                                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                                      {t('conversations.delivery.sandbox')}
                                    </span>
                                  )}
                                  {meta.whatsapp_validation_failed && (
                                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">
                                      {t('conversations.delivery.validationFailed') || 'Número inválido'}
                                    </span>
                                  )}
                                  {meta.whatsapp_resolved_to && (
                                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800" title="Número resuelto">
                                      →{meta.whatsapp_resolved_to}
                                    </span>
                                  )}
                                  {meta.whatsapp_resolved_source && (
                                    <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-800" title="Fuente del número">
                                      {meta.whatsapp_resolved_source === 'metadata.last_whatsapp_to' ? 'meta:last_whatsapp_to' : meta.whatsapp_resolved_source === 'metadata.contact_phone' ? 'meta:contact_phone' : meta.whatsapp_resolved_source === 'lead.contact_phone' ? 'lead.phone' : meta.whatsapp_resolved_source}
                                    </span>
                                  )}
                                  {msg.status === 'failed' && meta.whatsapp_delivery_error && (
                                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700 max-w-[200px] truncate" title={meta.whatsapp_delivery_error}>
                                      {meta.whatsapp_delivery_error}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        )}
                        <div className={`flex items-center gap-1 mt-1 text-xs ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-slate-400'}`}>
                          <span>{formatDate(msg.created_at, { hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.is_automated && <span>· {t('conversations.automated')}</span>}
                          {msg.status === 'failed' && <span className="text-red-300">· {t('conversations.failed')}</span>}
                          {msg.direction === 'outbound' && msg.status === 'sent' && <Check size={12} />}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-slate-200 bg-white">
                {showHumanReply ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1 text-xs text-blue-600">
                      <UserCheck size={12} />
                      <span>{t('conversations.human.replyMode')}</span>
                    </div>
                    <textarea
                      value={humanReplyText}
                      onChange={e => setHumanReplyText(e.target.value)}
                      placeholder={t('conversations.human.replyPlaceholder')}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowHumanReply(false); setHumanReplyText('') }}
                        className="px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => handleSendHumanReply('')}
                        disabled={!humanReplyText.trim() || sendingHumanReply}
                        className="px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <SendHorizonal size={12} />
                        {t('conversations.human.sendReply')}
                      </button>
                    </div>
                  </div>
                ) : showEmailForm ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <Mail size={12} />
                      <span>{t('conversations.email.sendMode')}</span>
                    </div>
                    <input
                      value={emailTo}
                      onChange={e => setEmailTo(e.target.value)}
                      placeholder={t('conversations.email.toPlaceholder')}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      placeholder={t('conversations.email.subjectPlaceholder')}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <textarea
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                      placeholder={t('conversations.email.bodyPlaceholder')}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowEmailForm(false); setEmailTo(''); setEmailSubject(''); setEmailBody('') }}
                        className="px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleSendEmail}
                        disabled={!emailTo || !emailBody || sendingEmail}
                        className="px-3 py-2 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Send size={12} />
                        {t('conversations.email.send')}
                      </button>
                    </div>
                  </div>
                 ) : showWhatsAppForm ? (
                   <div className="space-y-2">
                     <div className="flex items-center gap-1 text-xs text-green-600">
                       <MessageCircle size={12} />
                       <span>{t('conversations.whatsapp.sendMode')}</span>
                    </div>
                    <input
                      value={whatsAppTo}
                      onChange={e => setWhatsAppTo(e.target.value)}
                      placeholder={t('conversations.whatsapp.phonePlaceholder')}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500"
                    />
                     <textarea
                       value={whatsAppBody}
                       onChange={e => setWhatsAppBody(e.target.value)}
                       placeholder={t('conversations.whatsapp.bodyPlaceholder')}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none"
                        rows={3}
                        disabled={Boolean(selectedTemplate)}
                      />
                     {loadingWhatsAppTemplates ? <p className="text-xs text-slate-500">Cargando plantillas...</p> : null}
                     {whatsAppTemplates.length > 0 ? (
                       <WhatsAppTemplatePicker
                         templates={whatsAppTemplates}
                         selectedId={selectedTemplate}
                         params={templateParams}
                         onSelect={setSelectedTemplate}
                         onParamsChange={setTemplateParams}
                       />
                     ) : null}
                     <p className="text-[11px] text-slate-500">
                       Usa <code>[TEMPLATE]|nombre|param1|param2</code> para enviar plantillas reales por WhatsApp.
                     </p>
                     <div className="flex gap-2">
                      <button
                        onClick={() => { setShowWhatsAppForm(false); setWhatsAppTo(''); setWhatsAppBody(''); setSelectedTemplate(''); setTemplateParams([]) }}
                        className="px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleSendWhatsApp}
                        disabled={!whatsAppTo || (!whatsAppBody && !selectedTemplate) || sendingWhatsApp}
                        className="px-3 py-2 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Send size={12} />
                        {t('conversations.whatsapp.send')}
                      </button>
                    </div>
                  </div>
                 ) : (
                   <div className="space-y-2">
                     {selected?.channel === 'whatsapp' && loadingWhatsAppTemplates ? <p className="text-[11px] text-slate-500">{t('conversations.whatsappTemplates.loading')}</p> : null}
                     {selected?.channel === 'whatsapp' && whatsAppTemplates.length > 0 ? (
                       <WhatsAppTemplatePicker
                         templates={whatsAppTemplates}
                         selectedId={inlineSelectedTemplate}
                         params={inlineTemplateParams}
                         onSelect={setInlineSelectedTemplate}
                         onParamsChange={setInlineTemplateParams}
                       />
                     ) : null}
                     {selected?.channel === 'whatsapp' && (
                        <p className="text-[11px] text-slate-500">
                          {t('conversations.whatsappTemplates.shortcutPrefix')} <code>{t('conversations.whatsappTemplates.shortcutCode')}</code>
                        </p>
                     )}
                     <form onSubmit={handleSendMessage} className="flex gap-2">
                       <input
                         value={newMessage}
                         onChange={e => setNewMessage(e.target.value)}
                         placeholder={t('conversations.typePlaceholder')}
                         className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                         disabled={Boolean(inlineSelectedTemplate)}
                       />
                       <button
                         type="submit"
                         disabled={(!newMessage.trim() && !inlineSelectedTemplate) || sending}
                         className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
                       >
                         <Send size={18} />
                       </button>
                     </form>
                   </div>
                 )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slot picker modal */}
      {showSlotPicker && suggestedSlots.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{t('conversations.appointment.pickSlot')}</h3>
              <button onClick={() => setShowSlotPicker(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-2 max-h-80 overflow-y-auto">
              {suggestedSlots.map((slot, i) => (
                <button
                  key={i}
                  onClick={() => handleCreateAppointment(slot)}
                  disabled={creatingAppointment}
                  className="w-full text-left px-4 py-3 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-blue-600" />
                    <span className="font-medium text-slate-900">{slot.label}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
              {t('conversations.appointment.slotHint')}
            </div>
          </div>
        </div>
      )}

      {/* New conversation modal */}
      {showNewForm && (
        <NewConversationModal
          onClose={() => setShowNewForm(false)}
          onCreated={async (id) => {
            setShowNewForm(false)
            setError('')
            setNewMessage('')
            setMessages([])
            setSelectedId(id)
            await loadConversations()
            await loadMessages(id)
          }}
          t={t}
        />
      )}
    </div>
  )
}

function NewConversationModal({ onClose, onCreated, t }: {
  onClose: () => void
  onCreated: (id: string) => void
  t: (key: string) => string
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError('')
    const fd = new FormData(e.currentTarget)
    try {
      const result = await createConversationAction(fd)
      onCreated(result.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{t('conversations.newTitle')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('conversations.fields.subject')}</label>
            <input name="subject" required placeholder={t('conversations.fields.subjectPlaceholder')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('conversations.fields.channel')}</label>
            <select name="channel" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="internal">{t('conversations.channels.internal')}</option>
              <option value="email">{t('conversations.channels.email')}</option>
              <option value="whatsapp">{t('conversations.channels.whatsapp')}</option>
              <option value="chatbot">{t('conversations.channels.chatbot')}</option>
              <option value="web_form">{t('conversations.channels.web_form')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('conversations.fields.contactName')}</label>
              <input name="contactName" placeholder={t('conversations.fields.contactNamePlaceholder')}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('conversations.fields.contactEmail')}</label>
              <input name="contactEmail" type="email" placeholder="email@ejemplo.com"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('conversations.fields.initialMessage')}</label>
            <textarea name="initialMessage" rows={3} placeholder={t('conversations.fields.initialMessagePlaceholder')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {pending ? t('conversations.creating') : t('conversations.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use server'

import { generateText } from 'ai'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { EmailSyncLockedError, ensureEmailSyncSchedulerStarted, getEmailSyncSchedulerSnapshot, runEmailInboxSyncWithServerLock } from '@/lib/email-sync-scheduler'
import { classifyMessage } from './intent-engine'
import { generateReply } from './reply-engine'
import { findAvailableSlots, suggestSlotsMessage } from './scheduling-engine'
import { generateHumanSuggestion } from './human-engine'
import { detectEmailDeliveryConfig, detectEmailDemoConfig, detectEmailInboundConfig, detectMicrosoftGraphConfig, fetchEmailsViaMicrosoftGraph, fetchInboundEmailsViaImap, generateEmailSubject, normalizeEmailSubject, parseEmailAddress, refreshMicrosoftGraphToken, resolveInboundTenantSlug, sendEmailViaDemo, sendEmailViaMicrosoftGraph, sendEmailViaResend, sendEmailViaSmtp } from './email-engine'
import { decryptToken, encryptToken, hasValidEncryptionKey } from '@/lib/email-token-encryption'
import { detectWhatsAppDeliveryConfig, normalizeWhatsAppRecipient, renderTemplate, sendWhatsAppViaMeta, validateWhatsAppNumber, WHATSAPP_TEMPLATES, getTemplateByName, resolveTemplateByKeyAndLocale } from './whatsapp-engine'
import { getRuleTemplate, RULE_TEMPLATES } from './automation-engine'
import { AI_MODELS, getOpenRouterProvider, hasAiProviderConfig } from '@/lib/ai/openrouter'
import { generateSessionId } from './chatbot-engine'
import { publishTemplateToMeta, syncTemplatesFromMeta } from './whatsapp-template-meta'
import { WHATSAPP_TEMPLATE_CATALOG, buildDefaultVariablesSchema, countTemplateVariables, getTemplateUsableFlag, renderTemplatePreview, slugifyTemplateKey } from './whatsapp-templates'
import type { ClassificationResult, MessageMetadata, MessageMetadataWithReply, MessageMetadataFull, EscalationData, EscalationStatus } from './intent-types'
import type { TimeSlot } from './scheduling-engine'
import type { EmailMetadata } from './email-engine'
import type { WhatsAppMetadata, WhatsAppOutboundResult } from './whatsapp-engine'
import type { WhatsAppTemplateVariable } from './whatsapp-templates'
import type { MetaTemplateSyncRecord } from './whatsapp-template-meta'

type ConversationsSupabaseClient = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createServiceRoleClient>

type TenantEmailConfigRow = {
  id: string
  tenant_id: string
  provider: string
  email_address: string
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  expires_at: string | null
  scopes: string[] | null
  status: string
  last_sync_at: string | null
  last_send_at: string | null
}

async function getTenantEmailGraphConfig(
  supabase: ConversationsSupabaseClient,
  tenantId: string
): Promise<TenantEmailConfigRow | null> {
  const { data, error } = await supabase
    .from('tenant_email_configs')
    .select('id, tenant_id, provider, email_address, access_token_encrypted, refresh_token_encrypted, expires_at, scopes, status, last_sync_at, last_send_at')
    .eq('tenant_id', tenantId)
    .eq('provider', 'microsoft_graph')
    .eq('status', 'active')
    .maybeSingle<TenantEmailConfigRow>()

  if (error || !data) return null

  const expiresAt = data.expires_at
  if (expiresAt && new Date(expiresAt) <= new Date()) {
    return data
  }

  return data
}

interface SyncResult {
  success: boolean
  error?: string
  fetched?: number
  imported?: number
  skipped?: number
  duplicates?: number
  threaded?: number
  created?: number
  irrelevant?: number
  failed?: number
  reason?: string | null
  skipped_reasons?: Record<string, number>
  failed_reasons?: Record<string, number>
}

async function performEmailInboxSyncViaGraph(args: {
  supabase: ConversationsSupabaseClient
  tenantId: string
  actorUserId?: string
  source: 'manual' | 'auto'
  emailConfig: TenantEmailConfigRow
  graphConfig: ReturnType<typeof detectMicrosoftGraphConfig>
}): Promise<SyncResult> {
  const { supabase, tenantId, actorUserId, source, emailConfig, graphConfig } = args

  const encryptionKey = process.env.EMAIL_TOKEN_ENCRYPTION_KEY?.trim()
  if (!encryptionKey) {
    return { success: false, error: 'Encryption key not configured' }
  }

  let accessToken: string | null = null

  const expiresAt = emailConfig.expires_at
  if (expiresAt && new Date(expiresAt) <= new Date()) {
    try {
      const refreshToken = decryptToken(emailConfig.refresh_token_encrypted!, encryptionKey)
      const refreshed = await refreshMicrosoftGraphToken(graphConfig, refreshToken)

      accessToken = refreshed.accessToken

      const encryptedAccess = encryptToken(refreshed.accessToken, encryptionKey)
      const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()

      await supabase.from('tenant_email_configs').update({
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptToken(refreshed.refreshToken, encryptionKey),
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      }).eq('id', emailConfig.id)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Token refresh failed' }
    }
  } else {
    try {
      accessToken = decryptToken(emailConfig.access_token_encrypted!, encryptionKey)
    } catch {
      return { success: false, error: 'Failed to decrypt access token' }
    }
  }

  if (!accessToken) {
    return { success: false, error: 'No access token available' }
  }

  try {
    const emails = await fetchEmailsViaMicrosoftGraph(accessToken, {
      mailbox: 'INBOX',
      maxFetch: 25,
    })

    let summaryTenantId = tenantId
    let imported = 0
    let skipped = 0
    let duplicates = 0
    const failures: string[] = []
    const skippedReasons: Record<string, number> = {}
    const failedReasons: Record<string, number> = {}
    let threaded = 0
    let created = 0
    let irrelevant = 0

    for (const email of emails) {
      const payload = source === 'manual'
        ? { ...email, tenant_id: tenantId }
        : email

      const result = await processInboundEmailAction(payload, { supabase })

      if ('tenantId' in result && typeof result.tenantId === 'string' && result.tenantId) {
        summaryTenantId = result.tenantId
      }

      if (result.status === 'ok') {
        imported += 1
        if (result.isNewConversation) created += 1
        else threaded += 1
      } else if (result.status === 'duplicate') {
        duplicates += 1
        skipped += 1
        skippedReasons.duplicate = (skippedReasons.duplicate || 0) + 1
      } else if (result.status === 'skipped') {
        skipped += 1
      } else if (result.status === 'failed') {
        const reason = result.reason || 'failed'
        failures.push(reason)
        failedReasons[reason] = (failedReasons[reason] || 0) + 1
      }

      if (result.status === 'skipped' && result.reason) {
        skippedReasons[result.reason] = (skippedReasons[result.reason] || 0) + 1
        if (result.reason.startsWith('Irrelevant inbox email:')) irrelevant += 1
      }
    }

    console.info('[email sync scheduler] Graph sync summary', {
      source,
      tenantId,
      summaryTenantId,
    })

    await insertChannelEvent(supabase, {
      tenantId: summaryTenantId,
      actorUserId,
      eventType: failures.length > 0 ? 'email.inbound.sync.failed' : 'email.inbound.sync.completed',
      payload: {
        source,
        provider: 'microsoft_graph',
        configured_tenant_id: tenantId,
        summary_tenant_id: summaryTenantId,
        lock: 'server_file',
        fetched: emails.length,
        imported,
        skipped,
        duplicates,
        threaded,
        created,
        irrelevant,
        failed: failures.length,
        reason: failures[0] || null,
        skipped_reasons: skippedReasons,
        failed_reasons: failedReasons,
      },
    })

    await supabase.from('tenant_email_configs').update({
      last_sync_at: new Date().toISOString(),
    }).eq('id', emailConfig.id)

    return {
      success: true,
      fetched: emails.length,
      imported,
      skipped,
      duplicates,
      threaded,
      created,
      irrelevant,
      failed: failures.length,
      reason: failures[0] || null,
      skipped_reasons: skippedReasons,
      failed_reasons: failedReasons,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Graph fetch failed'

    await insertChannelEvent(supabase, {
      tenantId,
      actorUserId,
      eventType: 'email.inbound.sync.failed',
      payload: {
        provider: 'microsoft_graph',
        reason,
        source,
        configured_tenant_id: tenantId,
        summary_tenant_id: tenantId,
        lock: 'server_file',
      },
    })

    return { success: false, error: reason }
  }
}

async function performEmailInboxSyncViaDemo(args: {
  supabase: ConversationsSupabaseClient
  tenantId: string
  actorUserId?: string
  source: 'manual' | 'auto'
}): Promise<SyncResult> {
  const { supabase, tenantId, actorUserId, source } = args

  const mockInboundEmails = [
    {
      uid: Date.now(),
      from: 'Juan Pérez <juan.perez@gmail.com>',
      to: 'agente@growthiaglobalcrm.com',
      subject: 'Consulta sobre propiedad en venta',
      text: 'Hola, me interesa saber más sobre el apartamento en el centro. Tengo presupuesto hasta 200.000 euros y necesito 2 habitaciones. Gracias.',
      html: '<p>Hola, me interesa saber más sobre el apartamento en el centro. Tengo presupuesto hasta 200.000 euros y necesito 2 habitaciones. Gracias.</p>',
      date: new Date().toISOString(),
      message_id: `<demo-${Date.now()}-${Math.random().toString(36).slice(2, 11)}@gmail.com>`,
      in_reply_to: undefined,
      references: [],
    },
  ]

  let summaryTenantId = tenantId
  let imported = 0
  let skipped = 0
  let duplicates = 0
  const failures: string[] = []
  const skippedReasons: Record<string, number> = {}
  const failedReasons: Record<string, number> = {}
  let threaded = 0
  let created = 0
  let irrelevant = 0

  for (const email of mockInboundEmails) {
    const payload = source === 'manual'
      ? { ...email, tenant_id: tenantId }
      : email

    const result = await processInboundEmailAction(payload, { supabase })

    if ('tenantId' in result && typeof result.tenantId === 'string' && result.tenantId) {
      summaryTenantId = result.tenantId
    }

    if (result.status === 'ok') {
      imported += 1
      if (result.isNewConversation) created += 1
      else threaded += 1
    } else if (result.status === 'duplicate') {
      duplicates += 1
      skipped += 1
      skippedReasons.duplicate = (skippedReasons.duplicate || 0) + 1
    } else if (result.status === 'skipped') {
      skipped += 1
    } else if (result.status === 'failed') {
      const reason = result.reason || 'failed'
      failures.push(reason)
      failedReasons[reason] = (failedReasons[reason] || 0) + 1
    }

    if (result.status === 'skipped' && result.reason) {
      skippedReasons[result.reason] = (skippedReasons[result.reason] || 0) + 1
      if (result.reason.startsWith('Irrelevant inbox email:')) irrelevant += 1
    }
  }

  console.info('[email sync scheduler] demo sync summary', {
    source,
    tenantId,
    summaryTenantId,
  })

  await insertChannelEvent(supabase, {
    tenantId: summaryTenantId,
    actorUserId,
    eventType: failures.length > 0 ? 'email.inbound.sync.failed' : 'email.inbound.sync.completed',
    payload: {
      source,
      provider: 'email_demo',
      configured_tenant_id: tenantId,
      summary_tenant_id: summaryTenantId,
      lock: 'server_file',
      fetched: mockInboundEmails.length,
      imported,
      skipped,
      duplicates,
      threaded,
      created,
      irrelevant,
      failed: failures.length,
      reason: failures[0] || null,
      skipped_reasons: skippedReasons,
      failed_reasons: failedReasons,
      simulated: true,
    },
  })

  return {
    success: true,
    fetched: mockInboundEmails.length,
    imported,
    skipped,
    duplicates,
    threaded,
    created,
    irrelevant,
    failed: failures.length,
    reason: failures[0] || null,
    skipped_reasons: skippedReasons,
    failed_reasons: failedReasons,
  }
}

function describeSupabaseFetchFailure(context: string, error: unknown) {
  let message = 'Unknown error'
  if (error instanceof Error) {
    message = error.message
  } else if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    message = (typeof e.message === 'string' && e.message !== '[object Object]') ? e.message : JSON.stringify(error)
  } else {
    message = String(error)
  }
  if (!message.includes('fetch failed')) return message

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'NEXT_PUBLIC_SUPABASE_URL not configured'
  return `Supabase REST unreachable at ${url} while ${context}; received connection reset during fetch`
}

async function getTenantId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (error) throw new Error(describeSupabaseFetchFailure('loading authenticated tenant', error))

  if (!profile?.tenant_id) throw new Error('Tenant no encontrado')
  return profile.tenant_id
}

function buildChatbotConversationSubject(initialMessage: string, fallbackSubject: string) {
  const cleaned = initialMessage.replace(/\s+/g, ' ').trim()
  if (!cleaned) return fallbackSubject || 'Chatbot conversation'
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned
}

function buildInternalOrigin(headerStore: Awaited<ReturnType<typeof headers>>) {
  const protocol = headerStore.get('x-forwarded-proto') || 'http'
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host')
  if (!host) throw new Error('No se pudo resolver el host actual para procesar el chatbot')
  return `${protocol}://${host}`
}

async function insertControlledChatbotFailureMessage(args: {
  supabase: ConversationsSupabaseClient
  tenantId: string
  conversationId: string
  content: string
  senderUserId: string | undefined
  channel: string
}) {
  await args.supabase.from('conversation_messages').insert([
    {
      conversation_id: args.conversationId,
      tenant_id: args.tenantId,
      sender_user_id: args.senderUserId,
      direction: 'inbound',
      channel: args.channel,
      status: 'delivered',
      content: args.content,
    },
    {
      conversation_id: args.conversationId,
      tenant_id: args.tenantId,
      direction: 'outbound',
      channel: args.channel,
      status: 'sent',
      content: 'No pude completar la reserva en este momento. Intenta de nuevo y reviso la cita otra vez.',
      is_automated: true,
      metadata: {
        chatbot_reply_type: 'fallback',
        chatbot_reply_source: 'conversations_controlled_error',
      },
    },
  ])
}

function createServiceRoleClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role is not configured')
  }

  return createSupabaseAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type TenantWhatsAppTemplateRow = {
  id: string
  tenant_id: string
  provider: string
  template_key: string
  meta_template_name: string
  locale: string
  language_code: string
  category: string
  status: string
  meta_status: string | null
  meta_template_id: string | null
  body_text: string
  header_text: string | null
  footer_text: string | null
  variables_count: number
  variables_schema: WhatsAppTemplateVariable[] | null
  last_synced_at: string | null
  rejection_reason: string | null
  last_error: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type TenantWhatsAppConfigRow = {
  phone_number_id: string
  display_phone_number: string | null
  whatsapp_business_account_id: string | null
  access_token_encrypted: string | null
  mode: string
  status: string
}

type MetaPhoneNumberDiagnostics = {
  phoneNumberId: string | null
  displayPhoneNumber: string | null
  verifiedName: string | null
  qualityRating: string | null
  nameStatus: string | null
  codeVerificationStatus: string | null
  isOfficialBusinessAccount: boolean | null
}

type MetaWabaDiagnostics = {
  id: string | null
  name: string | null
}

function normalizePhoneComparison(value: string | null | undefined) {
  return (value || '').replace(/[^0-9+]/g, '')
}

async function parseMetaDiagnosticsResponse(response: Response) {
  const raw = await response.text()
  let parsed: any = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const apiError = parsed?.error
    const message = apiError?.message || apiError?.error_user_msg || raw || `Meta API responded with ${response.status}`
    const code = apiError?.code ? `code=${apiError.code}` : null
    const subcode = apiError?.error_subcode ? `subcode=${apiError.error_subcode}` : null
    throw new Error([message, code, subcode].filter(Boolean).join(' | '))
  }

  return parsed
}

async function fetchMetaPhoneNumberDiagnostics(args: {
  token: string
  phoneNumberId: string
  whatsappBusinessAccountId?: string | null
}) {
  const phoneUrl = new URL(`https://graph.facebook.com/v23.0/${args.phoneNumberId}`)
  phoneUrl.searchParams.set('fields', 'id,display_phone_number,verified_name,quality_rating,name_status,code_verification_status,is_official_business_account')

  const phoneResponse = await fetch(phoneUrl.toString(), {
    headers: { Authorization: `Bearer ${args.token}` },
    cache: 'no-store',
  })

  const phoneParsed = await parseMetaDiagnosticsResponse(phoneResponse)
  const phone: MetaPhoneNumberDiagnostics = {
    phoneNumberId: typeof phoneParsed?.id === 'string' ? phoneParsed.id : args.phoneNumberId,
    displayPhoneNumber: typeof phoneParsed?.display_phone_number === 'string' ? phoneParsed.display_phone_number : null,
    verifiedName: typeof phoneParsed?.verified_name === 'string' ? phoneParsed.verified_name : null,
    qualityRating: typeof phoneParsed?.quality_rating === 'string' ? phoneParsed.quality_rating : null,
    nameStatus: typeof phoneParsed?.name_status === 'string' ? phoneParsed.name_status : null,
    codeVerificationStatus: typeof phoneParsed?.code_verification_status === 'string' ? phoneParsed.code_verification_status : null,
    isOfficialBusinessAccount: typeof phoneParsed?.is_official_business_account === 'boolean' ? phoneParsed.is_official_business_account : null,
  }

  let waba: MetaWabaDiagnostics | null = null
  if (args.whatsappBusinessAccountId?.trim()) {
    const wabaUrl = new URL(`https://graph.facebook.com/v23.0/${args.whatsappBusinessAccountId.trim()}`)
    wabaUrl.searchParams.set('fields', 'id,name')

    const wabaResponse = await fetch(wabaUrl.toString(), {
      headers: { Authorization: `Bearer ${args.token}` },
      cache: 'no-store',
    })

    const wabaParsed = await parseMetaDiagnosticsResponse(wabaResponse)
    waba = {
      id: typeof wabaParsed?.id === 'string' ? wabaParsed.id : args.whatsappBusinessAccountId.trim(),
      name: typeof wabaParsed?.name === 'string' ? wabaParsed.name : null,
    }
  }

  return { phone, waba }
}

function safeTemplateVariables(value: unknown, bodyText: string) {
  if (Array.isArray(value)) {
    return value as WhatsAppTemplateVariable[]
  }
  return buildDefaultVariablesSchema(bodyText)
}

function repairVariablesSchema(rawSchema: WhatsAppTemplateVariable[], bodyText: string): WhatsAppTemplateVariable[] {
  const count = countTemplateVariables(bodyText)
  if (count === 0) return []
  return Array.from({ length: count }, (_, i) => {
    const v = rawSchema[i]
    const example = (v?.example ?? '').trim() || (v?.label ?? '').trim() || (v?.key ?? '').trim() || `Ejemplo ${i + 1}`
    const label = (v?.label ?? '').trim() || `Variable ${i + 1}`
    const key = (v?.key ?? '').trim() || `param_${i + 1}`
    return { key, label, example, required: v?.required ?? true }
  })
}

function buildTemplatePayload(row: TenantWhatsAppTemplateRow) {
  const variablesSchema = safeTemplateVariables(row.variables_schema, row.body_text)
  const usable = getTemplateUsableFlag({
    isActive: row.is_active,
    metaStatus: row.meta_status,
    status: row.status,
  })

  return {
    ...row,
    variables_schema: variablesSchema,
    usable,
  }
}

function mapMetaTemplateStatus(metaStatus: string | null | undefined, isActive: boolean) {
  if (!isActive) return 'archived'
  switch ((metaStatus || '').toUpperCase()) {
    case 'APPROVED':
      return 'approved'
    case 'REJECTED':
      return 'rejected'
    case 'PENDING':
    case 'IN_REVIEW':
      return 'in_review'
    case 'PAUSED':
    case 'DISABLED':
      return 'sync_error'
    default:
      return 'pending_meta'
  }
}

function validateTemplateDefinition(args: {
  bodyText: string
  variablesSchema: WhatsAppTemplateVariable[]
  metaTemplateName: string
}) {
  const bodyText = args.bodyText.trim()
  const variableCount = countTemplateVariables(bodyText)
  if (!bodyText) throw new Error('El cuerpo de la plantilla es obligatorio')
  if (!args.metaTemplateName.trim()) throw new Error('El nombre de plantilla para Meta es obligatorio')
  if (variableCount !== args.variablesSchema.length) {
    throw new Error(`La plantilla declara ${variableCount} variables en el texto y ${args.variablesSchema.length} definiciones en el esquema.`)
  }
  for (const [index, variable] of args.variablesSchema.entries()) {
    if (!variable.label?.trim()) throw new Error(`Falta la etiqueta de la variable ${index + 1}`)
    if (!variable.example?.trim()) throw new Error(`Falta el ejemplo de la variable ${index + 1}`)
  }
  return variableCount
}

function buildMetaTemplateMatchKey(name: string | null | undefined, language: string | null | undefined) {
  return `${(name || '').trim()}::${(language || 'es').trim() || 'es'}`
}

function normalizeMetaTemplateCategory(category: string | null | undefined) {
  const normalized = (category || 'utility').trim().toLowerCase()
  if (normalized === 'marketing' || normalized === 'authentication') return normalized
  return 'utility'
}

function getMetaTemplateComponentText(template: MetaTemplateSyncRecord, type: 'HEADER' | 'BODY' | 'FOOTER') {
  const component = template.components?.find((item) => (item.type || '').toUpperCase() === type)
  return component?.text?.trim() || null
}

function buildVariablesSchemaFromMetaTemplate(template: MetaTemplateSyncRecord) {
  const bodyText = getMetaTemplateComponentText(template, 'BODY') || ''
  return buildDefaultVariablesSchema(bodyText)
}

function matchMetaTemplateRecord(args: {
  row: Pick<TenantWhatsAppTemplateRow, 'meta_template_id' | 'meta_template_name' | 'language_code'>
  metaById: Map<string, MetaTemplateSyncRecord>
  metaByKey: Map<string, MetaTemplateSyncRecord>
}) {
  const { row, metaById, metaByKey } = args
  if (row.meta_template_id?.trim()) {
    const byId = metaById.get(row.meta_template_id.trim())
    if (byId) return byId
  }
  return metaByKey.get(buildMetaTemplateMatchKey(row.meta_template_name, row.language_code)) || null
}

async function ensureTenantWhatsAppTemplateSeed(args: {
  supabase: ConversationsSupabaseClient
  tenantId: string
  userId?: string | null
}) {
  const { supabase, tenantId, userId } = args

  const { data: existingRows, error: existingError } = await supabase
    .from('tenant_whatsapp_templates')
    .select('template_key')
    .eq('tenant_id', tenantId)

  if (existingError) throw new Error(`No se pudo leer el catálogo WhatsApp existente: ${existingError.message}`)

  const existingKeys = new Set((existingRows || []).map((row) => row.template_key))
  const missingTemplates = WHATSAPP_TEMPLATE_CATALOG.filter((template) => !existingKeys.has(template.template_key))

  if (missingTemplates.length > 0) {
    const { error: insertError } = await supabase
      .from('tenant_whatsapp_templates')
      .insert(missingTemplates.map((template) => ({
        tenant_id: tenantId,
        provider: 'meta_cloud',
        template_key: template.template_key,
        meta_template_name: template.meta_template_name,
        locale: template.locale,
        language_code: template.language_code,
        category: template.category,
        body_text: template.body_text,
        header_text: template.header_text,
        footer_text: template.footer_text,
        variables_count: template.variables_schema.length,
        variables_schema: template.variables_schema,
        is_active: true,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
        metadata: { seeded_by: 'server_action_catalog_bootstrap', base_template_key: template.base_template_key },
        created_by: userId || null,
      })))

    if (insertError) throw new Error(`No se pudo normalizar el catálogo WhatsApp: ${insertError.message}`)
  }

  const { error: repairError } = await supabase
    .from('tenant_whatsapp_templates')
    .update({ is_active: true })
    .eq('tenant_id', tenantId)
    .is('is_active', null)

  if (repairError) throw new Error(`No se pudo reparar el catálogo WhatsApp: ${repairError.message}`)
}

async function getActiveTenantWhatsAppConfig(supabase: ConversationsSupabaseClient, tenantId: string) {
  const response = await supabase
    .from('tenant_whatsapp_configs')
    .select('phone_number_id, display_phone_number, whatsapp_business_account_id, access_token_encrypted, mode, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle<TenantWhatsAppConfigRow>()

  return response.data || null
}

function assertTenantMetaTemplateConfig(config: TenantWhatsAppConfigRow | null) {
  if (!config) {
    throw new Error('No existe una configuración activa de WhatsApp para este tenant.')
  }
  if (!config.access_token_encrypted?.trim()) {
    throw new Error('La configuración activa de WhatsApp no tiene Access Token.')
  }
  if (!config.whatsapp_business_account_id?.trim()) {
    throw new Error('La configuración activa de WhatsApp no tiene WhatsApp Business Account ID.')
  }

  return {
    token: config.access_token_encrypted.trim(),
    whatsappBusinessAccountId: config.whatsapp_business_account_id.trim(),
  }
}

async function getTenantWhatsAppTemplatesForUi(supabase: ConversationsSupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from('tenant_whatsapp_templates')
    .select('id, tenant_id, provider, template_key, meta_template_name, locale, language_code, category, status, meta_status, meta_template_id, body_text, header_text, footer_text, variables_count, variables_schema, last_synced_at, rejection_reason, last_error, is_active, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('category', { ascending: true })
    .order('template_key', { ascending: true })

  if (error) throw new Error(`No se pudieron cargar las plantillas WhatsApp: ${error.message}`)
  return (data || []).map((row) => buildTemplatePayload(row as TenantWhatsAppTemplateRow))
}

async function resolveInboundTenantIdFromEnv() {
  const slug = process.env.EMAIL_INBOUND_TENANT_SLUG?.trim()
  if (!slug) throw new Error('EMAIL_INBOUND_TENANT_SLUG is not configured')
  const admin = createServiceRoleClient()
  const { data, error } = await admin.from('tenants').select('id').eq('slug', slug).single()
  if (error) throw new Error(describeSupabaseFetchFailure(`resolving inbound tenant slug "${slug}"`, error))
  if (!data?.id) throw new Error('Inbound tenant not found')
  return data.id as string
}

function buildChannelDiagnosticsBase() {
  const emailConfig = detectEmailDeliveryConfig(process.env)
  const emailInboundConfig = detectEmailInboundConfig(process.env)
  const whatsappConfig = detectWhatsAppDeliveryConfig(process.env)
  const graphConfig = detectMicrosoftGraphConfig(process.env)
  const demoConfig = detectEmailDemoConfig(process.env)

  const emailPresence = getEnvPresence(process.env, EMAIL_ENV_KEYS)
  const emailImapPresence = getEnvPresence(process.env, EMAIL_IMAP_ENV_KEYS)
  const whatsappPresence = getEnvPresence(process.env, WHATSAPP_ENV_KEYS)

  return {
    runtimeError: null as string | null,
    email: {
      configured: emailConfig.configured,
      provider: emailConfig.provider,
      presentVars: emailPresence.present,
      missingVars: emailPresence.missing,
      latestTest: null,
      graph: {
        configured: graphConfig.configured,
        presentVars: graphConfig.configured ? (graphConfig.scopes || []) : [],
        missingVars: !graphConfig.configured ? ['MICROSOFT_GRAPH_CLIENT_ID', 'MICROSOFT_GRAPH_CLIENT_SECRET', 'MICROSOFT_GRAPH_REDIRECT_URI'].filter(k => !process.env[k]?.trim()) : [],
        dbConfig: null as {
          activeConfig: boolean
          emailAddress: string | null
          status: string | null
          expiresAt: string | null
          lastSendAt: string | null
          lastSyncAt: string | null
          requiresReconnect: boolean
        } | null,
      },
      demo: {
        enabled: demoConfig.enabled,
      },
      inbound: {
        configured: emailInboundConfig.configured,
        presentVars: emailImapPresence.present,
        missingVars: emailImapPresence.missing,
        latestSync: null,
        latestSyncManual: null,
        latestSyncAuto: null,
        latestSyncAutoImported: null,
        scheduler: getEmailSyncSchedulerSnapshot(),
      },
    },
    whatsapp: {
      configured: whatsappConfig.configured && whatsappPresence.missing.length === 0,
      provider: whatsappConfig.provider,
      mode: 'sandbox' as const,
      presentVars: whatsappPresence.present,
      missingVars: whatsappPresence.missing,
      latestTest: null,
      dbConfig: null as {
        activeConfig: boolean
        phoneNumberId: string | null
        displayPhoneNumber: string | null
        status: string | null
        verifiedAt: string | null
        mode: string | null
        accessTokenConfigured: boolean
        isComplete: boolean
        canTest: boolean
        productionChecklist: string[]
        productionReady: boolean
        metaPhoneNumber: {
          phoneNumberId: string | null
          displayPhoneNumber: string | null
          verifiedName: string | null
          qualityRating: string | null
          nameStatus: string | null
          codeVerificationStatus: string | null
          isOfficialBusinessAccount: boolean | null
        } | null
        metaWaba: {
          id: string | null
          name: string | null
        } | null
        metaDiagnosticsError: string | null
        displayNumberMismatch: boolean
        resolvedEnvironment: 'sandbox' | 'production'
        isTestNumber: boolean
      } | null,
      configSource: 'none' as 'none' | 'db_config' | 'env_fallback',
    },
  }
}

const EMAIL_ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME'] as const
const EMAIL_IMAP_ENV_KEYS = ['EMAIL_IMAP_HOST', 'EMAIL_IMAP_PORT', 'EMAIL_IMAP_SECURE', 'EMAIL_IMAP_USER', 'EMAIL_IMAP_PASS', 'EMAIL_INBOUND_TENANT_SLUG'] as const
const WHATSAPP_ENV_KEYS = ['WHATSAPP_BUSINESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN'] as const

function getEnvPresence(env: Record<string, string | undefined>, keys: readonly string[]) {
  const present = keys.filter((key) => Boolean(env[key]?.trim()))
  const missing = keys.filter((key) => !env[key]?.trim())
  return { present, missing }
}

async function getLatestChannelTestEvent(
  supabase: ConversationsSupabaseClient,
  tenantId: string,
  eventTypes: string[]
) {
  return getLatestChannelEventBySource(supabase, tenantId, eventTypes)
}

async function getLatestChannelEventBySource(
  supabase: ConversationsSupabaseClient,
  tenantId: string,
  eventTypes: string[],
  source?: 'manual' | 'auto'
) {
  let query = supabase
    .from('automation_events')
    .select('event_type, payload, created_at')
    .eq('tenant_id', tenantId)
    .in('event_type', eventTypes)
    .order('created_at', { ascending: false })

  if (source) {
    // Filter at the database level to avoid client-side mismatches.
    query = query.eq('payload->>source', source).limit(1)
  } else {
    query = query.limit(20)
  }

  const { data } = await query

  if (!data) return null
  return data[0] || null
}

async function getLatestAutomaticEmailSyncEventForDiagnostics(
  supabase: ConversationsSupabaseClient,
  tenantId: string
) {
  const directEvent = await getLatestChannelEventBySource(
    supabase,
    tenantId,
    ['email.inbound.sync.completed', 'email.inbound.sync.failed'],
    'auto'
  )

  if (directEvent) return directEvent

  const admin = createServiceRoleClient()
  const { data } = await admin
    .from('automation_events')
    .select('event_type, payload, created_at')
    .in('event_type', ['email.inbound.sync.completed', 'email.inbound.sync.failed'])
    .eq('payload->>source', 'auto')
    .eq('payload->>configured_tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)

  return data?.[0] || null
}

function hasInboundSyncImportActivity(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return false

  const imported = typeof payload.imported === 'number' ? payload.imported : Number(payload.imported || 0)
  const created = typeof payload.created === 'number' ? payload.created : Number(payload.created || 0)
  const threaded = typeof payload.threaded === 'number' ? payload.threaded : Number(payload.threaded || 0)

  return imported > 0 || created > 0 || threaded > 0
}

function normalizeEmailIdentity(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ''
}

function extractNormalizedMailbox(value: string) {
  const normalized = normalizeEmailIdentity(value)
  const match = normalized.match(/[a-z0-9._%+-]+@([a-z0-9-]+\.)+[a-z]{2,}/i)
  return match?.[0] || normalized
}

function isCommonHumanMailbox(email: string) {
  const normalized = extractNormalizedMailbox(email)
  const domain = normalized.split('@')[1] || ''

  if (domain === 'gmail.com') return true
  if (/^(hotmail|outlook|live|yahoo)\.[a-z.]+$/.test(domain)) return true

  return ['icloud.com', 'me.com', 'mac.com'].includes(domain)
}

function isIrrelevantInboxEmail(params: { fromEmail: string; subject: string; text: string; html?: string }) {
  const fromEmail = normalizeEmailIdentity(params.fromEmail)
  const subject = params.subject.trim().toLowerCase()
  const body = `${params.text || ''} ${params.html || ''}`.toLowerCase()

  const senderHints = [
    'no-reply',
    'noreply',
    'do-not-reply',
    'donotreply',
    'mailer-daemon',
    'postmaster',
    'notifications@',
    'notification@',
    'news@',
    'newsletter@',
    'info@',
    'updates@',
    'hello@',
    'marketing@',
    'nextdoor',
    'groupon',
    'gumtree',
    'survey.',
    'jobplacements',
    'moneybox',
    'newsletter.',
    'ubereats',
    'uber@',
    'samsung-',
    'vodafone',
    'amazonflex',
    'indeedemail',
    'fco.gov.uk',
    'millbanklaw',
    'morales.uk',
  ]

  const contentHints = [
    'unsubscribe',
    'manage preferences',
    'view in browser',
    'weekly digest',
    'daily digest',
    'newsletter',
    'promocion',
    'promotional',
    'special offer',
    'oferta limitada',
    'webinar',
    'encuesta',
    'survey',
    'boletin',
    'privacy policy',
    'terms of service',
    'job alert',
    'publicacion destacada',
    'publicación destacada',
    'loan application',
    'groupon',
    'nextdoor',
    'gumtree',
    'the panel station',
    'tesco',
    'employment',
    'vacant',
    'account cancellation',
    'device plan',
    'verification code',
    'visa',
    'policy documents',
    'insurance',
    'outstanding documents',
    'order #',
    'induction',
  ]

  if (senderHints.some((hint) => fromEmail.includes(hint))) {
    return 'Irrelevant inbox email: automated sender'
  }

  if (contentHints.some((hint) => subject.includes(hint) || body.includes(hint))) {
    return 'Irrelevant inbox email: promotional or bulk content'
  }

  return null
}

async function resolveInboundEmailContact(
  supabase: ConversationsSupabaseClient,
  tenantId: string,
  fromEmail: string
) {
  const normalizedEmail = normalizeEmailIdentity(fromEmail)
  if (!normalizedEmail) return { leadId: null as string | null, participantConversationIds: [] as string[] }

  const [{ data: leads }, { data: participants }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, email')
      .eq('tenant_id', tenantId)
      .eq('email', normalizedEmail)
      .limit(1),
    supabase
      .from('conversation_participants')
      .select('conversation_id, contact_email')
      .eq('contact_email', normalizedEmail)
      .limit(20),
  ])

  return {
    leadId: leads?.[0]?.id || null,
    participantConversationIds: (participants || []).map((entry) => entry.conversation_id).filter((value): value is string => typeof value === 'string'),
  }
}

async function getLatestAutomaticEmailSyncImportEventForDiagnostics(
  supabase: ConversationsSupabaseClient,
  tenantId: string
) {
  const { data: directEvents } = await supabase
    .from('automation_events')
    .select('event_type, payload, created_at')
    .eq('tenant_id', tenantId)
    .in('event_type', ['email.inbound.sync.completed', 'email.inbound.sync.failed'])
    .eq('payload->>source', 'auto')
    .order('created_at', { ascending: false })
    .limit(20)

  const directMatch = (directEvents || []).find((event) => hasInboundSyncImportActivity(event.payload as Record<string, unknown> | null))
  if (directMatch) return directMatch

  const admin = createServiceRoleClient()
  const { data: fallbackEvents } = await admin
    .from('automation_events')
    .select('event_type, payload, created_at')
    .in('event_type', ['email.inbound.sync.completed', 'email.inbound.sync.failed'])
    .eq('payload->>source', 'auto')
    .eq('payload->>configured_tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20)

  return (fallbackEvents || []).find((event) => hasInboundSyncImportActivity(event.payload as Record<string, unknown> | null)) || null
}

async function insertChannelEvent(
  supabase: ConversationsSupabaseClient,
  params: {
    tenantId: string
    actorUserId?: string
    eventType: string
    payload: Record<string, unknown>
  }
) {
  const { error } = await supabase.from('automation_events').insert({
    tenant_id: params.tenantId,
    event_type: params.eventType,
    entity_type: 'channel',
    entity_id: null,
    actor_user_id: params.actorUserId,
    payload: params.payload,
  })

  if (error) {
    console.error('[channels] automation event insert failed', {
      eventType: params.eventType,
      error: error.message,
      payload: params.payload,
    })
  }
}

function isUnsafeEmailForAiReply(fromEmail: string, subject: string, body = '') {
  const email = fromEmail.toLowerCase()
  const normalizedSubject = subject.toLowerCase()
  const normalizedBody = body.toLowerCase()
  return (
    email.includes('no-reply') ||
    email.includes('noreply') ||
    email.includes('donotreply') ||
    email.includes('mailer-daemon') ||
    normalizedSubject.includes('unsubscribe') ||
    normalizedSubject.includes('newsletter') ||
    normalizedSubject.includes('verification code') ||
    normalizedBody.includes('unsubscribe') ||
    normalizedBody.includes('manage preferences') ||
    normalizedBody.includes('view in browser')
  )
}

async function sendEmailAiReplyByMessageId(args: {
  supabase: ConversationsSupabaseClient
  tenantId: string
  actorUserId?: string
  messageId: string
  mode: 'email_manual_test' | 'email_auto'
}) {
  const { supabase, tenantId, actorUserId, messageId, mode } = args

  const { data: msg } = await supabase
    .from('conversation_messages')
    .select('id, conversation_id, tenant_id, channel, direction, content, is_automated, metadata, created_at')
    .eq('id', messageId)
    .eq('tenant_id', tenantId)
    .single()

  if (!msg) throw new Error('Mensaje no encontrado')
  if (msg.channel !== 'email' || msg.direction !== 'inbound') throw new Error('La respuesta IA solo aplica a emails inbound')
  if (msg.is_automated) throw new Error('No se permite responder con IA a mensajes automaticos')

  const msgMeta = (msg.metadata || {}) as Record<string, unknown>
  const fromEmail = parseEmailAddress(typeof msgMeta.email_from === 'string' ? msgMeta.email_from : '').email
  const subject = typeof msgMeta.email_subject === 'string' ? msgMeta.email_subject : 'Conversacion email'

  if (!fromEmail) throw new Error('El email inbound no tiene remitente valido')
  if (isUnsafeEmailForAiReply(fromEmail, subject, msg.content)) {
    throw new Error('Este email parece automatico o irrelevante y no es seguro responder con IA')
  }

  const deliveryConfig = detectEmailDeliveryConfig(process.env)
  const fromSystemEmail = deliveryConfig.smtp?.fromEmail?.toLowerCase()
  if (fromSystemEmail && fromEmail.toLowerCase() === fromSystemEmail) {
    throw new Error('No se permite responder automaticamente a emails enviados por el propio sistema')
  }

  const { data: existingAiReply } = await supabase
    .from('conversation_messages')
    .select('id')
    .eq('conversation_id', msg.conversation_id)
    .eq('tenant_id', tenantId)
    .eq('direction', 'outbound')
    .contains('metadata', { based_on_message_id: messageId, ai_reply_mode: mode })
    .limit(1)
    .maybeSingle()

  if (existingAiReply) throw new Error('Este mensaje ya tiene una respuesta IA enviada')

  const classification = classifyMessage(msg.content)
  if (classification.decision.decision === 'require_human' || classification.decision.decision === 'no_action') {
    throw new Error('La clasificacion marco este email para humano o sin respuesta automatica')
  }

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, subject, metadata')
    .eq('id', msg.conversation_id)
    .eq('tenant_id', tenantId)
    .single()

  if (!conversation) throw new Error('Conversacion no encontrada')
  if (!hasAiProviderConfig()) throw new Error('OPENROUTER_API_KEY no esta configurada')
  const canSendEmail = deliveryConfig.configured && (
    (deliveryConfig.provider === 'smtp' && !!deliveryConfig.smtp) ||
    (deliveryConfig.provider === 'resend' && !!deliveryConfig.resend)
  )
  if (!canSendEmail) {
    throw new Error('El proveedor de email no esta configurado completamente para enviar la respuesta IA')
  }

  const { data: recentMessages } = await supabase
    .from('conversation_messages')
    .select('direction, content, metadata, created_at, is_automated')
    .eq('conversation_id', msg.conversation_id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(6)

  const transcript = (recentMessages || [])
    .reverse()
    .map((entry) => `${entry.direction === 'inbound' ? 'Cliente' : 'Equipo'}: ${entry.content}`)
    .join('\n\n')

  const openrouter = getOpenRouterProvider()
  const { text } = await generateText({
    model: openrouter(AI_MODELS.balanced),
    system: [
      'Eres el dueno o responsable comercial de una inmobiliaria.',
      'Responde por email de forma profesional, breve, clara y util.',
      'No inventes datos que no esten en el mensaje.',
      'No uses saludos excesivos ni lenguaje robotico.',
      'No menciones que eres IA.',
      'Si faltan datos, pide solo la informacion minima necesaria.',
      'No respondas con marketing generico ni con frases vacias.',
    ].join(' '),
    prompt: [
      `Asunto del hilo: ${subject}`,
      `Clasificacion: ${classification.intent.intent} / ${classification.decision.decision}`,
      `Ultimo email del cliente: ${msg.content}`,
      transcript ? `Contexto reciente:\n${transcript}` : '',
      'Redacta una respuesta email lista para enviar en menos de 140 palabras.',
    ].filter(Boolean).join('\n\n'),
    temperature: 0.3,
    maxOutputTokens: 240,
  })

  const aiReplyText = text.trim()
  if (!aiReplyText) throw new Error('La IA no devolvio contenido para responder')

  const localMessageId = `<${Date.now()}-${msg.conversation_id}-ai@crm-inmobiliario.local>`
  const inboundMessageId = typeof msgMeta.email_message_id === 'string' ? msgMeta.email_message_id : undefined
  const references = Array.isArray(msgMeta.email_references)
    ? msgMeta.email_references.filter((value): value is string => typeof value === 'string')
    : []
  const threadReferences = Array.from(new Set([...references, ...(inboundMessageId ? [inboundMessageId] : [])]))

  // EMAIL_REPLY_TO overrides EMAIL_IMAP_USER so Reply-To can point to a different inbox than IMAP
  const imapReplyTo = process.env.EMAIL_REPLY_TO?.trim() || process.env.EMAIL_IMAP_USER?.trim() || undefined

  const sendParams = {
    to: fromEmail,
    subject: generateEmailSubject('Re:', conversation.subject || subject),
    text: aiReplyText,
    html: `<p>${aiReplyText.replace(/\n/g, '<br />')}</p>`,
    messageId: localMessageId,
    inReplyTo: inboundMessageId,
    references: threadReferences,
    replyTo: imapReplyTo,
  }
  const sendResult = deliveryConfig.provider === 'resend' && deliveryConfig.resend
    ? await sendEmailViaResend({ config: deliveryConfig.resend, ...sendParams })
    : await sendEmailViaSmtp({ config: deliveryConfig.smtp!, ...sendParams })

  const fromEmailAddress = deliveryConfig.provider === 'resend'
    ? deliveryConfig.resend!.fromEmail
    : deliveryConfig.smtp!.fromEmail

  // localMessageId is the actual Message-ID header used in the sent email.
  // Recipients' email clients will reference this in their In-Reply-To header when replying.
  // sendResult.messageId is the provider's internal tracking ID (different from the email header).
  const actualMessageId = localMessageId
  const deliveryProviderId = sendResult.messageId || localMessageId

  const { error: insertError } = await supabase.from('conversation_messages').insert({
    conversation_id: msg.conversation_id,
    tenant_id: tenantId,
    sender_user_id: actorUserId,
    direction: 'outbound',
    channel: 'email',
    status: 'sent',
    content: aiReplyText,
    is_automated: true,
    metadata: {
      email_to: fromEmail,
      email_from: fromEmailAddress,
      email_subject: generateEmailSubject('Re:', conversation.subject || subject),
      email_message_id: actualMessageId,
      email_in_reply_to: inboundMessageId,
      email_references: threadReferences,
      email_delivery_provider: sendResult.provider,
      email_delivery_status: 'sent',
      email_delivery_response: 'response' in sendResult ? sendResult.response : undefined,
      email_delivery_provider_message_id: deliveryProviderId,
      email_delivery_accepted: sendResult.accepted,
      email_delivery_rejected: sendResult.rejected,
      reply_type: 'auto',
      ai_generated: true,
      ai_reply_mode: mode,
      based_on_message_id: messageId,
      ai_model: AI_MODELS.balanced,
      based_on_intent: classification.intent.intent,
      based_on_decision: classification.decision.decision,
    },
  })

  if (insertError) throw new Error(insertError.message)

  const convMeta = (conversation.metadata || {}) as Record<string, unknown>
  await supabase
    .from('conversations')
    .update({
      metadata: {
        ...convMeta,
        email_message_id: actualMessageId,
        email_references: threadReferences,
        last_email_to: fromEmail,
        last_email_error: null,
      },
    })
    .eq('id', msg.conversation_id)
    .eq('tenant_id', tenantId)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'email.ai_reply.sent',
    entity_type: 'conversation',
    entity_id: msg.conversation_id,
    actor_user_id: actorUserId,
    payload: {
      based_on_message_id: messageId,
      to: fromEmail,
      provider: sendResult.provider,
      provider_message_id: sendResult.messageId,
      model: AI_MODELS.balanced,
      mode,
      intent: classification.intent.intent,
      decision: classification.decision.decision,
    },
  })

  return { status: 'sent', text: aiReplyText, classification }
}

export async function getChannelDiagnosticsAction() {
  ensureEmailSyncSchedulerStarted(async () => {
    await syncEmailInboxAutomaticallyAction()
  }, 'getChannelDiagnosticsAction')

  const base = buildChannelDiagnosticsBase()

  const supabase = await createClient()
  const admin = createServiceRoleClient()
  let tenantId: string

  try {
    tenantId = await getTenantId()
  } catch (error) {
    const message = describeSupabaseFetchFailure('loading /channels diagnostics', error)
    console.error('[channels diagnostics] tenant lookup failed', { error: message })
    return {
      ...base,
      runtimeError: message,
    }
  }

const [emailTest, emailInboundSyncManual, emailInboundSyncAuto, emailInboundSyncAutoImported, whatsappTest, whatsappDbResponse, emailGraphDbResponse] = await Promise.all([
    getLatestChannelTestEvent(supabase, tenantId, ['channel.test.email.sent', 'channel.test.email.failed']),
    getLatestChannelEventBySource(supabase, tenantId, ['email.inbound.sync.completed', 'email.inbound.sync.failed'], 'manual'),
    getLatestAutomaticEmailSyncEventForDiagnostics(supabase, tenantId),
    getLatestAutomaticEmailSyncImportEventForDiagnostics(supabase, tenantId),
    getLatestChannelEventBySource(admin, tenantId, ['channel.test.whatsapp.sent', 'channel.test.whatsapp.failed']),
    admin.from('tenant_whatsapp_configs').select('phone_number_id,display_phone_number,status,verified_at,mode,access_token_encrypted,whatsapp_business_account_id').eq('tenant_id', tenantId).eq('status', 'active').maybeSingle<{ phone_number_id: string; display_phone_number: string; status: string; verified_at: string | null; mode: string; access_token_encrypted: string | null; whatsapp_business_account_id: string | null }>(),
    admin.from('tenant_email_configs').select('id,email_address,status,expires_at,last_send_at,last_sync_at').eq('tenant_id', tenantId).eq('provider', 'microsoft_graph').maybeSingle<{ id: string; email_address: string; status: string; expires_at: string | null; last_send_at: string | null; last_sync_at: string | null }>(),
  ])

  const whatsappDbConfig = whatsappDbResponse?.data ?? null
  const emailGraphDbConfig = emailGraphDbResponse?.data ?? null

  const emailGraphDbConfigParsed = emailGraphDbConfig ? {
    activeConfig: emailGraphDbConfig.status === 'active',
    emailAddress: emailGraphDbConfig.email_address,
    status: emailGraphDbConfig.status,
    expiresAt: emailGraphDbConfig.expires_at,
    lastSendAt: emailGraphDbConfig.last_send_at,
    lastSyncAt: emailGraphDbConfig.last_sync_at,
    requiresReconnect: emailGraphDbConfig.status === 'reconnect_required',
  } : null
  const resolvedEnvironment = whatsappDbConfig?.mode === 'production' ? 'production' as const : 'sandbox' as const
  const accessTokenConfigured = !!whatsappDbConfig?.access_token_encrypted?.trim()
  const storedDisplayPhoneNumber = whatsappDbConfig?.display_phone_number || null
  let metaPhoneNumber: MetaPhoneNumberDiagnostics | null = null
  let metaWaba: MetaWabaDiagnostics | null = null
  let metaDiagnosticsError: string | null = null

  if (whatsappDbConfig?.phone_number_id && accessTokenConfigured) {
    try {
      const metaDiagnostics = await fetchMetaPhoneNumberDiagnostics({
        token: whatsappDbConfig.access_token_encrypted!.trim(),
        phoneNumberId: whatsappDbConfig.phone_number_id,
        whatsappBusinessAccountId: whatsappDbConfig.whatsapp_business_account_id,
      })
      metaPhoneNumber = metaDiagnostics.phone
      metaWaba = metaDiagnostics.waba
    } catch (error) {
      metaDiagnosticsError = error instanceof Error ? error.message : 'No se pudo consultar Meta para validar el numero activo.'
      console.warn('[channels diagnostics] Meta WhatsApp diagnostics failed', {
        tenantId,
        phoneNumberId: whatsappDbConfig.phone_number_id,
        error: metaDiagnosticsError,
      })
    }
  }

  const displayNumberMismatch = Boolean(
    storedDisplayPhoneNumber
      && metaPhoneNumber?.displayPhoneNumber
      && normalizePhoneComparison(storedDisplayPhoneNumber) !== normalizePhoneComparison(metaPhoneNumber.displayPhoneNumber)
  )

  const productionChecklist: string[] = []
  if (!whatsappDbConfig) productionChecklist.push('Crear una configuracion activa del tenant para WhatsApp Business.')
  if (resolvedEnvironment !== 'production') productionChecklist.push('Cambiar el modo del canal a Produccion cuando el numero real este aprobado.')
  if (!accessTokenConfigured) productionChecklist.push('Guardar un Access Token valido del numero real de WhatsApp Business.')
  if (!whatsappDbConfig?.phone_number_id?.trim()) productionChecklist.push('Definir el Phone Number ID real en la configuracion del tenant.')
  if (!whatsappDbConfig?.whatsapp_business_account_id?.trim()) productionChecklist.push('Definir el WhatsApp Business Account ID (WABA) del tenant.')
  if (!metaPhoneNumber && accessTokenConfigured && whatsappDbConfig?.phone_number_id?.trim()) productionChecklist.push('Validar en Meta el numero real para confirmar display number, verified name y quality rating.')
  if (displayNumberMismatch) productionChecklist.push('Corregir la discrepancia entre el numero guardado en Growthia Global CRM y el numero real devuelto por Meta.')

  const productionReady = productionChecklist.length === 0
  const isTestNumber = resolvedEnvironment !== 'production'

  console.info('[channels diagnostics] automatic sync event loaded', {
    tenantId,
    found: Boolean(emailInboundSyncAuto),
    eventType: emailInboundSyncAuto?.event_type || null,
    payload: emailInboundSyncAuto?.payload || null,
  })

  console.info('[channels diagnostics] WhatsApp DB config loaded', {
    tenantId,
    found: Boolean(whatsappDbConfig?.phone_number_id),
    hasToken: !!whatsappDbConfig?.access_token_encrypted,
  })

  return {
    ...base,
    email: {
      ...base.email,
      latestTest: emailTest,
      graph: {
        ...base.email.graph,
        dbConfig: emailGraphDbConfigParsed,
      },
      inbound: {
        ...base.email.inbound,
        latestSync: emailInboundSyncManual || emailInboundSyncAuto || null,
        latestSyncManual: emailInboundSyncManual,
        latestSyncAuto: emailInboundSyncAuto,
        latestSyncAutoImported: emailInboundSyncAutoImported,
        scheduler: getEmailSyncSchedulerSnapshot(),
      },
    },
    whatsapp: {
      ...base.whatsapp,
      latestTest: whatsappTest,
      dbConfig: whatsappDbConfig ? {
        activeConfig: true,
        phoneNumberId: whatsappDbConfig.phone_number_id,
        displayPhoneNumber: whatsappDbConfig.display_phone_number,
        status: whatsappDbConfig.status,
        verifiedAt: whatsappDbConfig.verified_at,
        mode: whatsappDbConfig.mode,
        businessAccountId: whatsappDbConfig.whatsapp_business_account_id,
        accessTokenConfigured,
        isComplete: !!(whatsappDbConfig.phone_number_id && whatsappDbConfig.access_token_encrypted),
        canTest: !!(whatsappDbConfig.phone_number_id && whatsappDbConfig.access_token_encrypted),
        productionChecklist,
        productionReady,
        metaPhoneNumber,
        metaWaba,
        metaDiagnosticsError,
        displayNumberMismatch,
        resolvedEnvironment,
        isTestNumber,
      } : null,
      configSource: whatsappDbConfig ? 'db_config' : (base.whatsapp.configured ? 'env_fallback' : 'none'),
    },
  }
}

async function performEmailInboxSync(args: {
  supabase: ConversationsSupabaseClient
  tenantId: string
  actorUserId?: string
  source: 'manual' | 'auto'
}) {
  const { supabase, tenantId, actorUserId, source } = args
  const demoConfig = detectEmailDemoConfig(process.env)

  if (demoConfig.enabled) {
    const emailGraphConfig = await getTenantEmailGraphConfig(supabase, tenantId)
    const graphEnvConfig = detectMicrosoftGraphConfig(process.env)

    if (emailGraphConfig?.access_token_encrypted && emailGraphConfig.status === 'active' && graphEnvConfig.configured && hasValidEncryptionKey()) {
      const syncResult = await performEmailInboxSyncViaGraph({
        supabase,
        tenantId,
        actorUserId,
        source,
        emailConfig: emailGraphConfig,
        graphConfig: graphEnvConfig,
      })

      if (syncResult.success) {
        return syncResult
      }

      console.warn('[email sync] Graph sync failed, falling back to Demo', { error: syncResult.error })
    }

    return performEmailInboxSyncViaDemo({
      supabase,
      tenantId,
      actorUserId,
      source,
    })
  }

  const graphEnvConfig = detectMicrosoftGraphConfig(process.env)
  const useGraph = graphEnvConfig.configured && hasValidEncryptionKey()

  if (useGraph) {
    const emailGraphConfig = await getTenantEmailGraphConfig(supabase, tenantId)

    if (emailGraphConfig?.access_token_encrypted && emailGraphConfig.status === 'active') {
      const syncResult = await performEmailInboxSyncViaGraph({
        supabase,
        tenantId,
        actorUserId,
        source,
        emailConfig: emailGraphConfig,
        graphConfig: graphEnvConfig,
      })

      if (syncResult.success) {
        return syncResult
      }

      console.warn('[email sync] Graph sync failed, falling back to IMAP', { error: syncResult.error })
    }
  }

  const inboundConfig = detectEmailInboundConfig(process.env)

  if (!inboundConfig.configured || !inboundConfig.imap) {
    const demoConfig = detectEmailDemoConfig(process.env)

    if (demoConfig.enabled) {
      return performEmailInboxSyncViaDemo({
        supabase,
        tenantId,
        actorUserId,
        source,
      })
    }

    const reason = inboundConfig.reason || 'IMAP inbound email is not fully configured.'
    await insertChannelEvent(supabase, {
      tenantId,
      actorUserId,
      eventType: 'email.inbound.sync.failed',
      payload: {
        reason,
        source,
        configured_tenant_id: tenantId,
        summary_tenant_id: tenantId,
      },
    })
    throw new Error(reason)
  }

  const imapConfig = inboundConfig.imap

  try {
    return await runEmailInboxSyncWithServerLock(source, async () => {
      const emails = await fetchInboundEmailsViaImap(imapConfig)
      let summaryTenantId = tenantId
      let imported = 0
      let skipped = 0
      let duplicates = 0
      const failures: string[] = []
      const skippedReasons: Record<string, number> = {}
      const failedReasons: Record<string, number> = {}
      let threaded = 0
      let created = 0
      let irrelevant = 0

      for (const email of emails) {
        const payload = source === 'manual'
          ? { ...email, tenant_id: tenantId }
          : email

        const result = await processInboundEmailAction(payload, { supabase })

        if ('tenantId' in result && typeof result.tenantId === 'string' && result.tenantId) {
          summaryTenantId = result.tenantId
        }

        if (result.status === 'ok') {
          imported += 1
          if (result.isNewConversation) created += 1
          else threaded += 1
        }
        else if (result.status === 'duplicate') {
          duplicates += 1
          skipped += 1
          skippedReasons.duplicate = (skippedReasons.duplicate || 0) + 1
        } else if (result.status === 'skipped') skipped += 1
        else if (result.status === 'failed') {
          const reason = result.reason || 'failed'
          failures.push(reason)
          failedReasons[reason] = (failedReasons[reason] || 0) + 1
        }

        if (result.status === 'skipped' && result.reason) {
          skippedReasons[result.reason] = (skippedReasons[result.reason] || 0) + 1
          if (result.reason.startsWith('Irrelevant inbox email:')) irrelevant += 1
        }
      }

      console.info('[email sync scheduler] automatic sync summary tenant resolved', {
        source,
        configuredTenantId: tenantId,
        summaryTenantId,
      })

      await insertChannelEvent(supabase, {
        tenantId: summaryTenantId,
        actorUserId,
        eventType: failures.length > 0 ? 'email.inbound.sync.failed' : 'email.inbound.sync.completed',
        payload: {
          source,
          configured_tenant_id: tenantId,
          summary_tenant_id: summaryTenantId,
          mailbox: imapConfig.mailbox,
          lock: 'server_file',
          fetched: emails.length,
          imported,
          skipped,
          duplicates,
          threaded,
          created,
          irrelevant,
          failed: failures.length,
          reason: failures[0] || null,
          skipped_reasons: skippedReasons,
          failed_reasons: failedReasons,
        },
      })

      return {
        fetched: emails.length,
        imported,
        skipped,
        duplicates,
        threaded,
        created,
        irrelevant,
        failed: failures.length,
        reason: failures[0] || null,
        skipped_reasons: skippedReasons,
        failed_reasons: failedReasons,
      }
    })
  } catch (error) {
    if (error instanceof EmailSyncLockedError) {
      await insertChannelEvent(supabase, {
        tenantId,
        actorUserId,
        eventType: 'email.inbound.sync.skipped',
        payload: {
          reason: error.message,
          source,
          configured_tenant_id: tenantId,
          summary_tenant_id: tenantId,
          lock: 'server_file',
          conflict: true,
        },
      })
      return {
        fetched: 0,
        imported: 0,
        skipped: 0,
        duplicates: 0,
        threaded: 0,
        created: 0,
        irrelevant: 0,
        failed: 0,
        reason: null,
        locked: true,
      }
    }

    const reason = error instanceof Error ? error.message : 'IMAP sync failed'
    await insertChannelEvent(supabase, {
      tenantId,
      actorUserId,
      eventType: 'email.inbound.sync.failed',
      payload: {
        reason,
        source,
        configured_tenant_id: tenantId,
        summary_tenant_id: tenantId,
        lock: 'server_file',
      },
    })
    throw new Error(reason)
  }
}

export async function syncEmailInboxAction() {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()
  return performEmailInboxSync({ supabase, tenantId, actorUserId: user?.id, source: 'manual' })
}

export async function syncEmailInboxAutomaticallyAction() {
  console.info('[email sync scheduler] automatic sync invoked')
  const supabase = createServiceRoleClient()
  const tenantId = await resolveInboundTenantIdFromEnv()
  console.info('[email sync scheduler] automatic sync configured tenant', { tenantId })

  try {
    const result = await performEmailInboxSync({ supabase, tenantId, source: 'auto' })
    console.info('[email sync scheduler] automatic sync result persisted', result)
    return result
  } catch (error) {
    const errorStr = error instanceof Error ? error.message : (!error ? String(error) : 'object' === typeof error ? (error as Record<string, unknown>).message || JSON.stringify(error, Object.getOwnPropertyNames(error)) : String(error))
    console.error('[email sync scheduler] automatic sync failed', errorStr, { errorType: typeof error, isError: error instanceof Error, keys: typeof error === 'object' ? Object.keys(error as object) : null })
    throw error
  }
}

export async function testEmailChannelAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const to = String(formData.get('to') || '').trim()
  if (!to) throw new Error('El destinatario es obligatorio')

  const subject = `Growthia Global CRM test · ${new Date().toISOString()}`
  const text = 'Prueba controlada de canal Email desde Growthia Global CRM.'

  const emailGraphConfig = await getTenantEmailGraphConfig(supabase, tenantId)
  const graphEnvConfig = detectMicrosoftGraphConfig(process.env)

  if (emailGraphConfig?.access_token_encrypted && graphEnvConfig.configured && hasValidEncryptionKey()) {
    const expiresAt = emailGraphConfig.expires_at

    let accessToken: string | null = null

    if (expiresAt && new Date(expiresAt) <= new Date()) {
      try {
        const encryptionKey = process.env.EMAIL_TOKEN_ENCRYPTION_KEY!.trim()
        const refreshToken = decryptToken(emailGraphConfig.refresh_token_encrypted!, encryptionKey)
        const refreshed = await refreshMicrosoftGraphToken(graphEnvConfig, refreshToken)

        const encryptedAccess = encryptToken(refreshed.accessToken, encryptionKey)
        const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()

        await supabase.from('tenant_email_configs').update({
          access_token_encrypted: encryptedAccess,
          refresh_token_encrypted: encryptToken(refreshed.refreshToken, encryptionKey),
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        }).eq('id', emailGraphConfig.id)

        accessToken = refreshed.accessToken
      } catch {
        // Token expired and refresh failed, fall through to SMTP
      }
    } else {
      try {
        const encryptionKey = process.env.EMAIL_TOKEN_ENCRYPTION_KEY!.trim()
        accessToken = decryptToken(emailGraphConfig.access_token_encrypted!, encryptionKey)
      } catch {
        // Decryption failed
      }
    }

    if (accessToken) {
      try {
        const result = await sendEmailViaMicrosoftGraph(accessToken, {
          from: emailGraphConfig.email_address,
          to,
          subject,
          text,
          html: `<p>${text}</p>`,
        })

        await insertChannelEvent(supabase, {
          tenantId,
          actorUserId: user?.id,
          eventType: 'channel.test.email.sent',
          payload: {
            to,
            provider: 'microsoft_graph',
            status: result.status,
            response: result.response,
            message_id: result.messageId,
            accepted: result.accepted,
            rejected: result.rejected,
          },
        })

        await supabase.from('tenant_email_configs').update({
          last_send_at: new Date().toISOString(),
        }).eq('id', emailGraphConfig.id)

        return { ok: true, provider: 'microsoft_graph', status: result.status }
      } catch (err) {
        console.error('[email test] Graph send failed, falling back to SMTP', err)
      }
    }
  }

  const deliveryConfig = detectEmailDeliveryConfig(process.env)

  const canSendEmail = deliveryConfig.configured && (
    (deliveryConfig.provider === 'smtp' && !!deliveryConfig.smtp) ||
    (deliveryConfig.provider === 'resend' && !!deliveryConfig.resend)
  )

  if (!canSendEmail) {
    const demoConfig = detectEmailDemoConfig(process.env)

    if (demoConfig.enabled) {
      try {
        const result = await sendEmailViaDemo({
          to,
          subject,
          text,
          html: `<p>${text}</p>`,
        })

        await insertChannelEvent(supabase, {
          tenantId,
          actorUserId: user?.id,
          eventType: 'channel.test.email.sent',
          payload: {
            to,
            provider: 'email_demo',
            status: result.status,
            message_id: result.messageId,
            simulated: true,
            delivered: false,
          },
        })

        return {
          ok: true,
          provider: 'email_demo',
          status: result.status,
          demo: true,
          message: 'Email demo generado correctamente. No se envió fuera del CRM.',
        }
      } catch (demoErr) {
        console.error('[email test] Demo mode failed', demoErr)
      }
    }

    const reason = 'El proveedor de email no esta configurado completamente para ejecutar la prueba.'
    await insertChannelEvent(supabase, {
      tenantId,
      actorUserId: user?.id,
      eventType: 'channel.test.email.failed',
      payload: { to, provider: deliveryConfig.provider, reason, detail: deliveryConfig.reason },
    })
    throw new Error(reason)
  }

  try {
    const testImapReplyTo = process.env.EMAIL_REPLY_TO?.trim() || process.env.EMAIL_IMAP_USER?.trim() || undefined
    const result = deliveryConfig.provider === 'resend' && deliveryConfig.resend
      ? await sendEmailViaResend({ config: deliveryConfig.resend, to, subject, text, html: `<p>${text}</p>`, replyTo: testImapReplyTo })
      : await sendEmailViaSmtp({ config: deliveryConfig.smtp!, to, subject, text, html: `<p>${text}</p>`, replyTo: testImapReplyTo })

    const fromEmailAddress = deliveryConfig.provider === 'resend'
      ? deliveryConfig.resend!.fromEmail
      : deliveryConfig.smtp!.fromEmail

    const { data: testConversation, error: testConversationError } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        subject,
        channel: 'email',
        status: 'open',
        created_by: user?.id,
        metadata: {
          email_thread_id: subject,
          last_email_to: to,
          email_thread_source: 'channel_test',
          email_message_id: result.messageId,
          email_references: result.messageId ? [result.messageId] : [],
        },
      })
      .select('id')
      .single()

    if (testConversationError) throw new Error(testConversationError.message)

    const { error: testMessageError } = await supabase.from('conversation_messages').insert({
      conversation_id: testConversation.id,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: 'email',
      status: 'sent',
      content: text,
      is_automated: false,
      metadata: {
        email_to: to,
        email_from: fromEmailAddress,
        email_subject: subject,
        email_message_id: result.messageId,
        email_references: result.messageId ? [result.messageId] : [],
        reply_type: 'human',
        email_delivery_provider: result.provider,
        email_delivery_status: 'sent',
        email_delivery_response: 'response' in result ? result.response : undefined,
        email_delivery_provider_message_id: result.messageId,
        email_delivery_accepted: result.accepted,
        email_delivery_rejected: result.rejected,
      },
    })

    if (testMessageError) throw new Error(testMessageError.message)

    await insertChannelEvent(supabase, {
      tenantId,
      actorUserId: user?.id,
      eventType: 'channel.test.email.sent',
      payload: {
        to,
        provider: result.provider,
        status: result.status,
        response: 'response' in result ? result.response : undefined,
        message_id: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      },
    })

    return { ok: true, provider: result.provider, status: result.status }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Email test failed'
    await insertChannelEvent(supabase, {
      tenantId,
      actorUserId: user?.id,
      eventType: 'channel.test.email.failed',
      payload: { to, provider: deliveryConfig.provider, reason },
    })
    throw new Error(reason)
  }
}

export async function testWhatsAppChannelAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const to = String(formData.get('to') || '').trim()
  if (!to) throw new Error('El numero es obligatorio')

  const phoneValidation = validateWhatsAppNumber(to)
  if (!phoneValidation.valid) {
    await createServiceRoleClient().from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'channel.test.whatsapp.failed',
      entity_type: 'channel',
      payload: { to, reason: phoneValidation.error, validation_failed: true },
    })
    throw new Error(phoneValidation.error || 'Número de teléfono inválido')
  }

  const dbConfigResponse = await supabase
    .from('tenant_whatsapp_configs')
    .select('phone_number_id, access_token_encrypted, mode, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  let deliveryConfig = detectWhatsAppDeliveryConfig(process.env)
  let configSource: 'db_config' | 'env_fallback' = 'env_fallback'

  if (dbConfigResponse?.data?.phone_number_id && dbConfigResponse.data.access_token_encrypted) {
    deliveryConfig = {
      provider: 'meta_cloud',
      configured: true,
      meta: {
        token: dbConfigResponse.data.access_token_encrypted,
        phoneNumberId: dbConfigResponse.data.phone_number_id,
      },
    }
    configSource = 'db_config'
    console.info('[whatsapp test] Using DB config', { phoneNumberId: dbConfigResponse.data.phone_number_id, mode: dbConfigResponse.data.mode })
  } else {
    console.info('[whatsapp test] Falling back to env config', { configured: deliveryConfig.configured })
  }

  const templateName = 'visita_confirmacion_detalle_es'
  const templateLanguageCode = 'es'
  const templateParams = ['30/04/2026', '10:00']

  if (!deliveryConfig.configured || deliveryConfig.provider !== 'meta_cloud' || !deliveryConfig.meta) {
    const reason = 'WhatsApp outbound no esta configurado completamente para ejecutar la prueba.'
    await createServiceRoleClient().from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'channel.test.whatsapp.failed',
      entity_type: 'channel',
      payload: { to, provider: deliveryConfig.provider, reason, detail: deliveryConfig.reason, config_source: configSource },
    })
    throw new Error(reason)
  }

  const result = await sendWhatsAppViaMeta({
    config: deliveryConfig.meta,
    to,
    text: 'Growthia Global CRM WhatsApp test',
    templateName,
    templateLanguageCode,
    templateParams,
  })

  if (result.status !== 'sent') {
    const reason = result.error || result.reason || 'WhatsApp test failed'
    await createServiceRoleClient().from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'channel.test.whatsapp.failed',
      entity_type: 'channel',
      payload: {
        to,
        provider: deliveryConfig.provider,
        reason,
        actual_type: result.message_type,
        template_name: result.template_name,
        sandbox: true,
        config_source: configSource,
      },
    })
    throw new Error(reason)
  }

await createServiceRoleClient().from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'channel.test.whatsapp.sent',
      entity_type: 'channel',
      payload: {
        to,
        provider: deliveryConfig.provider,
        status: result.status,
        provider_message_id: result.provider_message_id,
        actual_type: result.message_type,
        template_name: result.template_name,
        sandbox: true,
        config_source: configSource,
      },
    }).then(({ error }) => {
      if (error) {
        console.error('[whatsapp test] Failed to insert event:', error)
      } else {
        console.info('[whatsapp test] Event inserted successfully')
      }
    })

  return { ok: true, provider: deliveryConfig.provider, status: result.status, sandbox: true, template: templateName, configSource }
}

export async function saveWhatsAppConfigAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const phoneNumberId = String(formData.get('phone_number_id') || '').trim()
  const displayPhoneNumber = String(formData.get('display_phone_number') || '').trim()
  const whatsappBusinessAccountId = String(formData.get('whatsapp_business_account_id') || '').trim()
  const accessToken = String(formData.get('access_token') || '').trim()
  const verifyToken = String(formData.get('verify_token') || '').trim()
  const mode = String(formData.get('mode') || 'sandbox').trim() as 'sandbox' | 'production'
  const status = String(formData.get('status') || 'pending').trim() as 'pending' | 'active' | 'suspended' | 'disconnected'

  if (!phoneNumberId) {
    throw new Error('El Phone Number ID es obligatorio')
  }

  const existingConfig = await supabase
    .from('tenant_whatsapp_configs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()

  let result
  if (existingConfig?.data) {
    result = await supabase
      .from('tenant_whatsapp_configs')
      .update({
        display_phone_number: displayPhoneNumber || null,
        whatsapp_business_account_id: whatsappBusinessAccountId || null,
        access_token_encrypted: accessToken || null,
        verify_token: verifyToken || null,
        mode,
        status,
        verified_at: status === 'active' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingConfig.data.id)
      .select()
      .single()
  } else {
    result = await supabase
      .from('tenant_whatsapp_configs')
      .insert({
        tenant_id: tenantId,
        provider: 'meta_cloud',
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhoneNumber || null,
        whatsapp_business_account_id: whatsappBusinessAccountId || null,
        access_token_encrypted: accessToken || null,
        verify_token: verifyToken || null,
        mode,
        status,
        verified_at: status === 'active' ? new Date().toISOString() : null,
      })
      .select()
      .single()
  }

  if (result.error) {
    throw new Error(`Error al guardar configuración de WhatsApp: ${result.error.message}`)
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: existingConfig?.data ? 'whatsapp.config.updated' : 'whatsapp.config.created',
    entity_type: 'channel',
    entity_id: 'whatsapp',
    actor_user_id: user?.id,
    payload: {
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
      mode,
      status,
    },
  })

  return { ok: true, config: result.data }
}

export async function getTenantWhatsAppTemplatesAction() {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  await ensureTenantWhatsAppTemplateSeed({ supabase, tenantId, userId: user?.id || null })

  const [templates, activeConfig] = await Promise.all([
    getTenantWhatsAppTemplatesForUi(supabase, tenantId),
    getActiveTenantWhatsAppConfig(supabase, tenantId),
  ])

  return {
    templates,
    activeConfig: activeConfig
      ? {
          phoneNumberId: activeConfig.phone_number_id,
          displayPhoneNumber: activeConfig.display_phone_number,
          whatsappBusinessAccountId: activeConfig.whatsapp_business_account_id,
          mode: activeConfig.mode,
          status: activeConfig.status,
          canPublish: !!(activeConfig.access_token_encrypted && activeConfig.whatsapp_business_account_id),
        }
      : null,
  }
}

export async function saveTenantWhatsAppTemplateAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const id = String(formData.get('id') || '').trim() || null
  const templateKey = slugifyTemplateKey(String(formData.get('template_key') || '').trim())
  const metaTemplateName = slugifyTemplateKey(String(formData.get('meta_template_name') || '').trim())
  const languageCode = String(formData.get('language_code') || 'es').trim() || 'es'
  const locale = String(formData.get('locale') || languageCode).trim() || languageCode
  const category = String(formData.get('category') || 'utility').trim()
  const bodyText = String(formData.get('body_text') || '').trim()
  const headerText = String(formData.get('header_text') || '').trim() || null
  const footerText = String(formData.get('footer_text') || '').trim() || null
  const rawVariables = String(formData.get('variables_schema') || '[]')
  const isActive = String(formData.get('is_active') || 'true') !== 'false'
  let variablesSchema: WhatsAppTemplateVariable[] = []

  try {
    variablesSchema = JSON.parse(rawVariables) as WhatsAppTemplateVariable[]
  } catch {
    throw new Error('El esquema de variables no tiene un formato JSON válido.')
  }

  if (!templateKey) throw new Error('El template_key interno es obligatorio.')
  if (!metaTemplateName) throw new Error('El nombre de plantilla en Meta es obligatorio.')
  if (!['marketing', 'utility', 'authentication'].includes(category)) {
    throw new Error('La categoría de la plantilla no es válida.')
  }

  const variablesCount = validateTemplateDefinition({
    bodyText,
    variablesSchema,
    metaTemplateName,
  })

  const payload = {
    tenant_id: tenantId,
    provider: 'meta_cloud',
    template_key: templateKey,
    meta_template_name: metaTemplateName,
    language_code: languageCode,
    locale,
    category,
    body_text: bodyText,
    header_text: headerText,
    footer_text: footerText,
    variables_count: variablesCount,
    variables_schema: variablesSchema,
    is_active: isActive,
    updated_by: user?.id || null,
    updated_at: new Date().toISOString(),
    ...(isActive ? {} : { status: 'archived' }),
  }

  if (id) {
    const { error } = await supabase
      .from('tenant_whatsapp_templates')
      .update(payload)
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new Error(`No se pudo actualizar la plantilla: ${error.message}`)
  } else {
    const { error } = await supabase
      .from('tenant_whatsapp_templates')
      .insert({
        ...payload,
        status: 'draft',
        created_by: user?.id || null,
      })

    if (error) throw new Error(`No se pudo crear la plantilla: ${error.message}`)
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: id ? 'whatsapp.template.updated' : 'whatsapp.template.created',
    entity_type: 'whatsapp_template',
    entity_id: id,
    actor_user_id: user?.id,
    payload: {
      template_key: templateKey,
      meta_template_name: metaTemplateName,
      language_code: languageCode,
      category,
    },
  })

  revalidatePath('/channels')
  return { ok: true }
}

export async function duplicateTenantWhatsAppTemplateAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()
  const id = String(formData.get('id') || '').trim()

  if (!id) throw new Error('Falta la plantilla a duplicar.')

  const { data, error } = await supabase
    .from('tenant_whatsapp_templates')
    .select('id, template_key, meta_template_name, locale, language_code, category, body_text, header_text, footer_text, variables_schema')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .single()

  if (error || !data) throw new Error('No se encontró la plantilla a duplicar.')

  const stamp = Date.now().toString().slice(-6)
  const templateKey = slugifyTemplateKey(`${data.template_key}_copia_${stamp}`)
  const metaTemplateName = slugifyTemplateKey(`${data.meta_template_name}_copia_${stamp}`)
  const variablesSchema = safeTemplateVariables(data.variables_schema, data.body_text)

  const { error: insertError } = await supabase
    .from('tenant_whatsapp_templates')
    .insert({
      tenant_id: tenantId,
      provider: 'meta_cloud',
      template_key: templateKey,
      meta_template_name: metaTemplateName,
      locale: data.locale,
      language_code: data.language_code,
      category: data.category,
      status: 'draft',
      body_text: data.body_text,
      header_text: data.header_text,
      footer_text: data.footer_text,
      variables_count: variablesSchema.length,
      variables_schema: variablesSchema,
      is_active: true,
      created_by: user?.id || null,
      updated_by: user?.id || null,
      metadata: { duplicated_from: id },
    })

  if (insertError) throw new Error(`No se pudo duplicar la plantilla: ${insertError.message}`)

  revalidatePath('/channels')
  return { ok: true, templateKey, metaTemplateName }
}

export async function toggleTenantWhatsAppTemplateArchiveAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()
  const id = String(formData.get('id') || '').trim()
  const archive = String(formData.get('archive') || 'true') === 'true'

  if (!id) throw new Error('Falta la plantilla a actualizar.')

  const { data: currentTemplate, error: currentTemplateError } = await supabase
    .from('tenant_whatsapp_templates')
    .select('meta_status')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (currentTemplateError || !currentTemplate) {
    throw new Error('No se pudo cargar la plantilla a archivar.')
  }

  const { error } = await supabase
    .from('tenant_whatsapp_templates')
    .update({
      is_active: !archive,
      status: archive ? 'archived' : mapMetaTemplateStatus(currentTemplate.meta_status, true),
      updated_by: user?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(`No se pudo actualizar el archivo de la plantilla: ${error.message}`)

  revalidatePath('/channels')
  return { ok: true }
}

export async function publishTenantWhatsAppTemplatesAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()
  const ids = JSON.parse(String(formData.get('ids') || '[]')) as string[]

  if (!Array.isArray(ids) || ids.length === 0) throw new Error('Selecciona al menos una plantilla para publicar.')

  const [config, { data: templates, error }] = await Promise.all([
    getActiveTenantWhatsAppConfig(supabase, tenantId),
    supabase
      .from('tenant_whatsapp_templates')
      .select('id, tenant_id, provider, template_key, meta_template_name, locale, language_code, category, status, meta_status, meta_template_id, body_text, header_text, footer_text, variables_count, variables_schema, last_synced_at, rejection_reason, last_error, is_active, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .in('id', ids),
  ])

  if (error) throw new Error(`No se pudieron cargar las plantillas seleccionadas: ${error.message}`)

  const metaConfig = assertTenantMetaTemplateConfig(config)
  const results: Array<{ id: string; ok: boolean; message: string }> = []

  for (const row of (templates || []) as TenantWhatsAppTemplateRow[]) {
    if (!row.is_active || row.status === 'archived') {
      results.push({ id: row.id, ok: false, message: 'La plantilla está archivada y no se puede publicar.' })
      continue
    }

    try {
      const rawSchema = safeTemplateVariables(row.variables_schema, row.body_text)
      const variablesSchema = repairVariablesSchema(rawSchema, row.body_text)
      validateTemplateDefinition({
        bodyText: row.body_text,
        variablesSchema,
        metaTemplateName: row.meta_template_name,
      })

      const published = await publishTemplateToMeta(metaConfig, {
        meta_template_name: row.meta_template_name,
        meta_template_id: row.meta_template_id,
        language_code: row.language_code,
        category: row.category,
        body_text: row.body_text,
        header_text: row.header_text,
        footer_text: row.footer_text,
        variables_schema: variablesSchema,
      })

      await supabase
        .from('tenant_whatsapp_templates')
        .update({
          status: 'pending_meta',
          meta_status: typeof published?.status === 'string' ? published.status : 'PENDING',
          meta_template_id: typeof published?.id === 'string' ? published.id : row.meta_template_id,
          rejection_reason: null,
          last_error: null,
          last_synced_at: new Date().toISOString(),
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('tenant_id', tenantId)

      results.push({ id: row.id, ok: true, message: 'Publicada en Meta' })
    } catch (publishError) {
      const message = publishError instanceof Error ? publishError.message : 'Error desconocido al publicar en Meta'
      await supabase
        .from('tenant_whatsapp_templates')
        .update({
          status: 'sync_error',
          last_error: message,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('tenant_id', tenantId)
      results.push({ id: row.id, ok: false, message })
    }
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'whatsapp.template.publish.batch',
    entity_type: 'whatsapp_template',
    actor_user_id: user?.id,
    payload: {
      total: ids.length,
      success: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results,
    },
  })

  revalidatePath('/channels')
  return { ok: true, results }
}

export async function syncTenantWhatsAppTemplatesAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()
  const ids = JSON.parse(String(formData.get('ids') || '[]')) as string[]
  const config = await getActiveTenantWhatsAppConfig(supabase, tenantId)
  const metaConfig = assertTenantMetaTemplateConfig(config)
  const metaTemplates = await syncTemplatesFromMeta(metaConfig)

  let templateQuery = supabase
    .from('tenant_whatsapp_templates')
    .select('id, tenant_id, provider, template_key, meta_template_name, locale, language_code, category, status, meta_status, meta_template_id, body_text, header_text, footer_text, variables_count, variables_schema, last_synced_at, rejection_reason, last_error, is_active, created_at, updated_at')
    .eq('tenant_id', tenantId)

  if (ids.length > 0) {
    templateQuery = templateQuery.in('id', ids)
  }

  const { data: tenantTemplates, error } = await templateQuery

  if (error) throw new Error(`No se pudo cargar el catálogo a sincronizar: ${error.message}`)

  const metaById = new Map(metaTemplates.filter((template) => template.id).map((template) => [template.id as string, template]))
  const metaByKey = new Map(metaTemplates.map((template) => [buildMetaTemplateMatchKey(template.name, template.language), template]))
  const matchedMetaKeys = new Set<string>()
  const results: Array<{ id: string; ok: boolean; message: string }> = []

  for (const row of (tenantTemplates || []) as TenantWhatsAppTemplateRow[]) {
    const metaMatch = matchMetaTemplateRecord({ row, metaById, metaByKey })
    if (!metaMatch) {
      await supabase
        .from('tenant_whatsapp_templates')
        .update({
          last_error: 'No encontrada en Meta con el nombre e idioma configurados.',
          last_synced_at: new Date().toISOString(),
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('tenant_id', tenantId)
      results.push({ id: row.id, ok: false, message: 'No encontrada en Meta' })
      continue
    }

    matchedMetaKeys.add(buildMetaTemplateMatchKey(metaMatch.name, metaMatch.language))
    const bodyText = getMetaTemplateComponentText(metaMatch, 'BODY') || row.body_text
    const headerText = getMetaTemplateComponentText(metaMatch, 'HEADER')
    const footerText = getMetaTemplateComponentText(metaMatch, 'FOOTER')
    const variablesSchema = buildVariablesSchemaFromMetaTemplate(metaMatch)

    await supabase
      .from('tenant_whatsapp_templates')
      .update({
        meta_template_name: metaMatch.name || row.meta_template_name,
        language_code: (metaMatch.language || row.language_code || 'es').trim() || 'es',
        locale: (metaMatch.language || row.locale || 'es').trim() || 'es',
        category: normalizeMetaTemplateCategory(metaMatch.category || row.category),
        status: mapMetaTemplateStatus(metaMatch.status || null, row.is_active),
        meta_status: metaMatch.status || null,
        meta_template_id: metaMatch.id || row.meta_template_id,
        body_text: bodyText,
        header_text: headerText,
        footer_text: footerText,
        variables_count: variablesSchema.length,
        variables_schema: variablesSchema,
        rejection_reason: metaMatch.rejected_reason || metaMatch.reason || null,
        last_error: null,
        last_synced_at: new Date().toISOString(),
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('tenant_id', tenantId)

    results.push({ id: row.id, ok: true, message: metaMatch.status || 'Sincronizada' })
  }

  const unmatchedMetaTemplates = metaTemplates.filter((template) => !matchedMetaKeys.has(buildMetaTemplateMatchKey(template.name, template.language)))

  for (const metaTemplate of unmatchedMetaTemplates) {
    const bodyText = getMetaTemplateComponentText(metaTemplate, 'BODY') || ''
    const headerText = getMetaTemplateComponentText(metaTemplate, 'HEADER')
    const footerText = getMetaTemplateComponentText(metaTemplate, 'FOOTER')
    const variablesSchema = buildVariablesSchemaFromMetaTemplate(metaTemplate)
    const { data: insertedTemplate, error: insertError } = await supabase
      .from('tenant_whatsapp_templates')
      .insert({
        tenant_id: tenantId,
        provider: 'meta_cloud',
        template_key: slugifyTemplateKey(metaTemplate.name),
        meta_template_name: metaTemplate.name,
        locale: (metaTemplate.language || 'es').trim() || 'es',
        language_code: (metaTemplate.language || 'es').trim() || 'es',
        category: normalizeMetaTemplateCategory(metaTemplate.category),
        status: mapMetaTemplateStatus(metaTemplate.status || null, true),
        meta_status: metaTemplate.status || null,
        meta_template_id: metaTemplate.id || null,
        body_text: bodyText,
        header_text: headerText,
        footer_text: footerText,
        variables_count: variablesSchema.length,
        variables_schema: variablesSchema,
        last_synced_at: new Date().toISOString(),
        rejection_reason: metaTemplate.rejected_reason || metaTemplate.reason || null,
        last_error: null,
        is_active: true,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      })
      .select('id')
      .single()

    if (insertError) {
      results.push({ id: metaTemplate.id || buildMetaTemplateMatchKey(metaTemplate.name, metaTemplate.language), ok: false, message: `No se pudo importar desde Meta: ${insertError.message}` })
      continue
    }

    results.push({ id: insertedTemplate?.id || metaTemplate.id || metaTemplate.name, ok: true, message: `Importada desde Meta (${metaTemplate.status || 'sin estado'})` })
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'whatsapp.template.sync.batch',
    entity_type: 'whatsapp_template',
    actor_user_id: user?.id,
    payload: {
      total: results.length,
      success: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results,
    },
  })

  revalidatePath('/channels')
  return { ok: true, results }
}

export async function createConversationAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const rawSubject = String(formData.get('subject') || '').trim()
  const channel = String(formData.get('channel') || 'internal') as string
  const leadId = formData.get('leadId') ? String(formData.get('leadId')) : null
  const contactName = String(formData.get('contactName') || '').trim()
  const contactEmail = String(formData.get('contactEmail') || '').trim() || null
  const contactPhone = String(formData.get('contactPhone') || '').trim() || null
  const initialMessage = String(formData.get('initialMessage') || '').trim()
  const subject = channel === 'chatbot'
    ? buildChatbotConversationSubject(initialMessage, rawSubject)
    : rawSubject

  if (!subject) throw new Error('El asunto es obligatorio')

  let chatbotSessionId: string | null = null
  if (channel === 'chatbot') {
    if (!initialMessage) throw new Error('El mensaje inicial es obligatorio para una conversación de chatbot')
    chatbotSessionId = generateSessionId()
  }

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      subject,
      channel,
      status: 'open',
      created_by: user?.id,
      metadata: chatbotSessionId
        ? {
            chatbot_session_id: chatbotSessionId,
            chatbot_source: 'conversations_manual',
          }
        : undefined,
    })
    .select()
    .single()

  if (convError) throw new Error(convError.message)

  if (contactName || contactEmail || contactPhone) {
    await supabase.from('conversation_participants').insert({
      conversation_id: conversation.id,
      contact_name: contactName || null,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      role: 'contact',
    })
  }

  if (user) {
    await supabase.from('conversation_participants').insert({
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'agent',
    })
  }

  if (initialMessage && channel !== 'chatbot') {
    await supabase.from('conversation_messages').insert({
      conversation_id: conversation.id,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel,
      status: 'sent',
      content: initialMessage,
    })
  }

  if (channel === 'chatbot' && chatbotSessionId) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .single()

    const { data: profile } = await supabase
      .from('users')
      .select('role, global_role')
      .eq('id', user?.id)
      .single()

    const headerStore = await headers()
    const origin = buildInternalOrigin(headerStore)
    const response = await fetch(`${origin}/api/chatbot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: initialMessage,
        conversation_id: conversation.id,
        session_id: chatbotSessionId,
        tenant_slug: tenant?.slug || null,
        locale: 'es',
        channel: 'dashboard',
        screen_path: '/conversations',
        user_role: profile?.global_role || profile?.role || null,
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      await insertControlledChatbotFailureMessage({
        supabase,
        tenantId,
        conversationId: conversation.id,
        content: initialMessage,
        senderUserId: user?.id,
        channel,
      })
      throw new Error('No pude procesar el primer mensaje del chatbot en la nueva conversación')
    }
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'conversation.created',
    entity_type: 'conversation',
    entity_id: conversation.id,
    actor_user_id: user?.id,
    payload: { channel, subject, lead_id: leadId },
  })

  revalidatePath('/conversations')
  return { id: conversation.id }
}

export async function sendMessageAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const conversationId = String(formData.get('conversationId') || '')
  const content = String(formData.get('content') || '').trim()
  const direction = String(formData.get('direction') || 'outbound') as string
  const tenantTemplateId = formData.get('tenantTemplateId') ? String(formData.get('tenantTemplateId')) : null
  const templateParams = formData.get('templateParams') ? String(formData.get('templateParams')) : null

  if (!conversationId || (!content && !tenantTemplateId)) throw new Error('Datos incompletos')

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('channel, metadata, lead_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()

  if (convError || !conv) throw new Error('Conversación no encontrada')

  const convTyped = conv as unknown as { channel: string; metadata: Record<string, unknown>; lead_id: string | null }

  if (convTyped.channel === 'whatsapp' && direction === 'outbound') {
    const convMeta = convTyped.metadata || {}
    const whatsappTo = typeof convMeta.last_whatsapp_to === 'string' ? convMeta.last_whatsapp_to : null
    const contactPhone = typeof convMeta.contact_phone === 'string' ? convMeta.contact_phone : null
    let sendTo = whatsappTo || contactPhone
    let resolvedSource: 'metadata.last_whatsapp_to' | 'metadata.contact_phone' | 'lead.contact_phone' | null = null

    if (whatsappTo) {
      resolvedSource = 'metadata.last_whatsapp_to'
    } else if (contactPhone) {
      resolvedSource = 'metadata.contact_phone'
    }

    if (!sendTo && convTyped.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('contact_phone')
        .eq('id', convTyped.lead_id)
        .maybeSingle()
      sendTo = lead?.contact_phone || null
      if (lead?.contact_phone) {
        resolvedSource = 'lead.contact_phone'
      }
    }

    if (!sendTo) {
      throw new Error('No tengo número de teléfono para enviar WhatsApp. Abre el formulario de WhatsApp.')
    }

    const fd = new FormData()
    fd.set('conversationId', conversationId)
    fd.set('to', sendTo)
    fd.set('content', content)
    fd.set('resolvedSource', resolvedSource || '')
    if (tenantTemplateId) fd.set('tenantTemplateId', tenantTemplateId)
    if (templateParams) fd.set('templateParams', templateParams)
    await sendWhatsAppFromConversationAction(fd)
    revalidatePath('/conversations')
    return
  }

  if (convTyped.channel === 'chatbot' && direction === 'outbound') {
    const convMeta = convTyped.metadata || {}
    const sessionId = typeof convMeta.chatbot_session_id === 'string' ? convMeta.chatbot_session_id : null

    if (!sessionId) {
      await insertControlledChatbotFailureMessage({
        supabase,
        tenantId,
        conversationId,
        content,
        senderUserId: user?.id,
        channel: convTyped.channel,
      })
      revalidatePath('/conversations')
      throw new Error('La conversación de chatbot no tiene sesión activa para procesar este mensaje')
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .single()

    const headerStore = await headers()
    const origin = buildInternalOrigin(headerStore)
    const response = await fetch(`${origin}/api/chatbot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: content,
        session_id: sessionId,
        tenant_slug: tenant?.slug || null,
        locale: 'es',
        channel: 'dashboard',
        screen_path: '/conversations',
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      await insertControlledChatbotFailureMessage({
        supabase,
        tenantId,
        conversationId,
        content,
        senderUserId: user?.id,
        channel: convTyped.channel,
      })
      throw new Error('No pude procesar el mensaje del chatbot desde Conversations')
    }

    revalidatePath('/conversations')
    revalidatePath('/appointments')
    return
  }

  const { error } = await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    tenant_id: tenantId,
    sender_user_id: user?.id,
    direction,
    channel: conv?.channel || 'internal',
    status: 'sent',
    content,
  })

  if (error) throw new Error(error.message)

  if (direction === 'outbound') {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'message.sent',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: { channel: conv?.channel },
    })
  }

  revalidatePath('/conversations')
}

export async function updateConversationStatusAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()

  const conversationId = String(formData.get('conversationId') || '')
  const status = String(formData.get('status') || '')

  if (!conversationId || !status) throw new Error('Datos incompletos')

  const { error } = await supabase
    .from('conversations')
    .update({ status })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)

  revalidatePath('/conversations')
}

export async function classifyMessageAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()

  const messageId = String(formData.get('messageId') || '')
  const content = String(formData.get('content') || '')

  if (!messageId && !content) throw new Error('Se requiere messageId o content')

  let messageContent = content
  const targetMessageId = messageId

  if (messageId && !content) {
    const { data: msg } = await supabase
      .from('conversation_messages')
      .select('content')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single()

    if (!msg) throw new Error('Mensaje no encontrado')
    messageContent = msg.content
  }

  const result: ClassificationResult = classifyMessage(messageContent)

  if (targetMessageId) {
    const { data: existing } = await supabase
      .from('conversation_messages')
      .select('metadata')
      .eq('id', targetMessageId)
      .single()

    const existingMeta: MessageMetadata = (existing?.metadata as MessageMetadata) || {}
    const updatedMeta: MessageMetadata = {
      ...existingMeta,
      intent: result.intent,
      decision: result.decision,
      classified_at: result.classified_at,
    }

    await supabase
      .from('conversation_messages')
      .update({ metadata: updatedMeta })
      .eq('id', targetMessageId)
      .eq('tenant_id', tenantId)
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'intent.classified',
    entity_type: 'conversation_message',
    entity_id: targetMessageId || null,
    payload: {
      intent: result.intent.intent,
      confidence: result.intent.confidence,
      decision: result.decision.decision,
      reason: result.decision.reason,
      source: result.intent.source,
    },
  })

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'decision.made',
    entity_type: 'conversation_message',
    entity_id: targetMessageId || null,
    payload: {
      decision: result.decision.decision,
      reason: result.decision.reason,
      intent: result.intent.intent,
    },
  })

  revalidatePath('/conversations')
  return result
}

export async function classifyConversationAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()

  const conversationId = String(formData.get('conversationId') || '')
  if (!conversationId) throw new Error('conversationId requerido')

  const { data: msgs } = await supabase
    .from('conversation_messages')
    .select('id, content, metadata, direction')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(5)

  const results = []
  for (const msg of (msgs || [])) {
    const meta = msg.metadata as MessageMetadata
    if (meta?.intent && meta?.decision) continue

    const result = classifyMessage(msg.content)

    await supabase
      .from('conversation_messages')
      .update({
        metadata: {
          ...((msg.metadata as Record<string, unknown>) || {}),
          intent: result.intent,
          decision: result.decision,
          classified_at: result.classified_at,
        },
      })
      .eq('id', msg.id)

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'intent.classified',
      entity_type: 'conversation_message',
      entity_id: msg.id,
      payload: {
        intent: result.intent.intent,
        confidence: result.intent.confidence,
        decision: result.decision.decision,
        reason: result.decision.reason,
      },
    })

    results.push({ message_id: msg.id, ...result })
  }

  revalidatePath('/conversations')
  return results
}

export async function generateAutoReplyAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const messageId = String(formData.get('messageId') || '')
  if (!messageId) throw new Error('messageId requerido')

  const { data: msg } = await supabase
    .from('conversation_messages')
    .select('id, content, metadata, conversation_id, channel')
    .eq('id', messageId)
    .eq('tenant_id', tenantId)
    .single()

  if (!msg) throw new Error('Mensaje no encontrado')

  const meta = (msg.metadata || {}) as MessageMetadataWithReply
  if (!meta.intent || !meta.decision) {
    const classification = classifyMessage(msg.content)
    meta.intent = classification.intent
    meta.decision = classification.decision
    meta.classified_at = classification.classified_at
  }

  const reply = generateReply({
    intent: meta.intent.intent,
    decision: meta.decision.decision,
    confidence: meta.intent.confidence,
    channel: msg.channel,
  })

  if (!reply) {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'auto_reply.skipped',
      entity_type: 'conversation_message',
      entity_id: messageId,
      actor_user_id: user?.id,
      payload: {
        intent: meta.intent.intent,
        decision: meta.decision.decision,
        reason: 'No aplica para respuesta automática',
      },
    })
    revalidatePath('/conversations')
    return { status: 'skipped', reason: 'No aplica para respuesta automática' }
  }

  meta.auto_reply = reply

  await supabase
    .from('conversation_messages')
    .update({ metadata: meta })
    .eq('id', messageId)
    .eq('tenant_id', tenantId)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'auto_reply.generated',
    entity_type: 'conversation_message',
    entity_id: messageId,
    actor_user_id: user?.id,
    payload: {
      template_id: reply.template_id,
      intent: reply.based_on_intent,
      decision: reply.based_on_decision,
      confidence: reply.confidence,
      status: reply.reply_status,
      channel: reply.channel,
    },
  })

  if (reply.reply_status === 'sent') {
    await supabase.from('conversation_messages').insert({
      conversation_id: msg.conversation_id,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: msg.channel,
      status: 'sent',
      content: reply.reply_text,
      is_automated: true,
      metadata: {
        auto_reply_source: reply.template_id,
        based_on_message_id: messageId,
      },
    })

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'auto_reply.saved',
      entity_type: 'conversation',
      entity_id: msg.conversation_id,
      actor_user_id: user?.id,
      payload: { template_id: reply.template_id, status: 'sent' },
    })
  }

  revalidatePath('/conversations')
  return { status: reply.reply_status, template_id: reply.template_id, reply_text: reply.reply_text }
}

export async function sendDraftReplyAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const messageId = String(formData.get('messageId') || '')
  if (!messageId) throw new Error('messageId requerido')

  const { data: msg } = await supabase
    .from('conversation_messages')
    .select('id, metadata, conversation_id, channel')
    .eq('id', messageId)
    .eq('tenant_id', tenantId)
    .single()

  if (!msg) throw new Error('Mensaje no encontrado')

  const meta = (msg.metadata || {}) as MessageMetadataWithReply
  if (!meta.auto_reply || meta.auto_reply.reply_status !== 'draft') {
    throw new Error('No hay borrador de respuesta para enviar')
  }

  const replyText = meta.auto_reply.reply_text

  await supabase.from('conversation_messages').insert({
    conversation_id: msg.conversation_id,
    tenant_id: tenantId,
    sender_user_id: user?.id,
    direction: 'outbound',
    channel: msg.channel,
    status: 'sent',
    content: replyText,
    is_automated: true,
    metadata: {
      auto_reply_source: meta.auto_reply.template_id,
      based_on_message_id: messageId,
    },
  })

  meta.auto_reply.reply_status = 'sent'
  await supabase
    .from('conversation_messages')
    .update({ metadata: meta })
    .eq('id', messageId)
    .eq('tenant_id', tenantId)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'auto_reply.saved',
    entity_type: 'conversation',
    entity_id: msg.conversation_id,
    actor_user_id: user?.id,
    payload: { template_id: meta.auto_reply.template_id, status: 'sent', source: 'draft_approved' },
  })

  revalidatePath('/conversations')
}

export async function suggestAppointmentSlotsAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const conversationId = String(formData.get('conversationId') || '')
  if (!conversationId) throw new Error('conversationId requerido')

  const { data: existingAppts } = await supabase
    .from('appointments')
    .select('start_time, end_time, status')
    .eq('tenant_id', tenantId)
    .gte('start_time', new Date().toISOString())
    .lte('start_time', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString())

  const slots = findAvailableSlots(existingAppts || [], { tenantId })
  const slotMessage = suggestSlotsMessage(slots)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'appointment.slots_suggested',
    entity_type: 'conversation',
    entity_id: conversationId,
    actor_user_id: user?.id,
    payload: {
      slots_count: slots.length,
      slots: slots.slice(0, 3),
      criteria: { days_ahead: 5, duration_minutes: 60 },
    },
  })

  revalidatePath('/conversations')
  return { slots, slotMessage }
}

export async function createAppointmentFromConversationAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const conversationId = String(formData.get('conversationId') || '')
  const startTime = String(formData.get('startTime') || '')
  const endTime = String(formData.get('endTime') || '')
  const title = String(formData.get('title') || 'Visita desde conversación')
  const appointmentType = String(formData.get('appointmentType') || 'visit')
  const leadId = formData.get('leadId') ? String(formData.get('leadId')) : null
  const propertyId = formData.get('propertyId') ? String(formData.get('propertyId')) : null
  const location = String(formData.get('location') || '') || null

  if (!conversationId || !startTime || !endTime) {
    throw new Error('conversationId, startTime y endTime son obligatorios')
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, lead_id, metadata')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()

  if (!conv) throw new Error('Conversación no encontrada')

  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId || conv.lead_id,
      property_id: propertyId,
      user_id: user!.id,
      title,
      appointment_type: appointmentType,
      status: 'scheduled',
      start_time: startTime,
      end_time: endTime,
      location,
      notes: `Creada desde conversación ${conversationId}`,
    })
    .select()
    .single()

  if (apptError) throw new Error(apptError.message)

  const convMeta = (conv.metadata || {}) as Record<string, unknown>
  await supabase
    .from('conversations')
    .update({
      metadata: { ...convMeta, appointment_id: appointment.id, appointment_created_at: new Date().toISOString() },
    })
    .eq('id', conversationId)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'appointment.created.from_conversation',
    entity_type: 'appointment',
    entity_id: appointment.id,
    actor_user_id: user?.id,
    payload: { conversation_id: conversationId, start_time: startTime, end_time: endTime, appointment_type: appointmentType },
  })

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'appointment.reminder_scheduled',
    entity_type: 'appointment',
    entity_id: appointment.id,
    actor_user_id: user?.id,
    payload: { reminder_for: startTime, conversation_id: conversationId },
  })

  let contactLocale: string | null = null
  const effectiveLeadId = leadId || conv.lead_id
  let contactName = ''
  let contactPhone = (conv.metadata as Record<string, unknown>)?.whatsapp_from as string || ''

  if (effectiveLeadId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('preferred_language, locale, first_name, phone')
      .eq('id', effectiveLeadId)
      .eq('tenant_id', tenantId)
      .single()
    if (lead) {
      contactLocale = lead.preferred_language || lead.locale || null
      contactName = lead.first_name || ''
      if (!contactPhone && lead.phone) {
        contactPhone = normalizeWhatsAppRecipient(lead.phone)
      }
    }
  }
  if (!contactLocale) {
    contactLocale = (conv.metadata as Record<string, unknown>)?.whatsapp_locale as string || null
  }

  if (!contactPhone) {
    console.warn('[createAppointmentFromConversation] No contact phone found, skipping WhatsApp confirmation', { conversationId })
  } else {
    const dbConfigResponse = await supabase
      .from('tenant_whatsapp_configs')
      .select('phone_number_id, access_token_encrypted, mode, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle()

    let deliveryConfig = detectWhatsAppDeliveryConfig(process.env)
    const channelMode = dbConfigResponse?.data?.mode || 'sandbox'

    if (dbConfigResponse?.data?.phone_number_id && dbConfigResponse.data.access_token_encrypted) {
      deliveryConfig = {
        provider: 'meta_cloud',
        configured: true,
        meta: {
          token: dbConfigResponse.data.access_token_encrypted,
          phoneNumberId: dbConfigResponse.data.phone_number_id,
        },
      }
    }

    let propertyTitle = 'la propiedad'
    if (propertyId) {
      const { data: prop } = await supabase
        .from('properties')
        .select('title')
        .eq('id', propertyId)
        .eq('tenant_id', tenantId)
        .single()
      if (prop?.title) propertyTitle = prop.title
    }

    if (deliveryConfig.configured && deliveryConfig.meta) {
      const resolved = resolveTemplateByKeyAndLocale('visita_confirmacion', contactLocale || 'es')
      const templateName = resolved?.templateName || 'visita_confirmacion_es'
      const langCode = resolved?.localeCode || 'es'

      const startDate = new Date(startTime)
      const dateStr = startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
      const timeStr = startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

      const templateParams = [
        contactName || 'there',
        propertyTitle,
        dateStr,
        timeStr,
      ]

      console.log('[createAppointmentFromConversation] Sending visita_confirmacion template', {
        template: templateName,
        lang: langCode,
        locale: contactLocale,
        usedFallback: resolved?.usedFallback,
        appointmentId: appointment.id,
        conversationId,
      })

      const waResult = await sendWhatsAppViaMeta({
        config: deliveryConfig.meta,
        to: contactPhone,
        text: templateParams.join('|'),
        templateName,
        templateParams,
        templateLanguageCode: langCode,
      })

      await supabase.from('conversation_messages').insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        sender_user_id: user?.id,
        direction: 'outbound',
        channel: 'whatsapp',
        status: waResult.status === 'sent' ? 'sent' : 'failed',
        content: `Visita confirmada: ${propertyTitle} - ${dateStr} ${timeStr}`,
        is_automated: true,
        metadata: {
          whatsapp_to: contactPhone,
          whatsapp_from: 'noreply',
          whatsapp_message_type: 'template',
          whatsapp_provider_message_id: waResult.provider_message_id,
          whatsapp_delivery_status: waResult.status === 'sent' ? 'accepted' : waResult.status,
          whatsapp_delivery_provider: deliveryConfig.provider,
          whatsapp_delivery_sandbox: channelMode === 'sandbox',
          whatsapp_template_name: waResult.template_name,
          whatsapp_template_key: 'visita_confirmacion',
          whatsapp_template_key_base: 'visita_confirmacion',
          whatsapp_locale_requested: contactLocale,
          whatsapp_locale_resolved: resolved?.localeCode || langCode,
          whatsapp_locale_used_fallback: resolved?.usedFallback || false,
          whatsapp_locale_fallback_reason: resolved?.fallbackReason || null,
          appointment_id: appointment.id,
          trigger: 'appointment.created.from_conversation',
          reply_type: 'confirmation_template',
        },
      })

      await supabase.from('automation_events').insert({
        tenant_id: tenantId,
        event_type: waResult.status === 'sent' ? 'whatsapp.visit_confirmation.sent' : 'whatsapp.visit_confirmation.failed',
        entity_type: 'appointment',
        entity_id: appointment.id,
        actor_user_id: user?.id,
        payload: {
          from: contactPhone,
          template_name: waResult.template_name,
          template_key_base: 'visita_confirmacion',
          locale_requested: contactLocale,
          locale_resolved: resolved?.localeCode || langCode,
          used_fallback: resolved?.usedFallback || false,
          fallback_reason: resolved?.fallbackReason || null,
          provider_message_id: waResult.provider_message_id,
          status: waResult.status,
          error: waResult.error,
          appointment_id: appointment.id,
          conversation_id: conversationId,
          start_time: startTime,
        },
      })
    }
  }

  revalidatePath('/conversations')
  revalidatePath('/appointments')
  return { id: appointment.id, start_time: appointment.start_time }
}

export async function rescheduleAppointmentAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const appointmentId = String(formData.get('appointmentId') || '')
  const newStartTime = String(formData.get('newStartTime') || '')
  const newEndTime = String(formData.get('newEndTime') || '')

  if (!appointmentId || !newStartTime || !newEndTime) {
    throw new Error('appointmentId, newStartTime y newEndTime son obligatorios')
  }

  const { data: existing } = await supabase
    .from('appointments')
    .select('id, start_time, end_time, status')
    .eq('id', appointmentId)
    .eq('tenant_id', tenantId)
    .single()

  if (!existing) throw new Error('Cita no encontrada')

  const { error } = await supabase
    .from('appointments')
    .update({
      start_time: newStartTime,
      end_time: newEndTime,
      status: 'scheduled',
      notes: `Reprogramada de ${existing.start_time} a ${newStartTime}`,
    })
    .eq('id', appointmentId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'appointment.rescheduled',
    entity_type: 'appointment',
    entity_id: appointmentId,
    actor_user_id: user?.id,
    payload: { old_start: existing.start_time, new_start: newStartTime },
  })

  revalidatePath('/appointments')
  revalidatePath('/conversations')
}

export async function escalateToHumanAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const conversationId = String(formData.get('conversationId') || '')
  const assignedTo = formData.get('assignedTo') ? String(formData.get('assignedTo')) : null
  const reason = String(formData.get('reason') || 'Escalado manualmente') || 'Escalado manualmente'

  if (!conversationId) throw new Error('conversationId requerido')

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, lead_id, metadata, status')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()

  if (!conv) throw new Error('Conversación no encontrada')

  const escalation: EscalationData = {
    status: assignedTo ? 'assigned' : 'pending',
    requested_at: new Date().toISOString(),
    requested_by: user?.id || null,
    assigned_to: assignedTo,
    assigned_at: assignedTo ? new Date().toISOString() : null,
    resolved_at: null,
    resolved_by: null,
    reason,
  }

  const convMeta = (conv.metadata || {}) as Record<string, unknown>
  await supabase
    .from('conversations')
    .update({
      metadata: { ...convMeta, escalation },
      status: 'waiting',
    })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'human_escalation.requested',
    entity_type: 'conversation',
    entity_id: conversationId,
    actor_user_id: user?.id,
    payload: { reason, assigned_to: assignedTo },
  })

  if (assignedTo) {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'human_escalation.assigned',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: { assigned_to: assignedTo },
    })
  }

  revalidatePath('/conversations')
  return { escalation }
}

export async function generateHumanSuggestionAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const messageId = String(formData.get('messageId') || '')
  if (!messageId) throw new Error('messageId requerido')

  const { data: msg } = await supabase
    .from('conversation_messages')
    .select('id, content, metadata, conversation_id')
    .eq('id', messageId)
    .eq('tenant_id', tenantId)
    .single()

  if (!msg) throw new Error('Mensaje no encontrado')

  const meta = (msg.metadata || {}) as MessageMetadataFull
  if (!meta.intent || !meta.decision) {
    const classification = classifyMessage(msg.content)
    meta.intent = classification.intent
    meta.decision = classification.decision
    meta.classified_at = classification.classified_at
  }

  const suggestion = generateHumanSuggestion({
    intent: meta.intent.intent,
    decision: meta.decision.decision,
  })

  if (!suggestion) {
    throw new Error('No se puede generar sugerencia para esta combinación de intención/decisión')
  }

  meta.human_suggestion = suggestion

  await supabase
    .from('conversation_messages')
    .update({ metadata: meta })
    .eq('id', messageId)
    .eq('tenant_id', tenantId)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'human_reply.suggested',
    entity_type: 'conversation_message',
    entity_id: messageId,
    actor_user_id: user?.id,
    payload: {
      template_id: suggestion.source,
      intent: suggestion.based_on_intent,
      decision: suggestion.based_on_decision,
    },
  })

  revalidatePath('/conversations')
  return { suggestion }
}

export async function sendHumanReplyAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const conversationId = String(formData.get('conversationId') || '')
  const content = String(formData.get('content') || '').trim()
  const messageId = formData.get('messageId') ? String(formData.get('messageId')) : null

  if (!conversationId || !content) throw new Error('conversationId y content son obligatorios')

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, channel, metadata')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()

  if (!conv) throw new Error('Conversación no encontrada')

  const { error } = await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    tenant_id: tenantId,
    sender_user_id: user?.id,
    direction: 'outbound',
    channel: conv.channel,
    status: 'sent',
    content,
    is_automated: false,
    metadata: { reply_type: 'human', sent_by: user?.id },
  })

  if (error) throw new Error(error.message)

  if (messageId) {
    const { data: origMsg } = await supabase
      .from('conversation_messages')
      .select('metadata')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single()

    if (origMsg) {
      const origMeta = (origMsg.metadata || {}) as MessageMetadataFull
      origMeta.human_reply = {
        reply_text: content,
        sent_at: new Date().toISOString(),
        sent_by: user?.id || '',
      }
      await supabase
        .from('conversation_messages')
        .update({ metadata: origMeta })
        .eq('id', messageId)
        .eq('tenant_id', tenantId)
    }
  }

  const convMeta = (conv.metadata || {}) as Record<string, unknown>
  if (convMeta.escalation) {
    const esc = convMeta.escalation as EscalationData
    if (esc.status !== 'resolved') {
      esc.status = 'resolved'
      esc.resolved_at = new Date().toISOString()
      esc.resolved_by = user?.id || null
      await supabase
        .from('conversations')
        .update({ metadata: { ...convMeta, escalation: esc }, status: 'open' })
        .eq('id', conversationId)
        .eq('tenant_id', tenantId)

      await supabase.from('automation_events').insert({
        tenant_id: tenantId,
        event_type: 'human_escalation.resolved',
        entity_type: 'conversation',
        entity_id: conversationId,
        actor_user_id: user?.id,
        payload: { resolved_by: user?.id },
      })
    }
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'human_reply.sent',
    entity_type: 'conversation',
    entity_id: conversationId,
    actor_user_id: user?.id,
    payload: { reply_length: content.length },
  })

  revalidatePath('/conversations')
}

export async function assignConversationAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const conversationId = String(formData.get('conversationId') || '')
  const assignedTo = String(formData.get('assignedTo') || '')

  if (!conversationId || !assignedTo) throw new Error('conversationId y assignedTo son obligatorios')

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, metadata')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()

  if (!conv) throw new Error('Conversación no encontrada')

  const convMeta = (conv.metadata || {}) as Record<string, unknown>
  const existingEscalation = convMeta.escalation as EscalationData | undefined

  const escalation: EscalationData = existingEscalation ? {
    ...existingEscalation,
    status: 'assigned',
    assigned_to: assignedTo,
    assigned_at: new Date().toISOString(),
  } : {
    status: 'assigned',
    requested_at: new Date().toISOString(),
    requested_by: user?.id || null,
    assigned_to: assignedTo,
    assigned_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null,
    reason: 'Asignado manualmente',
  }

  await supabase
    .from('conversations')
    .update({ metadata: { ...convMeta, escalation } })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'human_escalation.assigned',
    entity_type: 'conversation',
    entity_id: conversationId,
    actor_user_id: user?.id,
    payload: { assigned_to: assignedTo },
  })

  revalidatePath('/conversations')
}

export async function sendEmailFromConversationAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const conversationId = String(formData.get('conversationId') || '')
  const to = String(formData.get('to') || '').trim()
  const subject = String(formData.get('subject') || '').trim()
  const content = String(formData.get('content') || '').trim()

  if (!conversationId || !to || !content) throw new Error('conversationId, to y content son obligatorios')

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, channel, metadata, subject, lead_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()

  if (!conv) throw new Error('Conversación no encontrada')

  const emailSubject = subject || generateEmailSubject('Re:', conv.subject || 'Conversación')
  const localMessageId = `<${Date.now()}-${conversationId}@crm-inmobiliario.local>`
  const deliveryConfig = detectEmailDeliveryConfig(process.env)
  const convMeta = (conv.metadata || {}) as Record<string, unknown>
  const inReplyTo = typeof convMeta.email_message_id === 'string' ? convMeta.email_message_id : undefined
  const references = Array.isArray(convMeta.email_references)
    ? convMeta.email_references.filter((value): value is string => typeof value === 'string')
    : inReplyTo
    ? [inReplyTo]
    : undefined

  const emailMeta: EmailMetadata = {
    email_from: deliveryConfig.smtp?.fromEmail || 'noreply@crm-inmobiliario.local',
    email_to: to,
    email_subject: emailSubject,
    email_message_id: localMessageId,
    email_in_reply_to: inReplyTo,
    email_references: references,
    reply_type: 'human',
    email_delivery_provider: deliveryConfig.provider,
  }

  if (!deliveryConfig.configured) {
    const failureReason = 'El proveedor de email saliente no esta configurado en el servidor.'

    const { error } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: 'email',
      status: 'failed',
      content,
      is_automated: false,
      metadata: {
        ...emailMeta,
        reply_type: 'human',
        email_delivery_status: 'failed',
        email_delivery_error: failureReason,
      },
    })

    if (error) throw new Error(error.message)

    await supabase
      .from('conversations')
      .update({
        metadata: { ...convMeta, email_thread_id: emailSubject, last_email_to: to, last_email_error: failureReason },
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'email.outbound.failed',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: {
        to,
        subject: emailSubject,
        message_id: localMessageId,
        provider: deliveryConfig.provider,
        reason: failureReason,
        detail: deliveryConfig.reason,
      },
    })

    console.error('[conversations] email outbound blocked: provider not configured', {
      conversationId,
      to,
      subject: emailSubject,
      provider: deliveryConfig.provider,
      detail: deliveryConfig.reason,
    })

    revalidatePath('/conversations')
    throw new Error(`${failureReason} Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_FROM_EMAIL y SMTP_FROM_NAME.`)
  }

  if (deliveryConfig.provider !== 'smtp' || !deliveryConfig.smtp) {
    const transportReason = `Hay credenciales para ${deliveryConfig.provider}, pero este repo solo tiene implementado transporte SMTP real.`

    const { error } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: 'email',
      status: 'failed',
      content,
      is_automated: false,
      metadata: {
        ...emailMeta,
        reply_type: 'human',
        email_delivery_status: 'failed',
        email_delivery_error: transportReason,
      },
    })

    if (error) throw new Error(error.message)

    await supabase
      .from('conversations')
      .update({
        metadata: { ...convMeta, email_thread_id: emailSubject, last_email_to: to, last_email_error: transportReason },
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'email.outbound.failed',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: {
        to,
        subject: emailSubject,
        message_id: localMessageId,
        provider: deliveryConfig.provider,
        reason: transportReason,
      },
    })

    revalidatePath('/conversations')
    throw new Error(transportReason)
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'email.outbound.created',
    entity_type: 'conversation',
    entity_id: conversationId,
    actor_user_id: user?.id,
    payload: {
      to,
      subject: emailSubject,
      message_id: localMessageId,
      provider: deliveryConfig.provider,
    },
  })

  try {
    const smtpResult = await sendEmailViaSmtp({
      config: deliveryConfig.smtp,
      to,
      subject: emailSubject,
      text: content,
      html: content,
      messageId: localMessageId,
      inReplyTo,
      references,
    })

    const sentMessageId = smtpResult.messageId || localMessageId
    const accepted = smtpResult.accepted || []
    const rejected = smtpResult.rejected || []

    if (accepted.length === 0 || rejected.length > 0) {
      const rejectionReason = rejected.length > 0
        ? `SMTP rechazo destinatarios: ${rejected.join(', ')}`
        : 'SMTP no confirmo destinatarios aceptados.'

      const { error } = await supabase.from('conversation_messages').insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        sender_user_id: user?.id,
        direction: 'outbound',
        channel: 'email',
        status: 'failed',
        content,
        is_automated: false,
        metadata: {
          ...emailMeta,
          email_message_id: sentMessageId,
          email_delivery_status: 'failed',
          email_delivery_error: rejectionReason,
          email_delivery_response: smtpResult.response,
          email_delivery_provider_message_id: smtpResult.messageId,
          email_delivery_accepted: accepted,
          email_delivery_rejected: rejected,
        },
      })

      if (error) throw new Error(error.message)

      await supabase
        .from('conversations')
        .update({
          metadata: { ...convMeta, email_thread_id: emailSubject, last_email_to: to, last_email_error: rejectionReason, email_message_id: sentMessageId },
        })
        .eq('id', conversationId)
        .eq('tenant_id', tenantId)

      await supabase.from('automation_events').insert({
        tenant_id: tenantId,
        event_type: 'email.outbound.failed',
        entity_type: 'conversation',
        entity_id: conversationId,
        actor_user_id: user?.id,
        payload: {
          to,
          subject: emailSubject,
          message_id: sentMessageId,
          provider: deliveryConfig.provider,
          reason: rejectionReason,
          accepted,
          rejected,
          response: smtpResult.response,
        },
      })

      console.error('[conversations] email outbound failed after SMTP response', {
        conversationId,
        to,
        subject: emailSubject,
        accepted,
        rejected,
        response: smtpResult.response,
      })

      revalidatePath('/conversations')
      throw new Error(rejectionReason)
    }

    const { error } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: 'email',
      status: 'sent',
      content,
      is_automated: false,
      metadata: {
        ...emailMeta,
        email_message_id: sentMessageId,
        email_delivery_status: 'sent',
        email_delivery_response: smtpResult.response,
        email_delivery_provider_message_id: smtpResult.messageId,
        email_delivery_accepted: accepted,
        email_delivery_rejected: rejected,
      },
    })

    if (error) throw new Error(error.message)

    await supabase
      .from('conversations')
      .update({
        metadata: {
          ...convMeta,
          email_thread_id: emailSubject,
          last_email_to: to,
          last_email_error: null,
          email_message_id: sentMessageId,
          email_references: references,
        },
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'email.outbound.sent',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: {
        to,
        subject: emailSubject,
        message_id: sentMessageId,
        provider: smtpResult.provider,
        accepted,
        rejected,
        response: smtpResult.response,
      },
    })

    revalidatePath('/conversations')
    return {
      messageId: sentMessageId,
      subject: emailSubject,
      provider: smtpResult.provider,
      accepted,
      rejected,
    }
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'SMTP send failed'

    const { error: insertError } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: 'email',
      status: 'failed',
      content,
      is_automated: false,
      metadata: {
        ...emailMeta,
        reply_type: 'human',
        email_delivery_status: 'failed',
        email_delivery_error: failureReason,
      },
    })

    if (insertError) throw new Error(insertError.message)

    await supabase
      .from('conversations')
      .update({
        metadata: { ...convMeta, email_thread_id: emailSubject, last_email_to: to, last_email_error: failureReason },
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'email.outbound.failed',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: {
        to,
        subject: emailSubject,
        message_id: localMessageId,
        provider: deliveryConfig.provider,
        reason: failureReason,
      },
    })

    console.error('[conversations] email outbound failed during SMTP send', {
      conversationId,
      to,
      subject: emailSubject,
      provider: deliveryConfig.provider,
      error: failureReason,
    })

    revalidatePath('/conversations')
    throw new Error(failureReason)
  }
}

export async function sendEmailAiReplyAction(formData: FormData) {
  const messageId = String(formData.get('messageId') || '')
  if (!messageId) throw new Error('messageId requerido')
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()
  const result = await sendEmailAiReplyByMessageId({
    supabase,
    tenantId,
    actorUserId: user?.id,
    messageId,
    mode: 'email_manual_test',
  })
  revalidatePath('/conversations')
  return result
}

export async function processInboundEmailAction(data: {
  from: string
  to: string
  subject: string
  text: string
  html?: string
  message_id?: string
  in_reply_to?: string
  references?: string[]
  tenant_id?: string
}, options?: {
  supabase?: ConversationsSupabaseClient
}) {
  const supabase = options?.supabase ?? await createClient()

  const { from, to, subject, text, html, message_id, in_reply_to, references, tenant_id } = data

  if (message_id) {
    const { data: existingMessage } = await supabase
      .from('conversation_messages')
      .select('id')
      .contains('metadata', { email_message_id: message_id })
      .limit(1)
      .maybeSingle()

    if (existingMessage) {
      await supabase.from('automation_events').insert({
        tenant_id: null,
        event_type: 'email.inbound.duplicate',
        entity_type: 'email_message',
        payload: { from, to, subject, message_id },
      })
      return { status: 'duplicate', reason: 'Email message already imported', message_id }
    }
  }

  const fromAddr = parseEmailAddress(from)
  const toAddr = parseEmailAddress(to)
  const normalizedSenderEmail = normalizeEmailIdentity(fromAddr.email)
  const fallbackTenantSlug = process.env.EMAIL_INBOUND_TENANT_SLUG?.trim() || null
  const recipientLocalPart = toAddr.email.split('@')[0]?.trim() || null
  const normalizedInboundSubject = normalizeEmailSubject(subject || '')
  const threadIds = [in_reply_to, ...(references || [])]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  let scopedTenantId: string | null = tenant_id || null
  if (!scopedTenantId) {
    const slugCandidates = [recipientLocalPart, fallbackTenantSlug]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .filter((value, idx, arr) => arr.indexOf(value) === idx)

    for (const candidate of slugCandidates) {
      const { data: scopedTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', candidate)
        .single()

      if (scopedTenant?.id) {
        scopedTenantId = scopedTenant.id
        break
      }
    }
  }

  if (!scopedTenantId) {
    await supabase.from('automation_events').insert({
      tenant_id: null,
      event_type: 'email.inbound.skipped',
      entity_type: 'email_message',
      payload: {
        from,
        to,
        subject,
        reason: 'No tenant could be inferred from recipient email',
        inferred_local_part: recipientLocalPart,
        fallback_tenant_slug: fallbackTenantSlug,
      },
    })
    return { status: 'skipped', reason: 'No tenant could be inferred from recipient email', tenantId: null }
  }

  const { data: existingConvs } = await supabase
    .from('conversations')
    .select('id, tenant_id, subject, metadata, lead_id')
    .eq('channel', 'email')
    .eq('tenant_id', scopedTenantId)

  const { data: outboundMessages } = await supabase
    .from('conversation_messages')
    .select('conversation_id, tenant_id, metadata, created_at')
    .eq('channel', 'email')
    .eq('direction', 'outbound')
    .eq('tenant_id', scopedTenantId)

  const { data: channelTestEvents } = await supabase
    .from('automation_events')
    .select('payload, created_at')
    .eq('tenant_id', scopedTenantId)
    .eq('event_type', 'channel.test.email.sent')

  const inboundContact = await resolveInboundEmailContact(supabase, scopedTenantId, normalizedSenderEmail)
  const irrelevantReason = isIrrelevantInboxEmail({
    fromEmail: normalizedSenderEmail,
    subject,
    text,
    html,
  })

  let conversationId: string | null = null
  let tenantId: string | null = null
  let matchedBy: 'thread' | 'sender_subject' | 'channel_test' | null = null
  const existingConversationById = new Map((existingConvs || []).map((conv) => [conv.id, conv]))

  if (threadIds.length > 0) {
    for (const msg of (outboundMessages || [])) {
      const meta = (msg.metadata || {}) as Record<string, unknown>
      const outboundIds = [meta.email_message_id, meta.email_delivery_provider_message_id]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      const targetConversation = existingConversationById.get(msg.conversation_id as string)
      const targetMeta = (targetConversation?.metadata || {}) as Record<string, unknown>
      const targetThreadSubject = normalizeEmailSubject(
        typeof targetMeta.email_thread_id === 'string'
          ? targetMeta.email_thread_id
          : typeof targetConversation?.subject === 'string'
            ? targetConversation.subject
            : ''
      )
      const outboundSubject = normalizeEmailSubject(typeof meta.email_subject === 'string' ? meta.email_subject : '')
      const sameThreadByHeaders = outboundIds.some((id) => threadIds.includes(id))
      const sameThreadBySubject = Boolean(
        normalizedInboundSubject
        && ((targetThreadSubject && targetThreadSubject === normalizedInboundSubject)
          || (outboundSubject && outboundSubject === normalizedInboundSubject))
      )

      if (sameThreadByHeaders && sameThreadBySubject) {
        conversationId = msg.conversation_id as string
        tenantId = msg.tenant_id as string
        matchedBy = 'thread'
        break
      }
    }
  }

  if (!conversationId && existingConvs?.length) {
    for (const conv of existingConvs) {
      const meta = conv.metadata as Record<string, unknown>
      const convSubject = normalizeEmailSubject(typeof meta.email_thread_id === 'string' ? meta.email_thread_id : '')
      if (normalizeEmailIdentity(typeof meta.last_email_to === 'string' ? meta.last_email_to : '') === normalizedSenderEmail && convSubject && convSubject === normalizedInboundSubject) {
        conversationId = conv.id
        tenantId = conv.tenant_id
        matchedBy = 'sender_subject'
        break
      }
    }
  }

  const matchedChannelTest = !conversationId && threadIds.length > 0
    ? (channelTestEvents || []).find((event) => {
        const payload = (event.payload || {}) as Record<string, unknown>
        const messageId = typeof payload.message_id === 'string' ? payload.message_id : null
        const sentTo = typeof payload.to === 'string' ? payload.to : null
        return Boolean(messageId && threadIds.includes(messageId) && sentTo === fromAddr.email)
      })
    : null

  if (matchedChannelTest) matchedBy = 'channel_test'

  const matchedChannelTestBySubject = !conversationId
    ? (channelTestEvents || []).find((event) => {
        const payload = (event.payload || {}) as Record<string, unknown>
        const sentTo = typeof payload.to === 'string' ? payload.to : null
        const sentSubject = typeof payload.subject === 'string' ? normalizeEmailSubject(payload.subject) : null
        return Boolean(sentTo === fromAddr.email && sentSubject && sentSubject === normalizedInboundSubject)
      })
    : null

  if (!conversationId && matchedChannelTestBySubject) matchedBy = 'channel_test'

  if (!conversationId && !matchedChannelTest && !matchedChannelTestBySubject) {
    if (irrelevantReason) {
      await supabase.from('automation_events').insert({
        tenant_id: scopedTenantId,
        event_type: 'email.inbound.skipped',
        entity_type: 'email_message',
        payload: {
          from,
          to,
          subject,
          reason: irrelevantReason,
          sender_email: normalizedSenderEmail,
        },
      })
      return { status: 'skipped', reason: irrelevantReason, tenantId: scopedTenantId }
    }

    if (!inboundContact.leadId && inboundContact.participantConversationIds.length === 0 && !isCommonHumanMailbox(normalizedSenderEmail)) {
      await supabase.from('automation_events').insert({
        tenant_id: scopedTenantId,
        event_type: 'email.inbound.skipped',
        entity_type: 'email_message',
        payload: {
          from,
          to,
          subject,
          reason: 'Irrelevant inbox email: unknown sender is not a direct human mailbox',
          sender_email: normalizedSenderEmail,
        },
      })
      return { status: 'skipped', reason: 'Irrelevant inbox email: unknown sender is not a direct human mailbox', tenantId: scopedTenantId }
    }

    matchedBy = null
  }

  // If no matching conversation found, create a new one
  let isNewConversation = false
  if (!conversationId) {
    tenantId = scopedTenantId

    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        lead_id: inboundContact.leadId,
        subject: subject || '(sin asunto)',
        channel: 'email',
        status: 'open',
        metadata: {
          email_thread_id: subject || '',
          last_email_to: fromAddr.email,
          email_thread_source: matchedChannelTest || matchedChannelTestBySubject
            ? 'channel_test'
            : 'new_inbound',
        },
      })
      .select()
      .single()

    if (convError) return { status: 'failed', reason: convError.message, tenantId }

    conversationId = newConv.id
    isNewConversation = true
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'email.inbound.match.debug',
    entity_type: 'email_message',
    payload: {
      from,
      to,
      subject,
      normalized_subject: normalizedInboundSubject,
      message_id: message_id || null,
      in_reply_to: in_reply_to || null,
      references: references || [],
      thread_ids: threadIds,
      matched_by: matchedBy,
      conversation_id: conversationId,
      created_new_conversation: isNewConversation,
    },
  })

  const content = text || html || '(email sin contenido)'
  const emailMeta: EmailMetadata = {
    email_from: from,
    email_to: to,
    email_subject: subject,
    email_message_id: message_id,
    email_in_reply_to: in_reply_to,
    email_references: references,
  }

  const { data: insertedInbound, error: msgError } = await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    tenant_id: tenantId,
    direction: 'inbound',
    channel: 'email',
    status: 'delivered',
    content,
    is_automated: false,
    metadata: emailMeta,
  }).select('id').single()

  if (msgError) return { status: 'failed', reason: msgError.message, tenantId }

  if (isNewConversation && normalizedSenderEmail) {
    await supabase.from('conversation_participants').insert({
      conversation_id: conversationId,
      contact_name: fromAddr.name || null,
      contact_email: normalizedSenderEmail,
      role: 'contact',
    })
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'email.inbound.received',
    entity_type: 'conversation',
    entity_id: conversationId,
    payload: { from, subject, message_id, matched_by: matchedBy || (matchedChannelTest ? 'channel_test' : null) },
  })

  if (isNewConversation) {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'email.thread.created',
      entity_type: 'conversation',
      entity_id: conversationId,
      payload: { from, subject, message_id },
    })
  } else if (in_reply_to || message_id) {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'email.thread.matched',
      entity_type: 'conversation',
      entity_id: conversationId,
      payload: { in_reply_to, message_id, matched_by: matchedBy || (matchedChannelTest ? 'channel_test' : null) },
    })
  }

  try {
    await sendEmailAiReplyByMessageId({
      supabase,
      tenantId: tenantId!,
      messageId: insertedInbound.id,
      mode: 'email_auto',
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'auto_reply_failed'
    const eventType = reason.includes('no es seguro') || reason.includes('ya tiene una respuesta') || reason.includes('clasificacion marco')
      ? 'email.ai_reply.skipped'
      : 'email.ai_reply.failed'

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: eventType,
      entity_type: 'conversation',
      entity_id: conversationId,
      payload: {
        based_on_message_id: message_id,
        mode: 'email_auto',
        reason,
      },
    })
    console.error('[email auto-reply] skipped/failed', {
      conversationId,
      tenantId,
      messageId: message_id,
      reason,
    })
  }

  return { status: 'ok', conversationId, tenantId, isNewConversation }
}

export async function sendWhatsAppFromConversationAction(formData: FormData) {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  const conversationId = String(formData.get('conversationId') || '')
  const to = String(formData.get('to') || '').trim()
  const content = String(formData.get('content') || '').trim()
  const tenantTemplateId = formData.get('tenantTemplateId') ? String(formData.get('tenantTemplateId')) : null
  const templateId = formData.get('templateId') ? String(formData.get('templateId')) : null
  const templateParams = formData.get('templateParams') ? JSON.parse(String(formData.get('templateParams'))) : []
  const normalizedTo = normalizeWhatsAppRecipient(to)
  const resolvedSource = formData.get('resolvedSource') ? String(formData.get('resolvedSource')) : null

  if (!conversationId || !to || (!content && !tenantTemplateId)) throw new Error('conversationId, to y content son obligatorios')

  const phoneValidation = validateWhatsAppNumber(to)
  if (!phoneValidation.valid) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, channel, metadata, subject, lead_id')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single()

    const convMeta = conv?.metadata || {}
    
    await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: 'whatsapp',
      status: 'failed',
      content,
      is_automated: false,
      metadata: {
        whatsapp_from: 'noreply',
        whatsapp_to: normalizedTo,
        whatsapp_delivery_status: 'failed',
        whatsapp_delivery_error: phoneValidation.error,
        whatsapp_validation_failed: true,
        reply_type: 'human',
        whatsapp_resolved_to: normalizedTo,
        whatsapp_resolved_source: (resolvedSource as 'metadata.last_whatsapp_to' | 'metadata.contact_phone' | 'lead.contact_phone' | null),
      },
    })

    await supabase
      .from('conversations')
      .update({
        metadata: { ...convMeta, last_whatsapp_error: phoneValidation.error },
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'whatsapp.outbound.failed',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: {
        to,
        normalized_to: normalizedTo,
        provider: 'none',
        reason: phoneValidation.error,
        validation_failed: true,
      },
    })

    console.error('[whatsapp outbound] Validation failed', { conversationId, to, normalizedTo, error: phoneValidation.error })
    revalidatePath('/conversations')
    throw new Error(phoneValidation.error || 'Número de teléfono inválido')
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, channel, metadata, subject, lead_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single()

  if (!conv) throw new Error('Conversación no encontrada')

  let contactLocale: string | null = null
  if (conv.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('preferred_language, locale')
      .eq('id', conv.lead_id)
      .eq('tenant_id', tenantId)
      .single()
    if (lead) {
      contactLocale = lead.preferred_language || lead.locale || null
    }
  }
  if (!contactLocale) {
    const convMetaLocale = (conv.metadata as Record<string, unknown>)?.whatsapp_locale as string | null
    if (convMetaLocale) contactLocale = convMetaLocale
  }

  // PRIORITY: Check DB config first, fallback to env vars
  const dbConfigResponse = await supabase
    .from('tenant_whatsapp_configs')
    .select('phone_number_id, access_token_encrypted, mode, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  let deliveryConfig = detectWhatsAppDeliveryConfig(process.env)
  let configSource: 'db_config' | 'env_fallback' = 'env_fallback'

  const channelMode = dbConfigResponse?.data?.mode || 'sandbox'

if (dbConfigResponse?.data?.phone_number_id && dbConfigResponse.data.access_token_encrypted) {
    deliveryConfig = {
      provider: 'meta_cloud',
      configured: true,
      meta: {
        token: dbConfigResponse.data.access_token_encrypted,
        phoneNumberId: dbConfigResponse.data.phone_number_id,
      },
    }
    configSource = 'db_config'
    console.info('[whatsapp outbound] Using DB config', { phoneNumberId: dbConfigResponse.data.phone_number_id, mode: channelMode })
  } else {
    console.info('[whatsapp outbound] Falling back to env config', { configured: deliveryConfig.configured })
  }

  const { data: latestInbound } = await supabase
    .from('conversation_messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastInboundAt = latestInbound?.created_at ? new Date(latestInbound.created_at).getTime() : null
  const hasOpenCustomerCareWindow = lastInboundAt ? (Date.now() - lastInboundAt) < 24 * 60 * 60 * 1000 : false
  const convMeta = (conv.metadata || {}) as Record<string, unknown>

  const whatsappMeta: WhatsAppMetadata = {
    whatsapp_from: 'noreply',
    whatsapp_to: normalizedTo,
    whatsapp_phone_number_id: deliveryConfig.meta?.phoneNumberId,
    whatsapp_delivery_provider: deliveryConfig.provider,
    whatsapp_config_source: configSource,
    reply_type: 'human',
    whatsapp_resolved_to: normalizedTo,
    whatsapp_resolved_source: (resolvedSource as 'metadata.last_whatsapp_to' | 'metadata.contact_phone' | 'lead.contact_phone' | null),
  }

  if (!deliveryConfig.configured) {
    const failureReason = 'El proveedor de WhatsApp saliente no esta configurado en el servidor.'

    const { error } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: 'whatsapp',
      status: 'failed',
      content,
      is_automated: false,
      metadata: {
        ...whatsappMeta,
        reply_type: 'human',
        whatsapp_delivery_status: 'failed',
        whatsapp_delivery_error: failureReason,
      },
    })

    if (error) throw new Error(error.message)

    const metaUpdate: Record<string, unknown> = { ...convMeta }
    if (error) {
      metaUpdate.last_whatsapp_error = failureReason
    }
    
    await supabase
      .from('conversations')
      .update({ metadata: metaUpdate })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'whatsapp.outbound.failed',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: {
        to,
        normalized_to: normalizedTo,
        template_id: templateId,
        provider: deliveryConfig.provider,
        reason: failureReason,
        detail: deliveryConfig.reason,
      },
    })

    console.error('[conversations] whatsapp outbound blocked: provider not configured', {
      conversationId,
      to,
      provider: deliveryConfig.provider,
      detail: deliveryConfig.reason,
    })

    revalidatePath('/conversations')
    throw new Error(`${failureReason} Configura WHATSAPP_BUSINESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID.`)
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'whatsapp.outbound.created',
    entity_type: 'conversation',
    entity_id: conversationId,
    actor_user_id: user?.id,
    payload: {
      to,
      normalized_to: normalizedTo,
      template_id: templateId,
      provider: deliveryConfig.provider,
      customer_care_window_open: hasOpenCustomerCareWindow,
      configSource,
    },
  })

  const RESTRICTION_PATTERNS = [
    '24 hour', '24-hour', 'outside the 24',
    'customer care', ' session ', 'messaging limit',
  ]

  function is24hRestriction(error: string | undefined) {
    if (!error) return false
    const lower = error.toLowerCase()
    return RESTRICTION_PATTERNS.some((p) => lower.includes(p))
  }

  const useTemplate = content.startsWith('[TEMPLATE]')
  const cleanContent = useTemplate ? content.replace('[TEMPLATE]', '').trim() : content
  
  let templateName: string | undefined
  let dynamicTplParams: string[] = []
  let templateLanguageCode: string | undefined
  let loggedContent = content
  let selectedTenantTemplate: ReturnType<typeof buildTemplatePayload> | null = null

  let resolverMeta: {
    template_key_base: string | null
    locale_requested: string | null
    locale_resolved: string | null
    used_fallback: boolean | null
    fallback_reason: string | null
  } | null = null

  if (tenantTemplateId) {
    const { data: tenantTemplate, error: tenantTemplateError } = await supabase
      .from('tenant_whatsapp_templates')
      .select('id, tenant_id, provider, template_key, meta_template_name, locale, language_code, category, status, meta_status, meta_template_id, body_text, header_text, footer_text, variables_count, variables_schema, last_synced_at, rejection_reason, last_error, is_active, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('id', tenantTemplateId)
      .single()

    if (tenantTemplateError || !tenantTemplate) {
      throw new Error('La plantilla seleccionada no existe en este tenant.')
    }

    selectedTenantTemplate = buildTemplatePayload(tenantTemplate as TenantWhatsAppTemplateRow)
    if (!selectedTenantTemplate.is_active || selectedTenantTemplate.status === 'archived') {
      throw new Error('La plantilla seleccionada está archivada y no se puede usar.')
    }
    if (!selectedTenantTemplate.usable) {
      const rejectionText = selectedTenantTemplate.rejection_reason ? ` Motivo: ${selectedTenantTemplate.rejection_reason}` : ''
      throw new Error(`La plantilla ${selectedTenantTemplate.template_key} no está aprobada en Meta y no es usable.${rejectionText}`)
    }

    if ((templateParams as string[]).length < selectedTenantTemplate.variables_count) {
      throw new Error(`La plantilla ${selectedTenantTemplate.template_key} requiere ${selectedTenantTemplate.variables_count} parámetros.`)
    }

    templateName = selectedTenantTemplate.meta_template_name
    templateLanguageCode = selectedTenantTemplate.language_code
    loggedContent = renderTemplatePreview(selectedTenantTemplate.body_text, templateParams as string[])
  }
  
  if (!selectedTenantTemplate && templateId) {
    const tpl = WHATSAPP_TEMPLATES.find(t => t.id === templateId)
    templateName = tpl?.name
  } else if (!selectedTenantTemplate && useTemplate) {
    const templateCommand = cleanContent.startsWith('|') ? cleanContent.slice(1).trim() : cleanContent
    const parts = templateCommand.split('|')
    templateName = parts[0]?.trim() || undefined
    dynamicTplParams = parts.slice(1).map(p => p.trim())
  }

  if (!selectedTenantTemplate && templateName) {
    templateName = getTemplateByName(templateName)?.name || templateName
  }
  
  const params = (templateParams as string[])?.length > 0 ? (templateParams as string[]) : dynamicTplParams
  if (!selectedTenantTemplate && templateName) {
    templateLanguageCode = useTemplate || templateId ? 'es' : undefined
    loggedContent = templateName && content ? content : cleanContent
  }

  if (!templateName && !hasOpenCustomerCareWindow) {
    const failureReason = 'Meta no permite enviar texto libre fuera de la ventana de 24 horas. Usa una plantilla aprobada para iniciar o reabrir la conversación.'

    const { error } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_user_id: user?.id,
      direction: 'outbound',
      channel: 'whatsapp',
      status: 'failed',
      content,
      is_automated: false,
      metadata: {
        ...whatsappMeta,
        reply_type: 'human',
        whatsapp_delivery_sent_type: 'text',
        whatsapp_delivery_status: 'failed',
        whatsapp_delivery_error: failureReason,
        whatsapp_delivery_sandbox: channelMode === 'sandbox',
        whatsapp_delivery_template_fallback: false,
        whatsapp_message_type: 'text',
      },
    })

    if (error) throw new Error(error.message)

    await supabase
      .from('conversations')
      .update({ metadata: { ...convMeta, last_whatsapp_error: failureReason } })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'whatsapp.outbound.failed',
      entity_type: 'conversation',
      entity_id: conversationId,
      actor_user_id: user?.id,
      payload: {
        to,
        normalized_to: normalizedTo,
        template_id: null,
        provider: deliveryConfig.provider,
        reason: failureReason,
        customer_care_window_open: false,
        sandbox: channelMode === 'sandbox',
      },
    })

    revalidatePath('/conversations')
    throw new Error(failureReason)
  }

  // Resolve locale-aware template name for base template keys (lead_bienvenida, visita_confirmacion, etc.)
  const effectiveLocale = contactLocale || templateLanguageCode || 'es'
  if (!selectedTenantTemplate && templateName) {
    const knownBaseKeys = ['lead_bienvenida', 'visita_confirmacion', 'lead_reactivacion']
    const matchedBaseKey = knownBaseKeys.find(k => templateName?.startsWith(k))
    if (matchedBaseKey) {
      const resolved = resolveTemplateByKeyAndLocale(matchedBaseKey, effectiveLocale)
      if (resolved) {
        templateName = resolved.templateName
        templateLanguageCode = resolved.localeCode
        resolverMeta = {
          template_key_base: matchedBaseKey,
          locale_requested: resolved.localeRequested,
          locale_resolved: resolved.localeCode,
          used_fallback: resolved.usedFallback,
          fallback_reason: resolved.fallbackReason || null,
        }
      }
    }
  }
  
  let result: WhatsAppOutboundResult = await sendWhatsAppViaMeta({
    config: deliveryConfig.meta!,
    to: normalizedTo,
    text: templateName ? cleanContent || loggedContent : content,
    templateName,
    templateParams: params.length > 0 ? params : undefined,
    templateLanguageCode,
  })

  let fallback24hAttempted = false

  if (result.status === 'failed' && !hasOpenCustomerCareWindow && is24hRestriction(result.error || result.reason)) {
    const templateObj = templateId
      ? WHATSAPP_TEMPLATES.find((t) => t.id === templateId)
      : WHATSAPP_TEMPLATES.find((t) => t.id === 'wa_greeting')

    const fallbackTemplate = templateObj?.name || 'saludo_seguimiento'

    result = await sendWhatsAppViaMeta({
      config: deliveryConfig.meta!,
      to: normalizedTo,
      text: loggedContent,
      templateName: fallbackTemplate,
      templateParams: params.length > 0 ? params : undefined,
    })
    fallback24hAttempted = true
  }

  const finalStatus = result.status === 'sent' ? 'sent' : 'failed'

  const rawError = result.status === 'failed' ? (result.error || result.reason || 'WhatsApp send failed') : undefined
  const is24hFallback = fallback24hAttempted || (hasOpenCustomerCareWindow === false && is24hRestriction(rawError))

  const { error } = await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    tenant_id: tenantId,
    sender_user_id: user?.id,
    direction: 'outbound',
    channel: 'whatsapp',
    status: finalStatus,
    content: loggedContent,
    is_automated: false,
    metadata: {
      ...whatsappMeta,
      reply_type: 'human',
      whatsapp_delivery_sent_type: result.message_type,
      whatsapp_delivery_status: result.status === 'sent' ? 'accepted' : result.status,
      whatsapp_delivery_error: rawError,
      whatsapp_delivery_sandbox: channelMode === 'sandbox',
      whatsapp_delivery_template_fallback: is24hFallback,
      whatsapp_provider_message_id: result.provider_message_id,
      whatsapp_message_type: result.message_type,
      whatsapp_template_name: result.template_name,
      whatsapp_template_key: selectedTenantTemplate?.template_key,
      whatsapp_locale_requested: contactLocale,
      whatsapp_locale_resolved: resolverMeta?.locale_resolved || templateLanguageCode || null,
      whatsapp_locale_used_fallback: resolverMeta?.used_fallback || null,
      whatsapp_locale_fallback_reason: resolverMeta?.fallback_reason || null,
      whatsapp_template_key_base: resolverMeta?.template_key_base || null,
    },
  })

  if (error) throw new Error(error.message)

  const metadataUpdate: Record<string, unknown> = {
      ...convMeta,
      whatsapp_provider_message_id: result.provider_message_id || convMeta.whatsapp_provider_message_id,
    }
    
    if (result.status === 'sent') {
      metadataUpdate.last_whatsapp_to = normalizedTo
    }
    if (rawError) {
      metadataUpdate.last_whatsapp_error = rawError
    }
    
    await supabase
    .from('conversations')
    .update({ metadata: metadataUpdate })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: result.status === 'sent' ? 'whatsapp.outbound.sent' : 'whatsapp.outbound.failed',
    entity_type: 'conversation',
    entity_id: conversationId,
    actor_user_id: user?.id,
    payload: {
      to,
      normalized_to: normalizedTo,
      template_id: tenantTemplateId || templateId,
      template_name: result.template_name,
      template_key_base: resolverMeta?.template_key_base || null,
      locale_requested: resolverMeta?.locale_requested || contactLocale || null,
      locale_resolved: resolverMeta?.locale_resolved || null,
      used_fallback: resolverMeta?.used_fallback || null,
      fallback_reason: resolverMeta?.fallback_reason || null,
      status: result.status,
      provider: deliveryConfig.provider,
      customer_care_window_open: hasOpenCustomerCareWindow,
      provider_message_id: result.provider_message_id,
      reason: result.reason,
      error: result.error,
      sandbox: !hasOpenCustomerCareWindow,
      is_24h_fallback: is24hFallback,
    },
  })

  if (result.status === 'failed') {
    const userError = rawError || 'WhatsApp send failed'
    console.error('[conversations] whatsapp outbound failed', {
      conversationId,
      to,
      normalizedTo,
      provider: deliveryConfig.provider,
      messageType: result.message_type,
      error: result.error,
      reason: result.reason,
      sandbox: !hasOpenCustomerCareWindow,
      is24hFallback,
    })
    revalidatePath('/conversations')
    throw new Error(userError)
  }

  revalidatePath('/conversations')
  return { status: result.status, reason: result.reason }
}

export async function getWhatsAppTemplatesAction() {
  const supabase = await createClient()
  const tenantId = await getTenantId()
  const { data: { user } } = await supabase.auth.getUser()
  await ensureTenantWhatsAppTemplateSeed({ supabase, tenantId, userId: user?.id || null })

  const templates = await getTenantWhatsAppTemplatesForUi(supabase, tenantId)
  return templates.map((template) => ({
    id: template.id,
    base_template_key: template.template_key.replace(/_(es|en|it)$/i, ''),
    template_key: template.template_key,
    name: template.meta_template_name,
    language: template.language_code,
    category: template.category,
    params_required: template.variables_count,
    variables_schema: template.variables_schema,
    body_text: template.body_text,
    status: template.status,
    meta_status: template.meta_status,
    usable: template.usable,
    rejection_reason: template.rejection_reason,
  }))
}

export async function renderWhatsAppTemplateAction(formData: FormData) {
  const templateId = String(formData.get('templateId') || '')
  const tenantTemplateId = String(formData.get('tenantTemplateId') || '')
  const paramsStr = String(formData.get('params') || '[]')

  try {
    const params = JSON.parse(paramsStr) as string[]
    if (tenantTemplateId) {
      const supabase = await createClient()
      const tenantId = await getTenantId()
      const { data, error } = await supabase
        .from('tenant_whatsapp_templates')
        .select('body_text')
        .eq('tenant_id', tenantId)
        .eq('id', tenantTemplateId)
        .single()

      if (error || !data) return { error: 'Template not found or insufficient params' }
      return { text: renderTemplatePreview(data.body_text, params) }
    }

    const rendered = renderTemplate(templateId, params)
    if (!rendered) {
      return { error: 'Template not found or insufficient params' }
    }
    return { text: rendered }
  } catch {
    return { error: 'Invalid params format' }
  }
}

export async function processAutomationEventAction(data: {
  eventType: string
  entity_type?: string
  entity_id?: string
  tenant_id?: string
  payload?: Record<string, unknown>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let tenantId = data.tenant_id
  if (!tenantId && user) {
    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (profile) tenantId = profile.tenant_id
  }

  if (!tenantId) {
    return { status: 'skipped', reason: 'No tenant found' }
  }

  // Check if tenant is suspended
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, status')
    .eq('id', tenantId)
    .single()

  if (!tenant) return { status: 'skipped', reason: 'Tenant not found' }

  // Handle tenant.suspended
  if (data.eventType === 'tenant.suspended') {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'tenant.automation.blocked',
      entity_type: 'tenant',
      entity_id: tenantId,
      actor_user_id: user?.id,
      payload: { reason: 'Tenant suspended, automation blocked' },
    })
    return { status: 'blocked', reason: 'Tenant suspended' }
  }

  // Handle tenant.reactivated
  if (data.eventType === 'tenant.reactivated') {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'tenant.automation.resumed',
      entity_type: 'tenant',
      entity_id: tenantId,
      actor_user_id: user?.id,
      payload: { reason: 'Tenant reactivated, automation resumed' },
    })
    return { status: 'resumed' }
  }

  // If tenant is suspended, block non-essential automation
  if (tenant.status === 'suspended') {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'tenant.automation.blocked',
      entity_type: data.entity_type || 'unknown',
      entity_id: data.entity_id,
      actor_user_id: user?.id,
      payload: { event_type: data.eventType, reason: 'Tenant suspended' },
    })
    return { status: 'blocked', reason: 'Tenant suspended' }
  }

  // Find matching rule template
  const template = getRuleTemplate(data.eventType)

  if (!template) {
    return { status: 'no_rule', reason: 'No matching automation rule' }
  }

  // Execute the action
  let executionStatus: 'success' | 'failed' = 'success'
  let errorMessage: string | null = null
  const actionPayload: Record<string, unknown> = { ...data.payload }

  try {
    switch (template.action_type) {
      case 'create_followup': {
        await supabase.from('tasks').insert({
          tenant_id: tenantId,
          user_id: user?.id,
          lead_id: data.entity_type === 'lead' ? data.entity_id : null,
          title: `Follow-up: ${data.eventType}`,
          description: `Auto-generated follow-up for ${data.eventType}`,
          priority: (template.config.priority as string) || 'medium',
          due_date: new Date(Date.now() + ((template.config.followup_hours || 24) as number) * 60 * 60 * 1000).toISOString(),
          completed: false,
        })
        actionPayload.followup_created = true
        break
      }
      case 'create_reminder': {
        await supabase.from('tasks').insert({
          tenant_id: tenantId,
          user_id: user?.id,
          lead_id: data.entity_type === 'lead' ? data.entity_id : null,
          title: `Reminder: ${data.eventType}`,
          description: `Auto-generated reminder for ${data.eventType}`,
          priority: 'medium',
          due_date: new Date(Date.now() + ((template.config.reminder_hours_before || 24) as number) * 60 * 60 * 1000).toISOString(),
          completed: false,
        })
        actionPayload.reminder_created = true
        break
      }
      case 'create_notification': {
        await supabase.from('notifications').insert({
          tenant_id: tenantId,
          user_id: user?.id,
          type: data.eventType,
          title: template.name,
          message: template.description || '',
          data: actionPayload,
        })
        actionPayload.notification_created = true
        break
      }
      case 'mark_for_review': {
        if (data.entity_type === 'conversation' && data.entity_id) {
          await supabase
            .from('conversations')
            .update({ status: 'waiting' })
            .eq('id', data.entity_id)
            .eq('tenant_id', tenantId)
        }
        actionPayload.marked_for_review = true
        break
      }
      case 'create_task': {
        await supabase.from('tasks').insert({
          tenant_id: tenantId,
          user_id: user?.id,
          title: `Task: ${data.eventType}`,
          description: template.description || '',
          priority: 'medium',
          completed: false,
        })
        actionPayload.task_created = true
        break
      }
      default:
        executionStatus = 'failed'
        errorMessage = `Unknown action type: ${template.action_type}`
    }
  } catch (err) {
    executionStatus = 'failed'
    errorMessage = err instanceof Error ? err.message : 'Unknown error'
  }

  // Record execution
  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: executionStatus === 'success' ? 'automation.rule.executed' : 'automation.rule.failed',
    entity_type: data.entity_type || template.trigger_event,
    entity_id: data.entity_id,
    actor_user_id: user?.id,
    payload: {
      rule_id: template.id,
      action_type: template.action_type,
      status: executionStatus,
      ...actionPayload,
    },
  })

  // Record specific events
  if (template.action_type === 'create_followup' && executionStatus === 'success') {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'followup.created',
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      actor_user_id: user?.id,
      payload: { rule_id: template.id, ...actionPayload },
    })
  }

  if (template.action_type === 'create_reminder' && executionStatus === 'success') {
    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'reminder.created',
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      actor_user_id: user?.id,
      payload: { rule_id: template.id, ...actionPayload },
    })
  }

  revalidatePath('/automations')
  return {
    status: executionStatus,
    rule_id: template.id,
    action_type: template.action_type,
    error: errorMessage,
  }
}

export async function getAutomationRulesAction() {
  return RULE_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    trigger_event: t.trigger_event,
    action_type: t.action_type,
    is_active: true,
  }))
}

export async function getAutomationExecutionsAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) return []

  const { data: events } = await supabase
    .from('automation_events')
    .select('id, event_type, entity_type, entity_id, payload, created_at')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })
    .limit(50)

  return events || []
}

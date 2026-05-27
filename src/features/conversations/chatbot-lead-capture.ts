import type { SupabaseClient } from '@supabase/supabase-js'
import {
  detectFinancingIntent,
  detectHumanContactIntent,
  detectSellerIntent,
  hasUsefulChatbotCriteria,
  type ChatbotSearchCriteria,
} from './chatbot-engine'
import type { DecisionType, IntentType } from './intent-types'

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'visit' | 'negotiation' | 'won' | 'lost'

type CaptureDecision = 'no_op' | 'suggest_capture' | 'create_lead' | 'update_lead'

interface ChatbotLeadRecord {
  id: string
  tenant_id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  source: string | null
  budget_min: number | null
  budget_max: number | null
  preferred_location: string | null
  preferred_type: string | null
  notes: string | null
  status: LeadStatus
  assigned_to: string | null
  created_by: string | null
  metadata: Record<string, unknown> | null
}

interface LeadContactData {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
}

interface CommercialContext {
  lead_intent: 'buy' | 'rent' | 'sell' | 'unknown'
  interest_kind: 'buyer' | 'seller' | 'unknown'
  property_type: string | null
  location_label: string | null
  city: string | null
  search_area: string | null
  budget_min: number | null
  budget_max: number | null
  rooms: number | null
  bathrooms: number | null
  logistic_criteria: string[]
  financing_requested: boolean
  human_followup_requested: boolean
  visit_requested: boolean
  selected_property_id: string | null
  selected_property_title: string | null
  selected_property_city: string | null
  raw_context: string | null
  summary: string
  suggested_next_action: string | null
}

interface LeadCaptureResult {
  leadId: string | null
  decision: CaptureDecision
  reason: string
  matchedBy: 'conversation_link' | 'email' | 'phone' | 'none'
  fieldsTouched: string[]
  metadataPatch: Record<string, unknown>
  commercialContext: CommercialContext
  contactData: LeadContactData
}

interface UpsertChatbotLeadCaptureArgs {
  supabase: SupabaseClient
  tenantId: string
  conversationId: string
  conversationLeadId: string | null
  conversationMetadata: Record<string, unknown>
  messageText: string
  visitorName?: string | null
  visitorEmail?: string | null
  criteria: ChatbotSearchCriteria
  intent: IntentType
  decision: DecisionType
  confidence: number
  selectedProperty?: {
    id: string
    title: string
    city: string | null
  } | null
  replyType: string
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.replace(/[^\d+]/g, '').trim()
  return normalized || null
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function extractEmail(text: string, fallback?: string | null): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match?.[0]?.trim() || fallback || null
}

function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)
  return normalizePhone(match?.[0] || null)
}

function extractName(text: string, fallback?: string | null): { firstName: string | null; lastName: string | null } {
  if (fallback?.trim()) {
    const parts = fallback.trim().split(/\s+/)
    return {
      firstName: parts[0] || null,
      lastName: parts.slice(1).join(' ') || null,
    }
  }

  const patterns = [
    /(?:mi nombre es|me llamo|soy)\s+([a-zA-ZÁÉÍÓÚÜÑáéíóúüñ' -]{2,60})/i,
    /(?:my name is|i am)\s+([a-zA-Z' -]{2,60})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const fullName = match?.[1]?.split(/\s+(?:y|and|con|with|mi|my|whatsapp|telefono|tel|email|correo)\b/i)[0]?.trim()
    if (!fullName) continue
    const parts = fullName.split(/\s+/)
    return {
      firstName: parts[0] || null,
      lastName: parts.slice(1).join(' ') || null,
    }
  }

  return { firstName: null, lastName: null }
}

function inferLeadIntent(criteria: ChatbotSearchCriteria, sellerIntent: boolean): CommercialContext['lead_intent'] {
  if (sellerIntent) return 'sell'
  if (criteria.operation === 'sale') return 'buy'
  if (criteria.operation === 'rent') return 'rent'
  return 'unknown'
}

function inferPropertyType(text: string, criteria: ChatbotSearchCriteria, sellerIntent: boolean): string | null {
  if (criteria.property_type) return criteria.property_type
  const normalized = normalizeText(text)
  if (/\b(piso|apartamento|apartment|flat)\b/.test(normalized)) return 'apartment'
  if (/\b(casa|house|chalet|villa)\b/.test(normalized)) return 'house'
  if (/\b(atico|ático|penthouse)\b/.test(normalized)) return 'penthouse'
  if (/\b(local|commercial|comercial|office|oficina)\b/.test(normalized)) return 'commercial'
  if (/\b(terreno|solar|land)\b/.test(normalized)) return 'land'
  return sellerIntent ? 'other' : null
}

function inferLocationLabel(criteria: ChatbotSearchCriteria): string | null {
  const pieces = dedupeStrings([
    criteria.search_area,
    criteria.subzone,
    criteria.city,
    criteria.landmark,
  ])
  return pieces.length > 0 ? pieces.join(', ') : null
}

function inferVisitIntent(text: string, selectedProperty?: { id: string; title: string; city: string | null } | null): boolean {
  const normalized = normalizeText(text)
  if (/\b(visita|visitar|cita|quiero ver|ver esta propiedad|ver este piso|schedule|visit|appointment)\b/.test(normalized)) return true
  return Boolean(selectedProperty && /\b(esta propiedad|este piso|this property|questa proprieta)\b/.test(normalized))
}

function buildSuggestedNextAction(
  context: Omit<CommercialContext, 'summary' | 'suggested_next_action'>,
  hasContact: boolean
): string | null {
  if (context.human_followup_requested) return 'human_followup'
  if (context.visit_requested) return 'schedule_visit'
  if (context.interest_kind === 'seller') return 'seller_valuation_followup'
  if (context.financing_requested) return 'financing_orientation_followup'
  if (!hasContact) return 'request_contact_details'
  if (context.lead_intent === 'buy' || context.lead_intent === 'rent') return 'continue_lead_qualification'
  return null
}

function buildCommercialSummary(context: Omit<CommercialContext, 'summary' | 'suggested_next_action'>): string {
  const parts: string[] = []
  if (context.interest_kind === 'seller') parts.push('captacion de propietario')
  else if (context.lead_intent === 'buy') parts.push('busqueda de compra')
  else if (context.lead_intent === 'rent') parts.push('busqueda de alquiler')
  if (context.property_type) parts.push(`tipo ${context.property_type}`)
  if (context.location_label) parts.push(`zona ${context.location_label}`)
  if (context.budget_max) parts.push(`presupuesto max ${context.budget_max}`)
  if (context.rooms) parts.push(`${context.rooms} hab`)
  if (context.bathrooms) parts.push(`${context.bathrooms} banos`)
  if (context.visit_requested) parts.push('quiere visita')
  if (context.human_followup_requested) parts.push('requiere humano')
  if (context.financing_requested) parts.push('requiere hipoteca')
  if (context.selected_property_title) parts.push(`propiedad ${context.selected_property_title}`)
  return parts.length > 0 ? parts.join(' | ') : 'sin contexto comercial suficiente'
}

function buildCommercialContext(args: {
  text: string
  criteria: ChatbotSearchCriteria
  visitorName?: string | null
  visitorEmail?: string | null
  selectedProperty?: { id: string; title: string; city: string | null } | null
}): { contact: LeadContactData; context: CommercialContext } {
  const sellerIntent = detectSellerIntent(args.text)
  const humanFollowupRequested = detectHumanContactIntent(args.text)
  const financingRequested = detectFinancingIntent(args.text)
  const visitRequested = inferVisitIntent(args.text, args.selectedProperty)
  const name = extractName(args.text, args.visitorName)
  const contact: LeadContactData = {
    firstName: name.firstName,
    lastName: name.lastName,
    email: extractEmail(args.text, args.visitorEmail),
    phone: extractPhone(args.text),
  }

  const baseContext: Omit<CommercialContext, 'summary' | 'suggested_next_action'> = {
    lead_intent: inferLeadIntent(args.criteria, sellerIntent),
    interest_kind: sellerIntent ? 'seller' : args.criteria.operation ? 'buyer' : 'unknown',
    property_type: inferPropertyType(args.text, args.criteria, sellerIntent),
    location_label: inferLocationLabel(args.criteria),
    city: args.criteria.city || null,
    search_area: args.criteria.search_area || null,
    budget_min: toNullableNumber(args.criteria.budget_min),
    budget_max: toNullableNumber(args.criteria.budget_max),
    rooms: toNullableNumber(args.criteria.rooms_min ?? args.criteria.rooms),
    bathrooms: toNullableNumber(args.criteria.bathrooms_min ?? args.criteria.bathrooms),
    logistic_criteria: dedupeStrings([...(args.criteria.logistic_attributes || []), ...(args.criteria.attributes || [])]),
    financing_requested: financingRequested,
    human_followup_requested: humanFollowupRequested,
    visit_requested: visitRequested,
    selected_property_id: args.selectedProperty?.id || null,
    selected_property_title: args.selectedProperty?.title || null,
    selected_property_city: args.selectedProperty?.city || null,
    raw_context: args.criteria.raw_context || null,
  }

  const suggestedNextAction = buildSuggestedNextAction(baseContext, Boolean(contact.email || contact.phone || contact.firstName))
  return {
    contact,
    context: {
      ...baseContext,
      summary: buildCommercialSummary(baseContext),
      suggested_next_action: suggestedNextAction,
    },
  }
}

function hasMinimumCommercialContext(context: CommercialContext, hasContact: boolean): boolean {
  const buyerEnough = (context.lead_intent === 'buy' || context.lead_intent === 'rent')
    && Boolean(context.city || (context.property_type && context.budget_max))
  const sellerEnough = context.lead_intent === 'sell'
    && Boolean(context.location_label || context.city || context.property_type || hasContact)
  const visitEnough = context.visit_requested
    && Boolean(context.selected_property_id || context.city || context.location_label || hasContact)
  const contactPlusInterest = hasContact
    && Boolean(context.lead_intent !== 'unknown' || context.visit_requested || context.interest_kind === 'seller')

  return buyerEnough || sellerEnough || visitEnough || contactPlusInterest
}

function shouldSuggestCapture(context: CommercialContext, hasContact: boolean, criteria: ChatbotSearchCriteria): boolean {
  if (context.human_followup_requested) return true
  if (context.visit_requested) return true
  if (hasContact && !hasMinimumCommercialContext(context, hasContact)) return true
  // No sugerir captura para consultas financieras puras, incluso si mencionan propiedad
  if (context.financing_requested && !context.visit_requested && !context.human_followup_requested && !hasContact) {
    return false
  }
  // Para casos financieros, requerir señales comerciales explícitas además de la mención de propiedad
  if (context.financing_requested) {
    // Solo continuar si hay señales comerciales explícitas más allá de la financiación
    const hasExplicitCommercialSignals = context.visit_requested || context.human_followup_requested || hasContact
    if (!hasExplicitCommercialSignals) {
      return false
    }
  }
  if (context.lead_intent !== 'unknown') return true
  return hasUsefulChatbotCriteria(criteria)
}

function computeLeadStatus(existingStatus: LeadStatus | null, context: CommercialContext, hasMinimumContext: boolean): LeadStatus {
  if (context.visit_requested) return 'visit'
  if (existingStatus && ['negotiation', 'won', 'lost'].includes(existingStatus)) return existingStatus
  if (hasMinimumContext) return 'qualified'
  return existingStatus || 'new'
}

function buildLeadFirstName(contact: LeadContactData, context: CommercialContext): string {
  if (contact.firstName) return contact.firstName
  if (context.interest_kind === 'seller') return 'Propietario'
  if (context.lead_intent === 'buy') return 'Comprador'
  if (context.lead_intent === 'rent') return 'Inquilino'
  return 'Lead chatbot'
}

function buildLeadNotes(existingNotes: string | null, context: CommercialContext): string {
  const base = existingNotes?.trim()
  const machineNote = `[chatbot_capture] ${context.summary}`
  if (!base) return machineNote
  if (base.includes(machineNote)) return base
  return `${base}\n${machineNote}`
}

function computeLeadUpdatePayload(existingLead: ChatbotLeadRecord | null, contact: LeadContactData, context: CommercialContext, conversationId: string): Record<string, unknown> {
  const currentMetadata = (existingLead?.metadata || {}) as Record<string, unknown>
  const hasMinimumContext = hasMinimumCommercialContext(context, Boolean(contact.email || contact.phone || contact.firstName))
  const nextStatus = computeLeadStatus(existingLead?.status || null, context, hasMinimumContext)
  const payload: Record<string, unknown> = {
    first_name: existingLead?.first_name || buildLeadFirstName(contact, context),
    last_name: existingLead?.last_name || contact.lastName,
    email: existingLead?.email || contact.email,
    phone: existingLead?.phone || contact.phone,
    source: existingLead?.source || 'chatbot',
    budget_min: context.budget_min ?? existingLead?.budget_min ?? null,
    budget_max: context.budget_max ?? existingLead?.budget_max ?? null,
    preferred_location: context.location_label ?? existingLead?.preferred_location ?? null,
    preferred_type: context.property_type ?? existingLead?.preferred_type ?? null,
    notes: buildLeadNotes(existingLead?.notes || null, context),
    status: nextStatus,
    metadata: {
      ...currentMetadata,
      chatbot_capture: {
        source: 'chatbot',
        conversation_id: conversationId,
        last_intent: context.lead_intent,
        interest_kind: context.interest_kind,
        last_commercial_context: context,
        last_captured_at: new Date().toISOString(),
        source_channels: dedupeStrings(['chatbot', ...(Array.isArray(currentMetadata.source_channels) ? currentMetadata.source_channels as string[] : [])]),
      },
    },
  }

  if (existingLead?.first_name && contact.firstName && existingLead.first_name === 'Lead chatbot') {
    payload.first_name = contact.firstName
  }

  return payload
}

function diffTouchedFields(existingLead: ChatbotLeadRecord | null, payload: Record<string, unknown>): string[] {
  if (!existingLead) return Object.keys(payload)
  const touched: string[] = []
  for (const [key, value] of Object.entries(payload)) {
    const previous = (existingLead as unknown as Record<string, unknown>)[key]
    if (JSON.stringify(previous) !== JSON.stringify(value)) touched.push(key)
  }
  return touched
}

async function findExistingLead(args: {
  supabase: SupabaseClient
  tenantId: string
  leadId: string | null
  email: string | null
  phone: string | null
}): Promise<{ lead: ChatbotLeadRecord | null; matchedBy: LeadCaptureResult['matchedBy'] }> {
  const select = 'id, tenant_id, first_name, last_name, email, phone, source, budget_min, budget_max, preferred_location, preferred_type, notes, status, assigned_to, created_by, metadata'

  if (args.leadId) {
    const { data } = await args.supabase
      .from('leads')
      .select(select)
      .eq('tenant_id', args.tenantId)
      .eq('id', args.leadId)
      .maybeSingle()
    if (data) return { lead: data as ChatbotLeadRecord, matchedBy: 'conversation_link' }
  }

  if (args.email) {
    const { data } = await args.supabase
      .from('leads')
      .select(select)
      .eq('tenant_id', args.tenantId)
      .eq('email', args.email)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (data?.[0]) return { lead: data[0] as ChatbotLeadRecord, matchedBy: 'email' }
  }

  if (args.phone) {
    const { data } = await args.supabase
      .from('leads')
      .select(select)
      .eq('tenant_id', args.tenantId)
      .eq('phone', args.phone)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (data?.[0]) return { lead: data[0] as ChatbotLeadRecord, matchedBy: 'phone' }
  }

  return { lead: null, matchedBy: 'none' }
}

async function syncConversationContactParticipant(args: {
  supabase: SupabaseClient
  conversationId: string
  contact: LeadContactData
}) {
  if (!args.contact.firstName && !args.contact.email && !args.contact.phone) return
  const contactName = dedupeStrings([args.contact.firstName, args.contact.lastName]).join(' ') || args.contact.firstName || null
  const { data: existing } = await args.supabase
    .from('conversation_participants')
    .select('id, contact_name, contact_email, contact_phone')
    .eq('conversation_id', args.conversationId)
    .eq('role', 'contact')
    .limit(1)

  if (existing?.[0]) {
    await args.supabase
      .from('conversation_participants')
      .update({
        contact_name: existing[0].contact_name || contactName,
        contact_email: existing[0].contact_email || args.contact.email,
        contact_phone: existing[0].contact_phone || args.contact.phone,
      })
      .eq('id', existing[0].id)
  } else {
    await args.supabase.from('conversation_participants').insert({
      conversation_id: args.conversationId,
      contact_name: contactName,
      contact_email: args.contact.email,
      contact_phone: args.contact.phone,
      role: 'contact',
    })
  }
}

async function attachLeadToAppointment(args: {
  supabase: SupabaseClient
  appointmentId: string | null
  leadId: string | null
}) {
  if (!args.appointmentId || !args.leadId) return
  await args.supabase
    .from('appointments')
    .update({ lead_id: args.leadId })
    .eq('id', args.appointmentId)
    .is('lead_id', null)
}

export async function upsertChatbotLeadCapture(args: UpsertChatbotLeadCaptureArgs): Promise<LeadCaptureResult> {
  const { contact, context } = buildCommercialContext({
    text: args.messageText,
    criteria: args.criteria,
    visitorName: args.visitorName,
    visitorEmail: args.visitorEmail,
    selectedProperty: args.selectedProperty,
  })

  await syncConversationContactParticipant({
    supabase: args.supabase,
    conversationId: args.conversationId,
    contact,
  })

  const hasContact = Boolean(contact.firstName || contact.email || contact.phone)
  const minimumContext = hasMinimumCommercialContext(context, hasContact)
  const { lead: existingLead, matchedBy } = await findExistingLead({
    supabase: args.supabase,
    tenantId: args.tenantId,
    leadId: args.conversationLeadId,
    email: contact.email,
    phone: contact.phone,
  })

  let captureDecision: CaptureDecision = 'no_op'
  if (existingLead && (minimumContext || hasContact || context.human_followup_requested || context.visit_requested || context.financing_requested)) {
    captureDecision = 'update_lead'
  } else if (!existingLead && minimumContext) {
    captureDecision = 'create_lead'
  } else if (shouldSuggestCapture(context, hasContact, args.criteria)) {
    captureDecision = 'suggest_capture'
  }

  let leadId = existingLead?.id || null
  let fieldsTouched: string[] = []
  const reason = captureDecision === 'create_lead'
    ? 'Contexto comercial suficiente detectado en chatbot.'
    : captureDecision === 'update_lead'
    ? 'Lead existente enriquecido con nuevo contexto comercial del chatbot.'
    : captureDecision === 'suggest_capture'
    ? 'Hay señal comercial, pero aun no alcanza el umbral minimo para crear un lead nuevo.'
    : 'Sin contexto comercial suficiente para capturar lead sin generar basura.'

  if (captureDecision === 'create_lead' || captureDecision === 'update_lead') {
    const payload = computeLeadUpdatePayload(existingLead, contact, context, args.conversationId)
    fieldsTouched = diffTouchedFields(existingLead, payload)

    if (captureDecision === 'create_lead') {
      const { data: createdLead, error } = await args.supabase
        .from('leads')
        .insert({
          tenant_id: args.tenantId,
          ...payload,
        })
        .select('id')
        .single()

      if (error) throw error
      leadId = createdLead.id
    } else if (existingLead) {
      const { error } = await args.supabase
        .from('leads')
        .update(payload)
        .eq('id', existingLead.id)
        .eq('tenant_id', args.tenantId)

      if (error) throw error
      leadId = existingLead.id
    }
  }

  await attachLeadToAppointment({
    supabase: args.supabase,
    appointmentId: typeof args.conversationMetadata.appointment_id === 'string' ? args.conversationMetadata.appointment_id : null,
    leadId,
  })

  const metadataPatch: Record<string, unknown> = {
    chatbot_last_intent_detected: context.lead_intent,
    chatbot_last_commercial_context: context,
    chatbot_lead_capture: {
      decision: captureDecision,
      reason,
      lead_id: leadId,
      matched_by: matchedBy,
      fields_touched: fieldsTouched,
      extracted_contact: contact,
      extracted_context: context,
      source: 'chatbot',
      intent: args.intent,
      decision_rule: args.decision,
      confidence: args.confidence,
      reply_type: args.replyType,
      updated_at: new Date().toISOString(),
    },
  }

  await args.supabase.from('automation_events').insert({
    tenant_id: args.tenantId,
    event_type: 'lead.capture.evaluated',
    entity_type: 'conversation',
    entity_id: args.conversationId,
    payload: {
      lead_id: leadId,
      capture_decision: captureDecision,
      reason,
      matched_by: matchedBy,
      fields_touched: fieldsTouched,
      human_followup_requested: context.human_followup_requested,
      visit_requested: context.visit_requested,
      financing_requested: context.financing_requested,
      intent: context.lead_intent,
      extracted_context: context,
    },
  })

  if (leadId && captureDecision === 'create_lead') {
    await args.supabase.from('automation_events').insert({
      tenant_id: args.tenantId,
      event_type: 'lead.created.from_chatbot',
      entity_type: 'lead',
      entity_id: leadId,
      payload: {
        conversation_id: args.conversationId,
        fields_touched: fieldsTouched,
        source: 'chatbot',
      },
    })
  }

  if (leadId && captureDecision === 'update_lead') {
    await args.supabase.from('automation_events').insert({
      tenant_id: args.tenantId,
      event_type: 'lead.updated.from_chatbot',
      entity_type: 'lead',
      entity_id: leadId,
      payload: {
        conversation_id: args.conversationId,
        fields_touched: fieldsTouched,
        source: 'chatbot',
      },
    })
  }

  if (leadId) {
    await args.supabase.from('automation_events').insert({
      tenant_id: args.tenantId,
      event_type: 'conversation.lead.linked',
      entity_type: 'conversation',
      entity_id: args.conversationId,
      payload: {
        lead_id: leadId,
        matched_by: matchedBy,
        capture_decision: captureDecision,
      },
    })
  }

  if (context.human_followup_requested) {
    await args.supabase.from('automation_events').insert({
      tenant_id: args.tenantId,
      event_type: 'lead.human_followup.requested',
      entity_type: leadId ? 'lead' : 'conversation',
      entity_id: leadId || args.conversationId,
      payload: {
        conversation_id: args.conversationId,
        lead_id: leadId,
        source: 'chatbot',
      },
    })
  }

  if (context.visit_requested) {
    await args.supabase.from('automation_events').insert({
      tenant_id: args.tenantId,
      event_type: 'lead.visit_interest.detected',
      entity_type: leadId ? 'lead' : 'conversation',
      entity_id: leadId || args.conversationId,
      payload: {
        conversation_id: args.conversationId,
        lead_id: leadId,
        selected_property_id: context.selected_property_id,
        source: 'chatbot',
      },
    })
  }

  return {
    leadId,
    decision: captureDecision,
    reason,
    matchedBy,
    fieldsTouched,
    metadataPatch,
    commercialContext: context,
    contactData: contact,
  }
}

export function evaluateChatbotLeadCaptureRule(args: {
  text: string
  visitorName?: string | null
  visitorEmail?: string | null
  criteria: ChatbotSearchCriteria
  selectedProperty?: { id: string; title: string; city: string | null } | null
}) {
  const { contact, context } = buildCommercialContext(args)
  const hasContact = Boolean(contact.firstName || contact.email || contact.phone)
  const minimumContext = hasMinimumCommercialContext(context, hasContact)
  const suggested = shouldSuggestCapture(context, hasContact, args.criteria)
  return {
    contact,
    context,
    minimumContext,
    suggested,
  }
}

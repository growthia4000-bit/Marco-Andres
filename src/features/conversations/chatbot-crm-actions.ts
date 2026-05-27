import type { SupabaseClient } from '@supabase/supabase-js'

type CrmActionDecision = 'no_op' | 'create_action' | 'update_action'

type ChatbotActionType =
  | 'human_followup_action'
  | 'visit_action'
  | 'seller_valuation_action'
  | 'financing_followup_action'
  | 'buyer_contact_action'

type ChatbotActionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

interface ActionCommercialContext {
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

interface ActionContactData {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
}

interface TaskRecord {
  id: string
  tenant_id: string
  user_id: string
  lead_id: string | null
  property_id: string | null
  conversation_id: string | null
  title: string
  description: string | null
  priority: string | null
  due_date: string | null
  completed: boolean
  completed_at: string | null
  action_type: string | null
  action_status: string | null
  source: string | null
  reason: string | null
  next_step: string | null
  metadata: Record<string, unknown> | null
}

interface UpsertChatbotCrmActionArgs {
  supabase: SupabaseClient
  tenantId: string
  conversationId: string
  leadId: string | null
  leadCaptureDecision: 'no_op' | 'suggest_capture' | 'create_lead' | 'update_lead'
  leadCaptureReason: string
  contactData: ActionContactData
  commercialContext: ActionCommercialContext
  activeFocus?: string | null
}

interface ChatbotCrmActionResult {
  taskId: string | null
  actionType: ChatbotActionType | null
  decision: CrmActionDecision
  reason: string
  fieldsTouched: string[]
  metadataPatch: Record<string, unknown>
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

function hasDirectContact(contactData: ActionContactData) {
  return Boolean(contactData.email || contactData.phone)
}

function resolveActionRule(args: {
  commercialContext: ActionCommercialContext
  contactData: ActionContactData
  activeFocus?: string | null
}): { actionType: ChatbotActionType | null; reason: string } {
  const { commercialContext, contactData, activeFocus } = args

  const hasBuyerIntent = commercialContext.lead_intent === 'buy' || commercialContext.lead_intent === 'rent'
  const hasContact = hasDirectContact(contactData)
  const hasHumanRequest = commercialContext.human_followup_requested

  // ============================================================
  // BUYER CONTACT EXPLÍCITO tiene precedencia sobre human follow-up genérico
  // Si hay intención de compra + datos de contacto, es un lead contactable
  // ============================================================
  if (hasBuyerIntent && hasContact) {
    // Es un lead comercial con contacto directo - priorizar buyer_contact
    // No crear human_followup_action genérico para leads comerciales contactables
    return {
      actionType: 'buyer_contact_action',
      reason: 'Lead comprable/alquilable con datos de contacto. Seguimiento comercial directo.',
    }
  }

  // ============================================================
  // VISITA tiene precedence sobre todo
  // ============================================================
  if (commercialContext.visit_requested) {
    return {
      actionType: 'visit_action',
      reason: 'La conversación detectó intención clara de visita/cita.',
    }
  }

  // ============================================================
  // VENTA/PROPIETARIO tiene precedence
  // ============================================================
  if (commercialContext.interest_kind === 'seller') {
    return {
      actionType: 'seller_valuation_action',
      reason: 'La conversación corresponde a un lead de captación/valoración.',
    }
  }

  // ============================================================
  // FINANCIERO tiene precedence si no hay señales overriding
  // ============================================================
  if (commercialContext.financing_requested || activeFocus === 'financing') {
    if (commercialContext.human_followup_requested || commercialContext.visit_requested) {
      // Las señales override tienen prioridad sobre financiar
    } else {
      return {
        actionType: 'financing_followup_action',
        reason: activeFocus === 'financing' 
          ? 'Conversación en modo financiero sostenido.'
          : 'La conversación solicita orientación financiera básica.',
      }
    }
  }

  // ============================================================
  // HUMAN FOLLOW-UP genérico (solo si no hay buyer intent o contact)
  // Solo para casos donde el usuario pide humano pero NO es lead contactable
  // ============================================================
  if (hasHumanRequest) {
    return {
      actionType: 'human_followup_action',
      reason: 'El usuario pidió atención humana y no es un lead comerciales contactable.',
    }
  }

  // ============================================================
  // Buyer contact sin contacto - pedir datos
  // ============================================================
  if (hasBuyerIntent && !hasContact) {
    return {
      actionType: 'buyer_contact_action',
      reason: 'Hay contexto comercial de compra/alquiler, pero faltan datos de contacto.',
    }
  }
  
  return {
    actionType: null,
    reason: 'La conversación no requiere una acción CRM operativa adicional en este turno.',
  }
}

function buildActionContent(actionType: ChatbotActionType, context: ActionCommercialContext) {
  switch (actionType) {
    case 'human_followup_action':
      return {
        title: 'Seguimiento humano desde chatbot',
        priority: 'high',
        dueHours: 1,
        nextStep: 'Contactar al usuario y continuar la conversación manualmente.',
      }
    case 'visit_action':
      return {
        title: context.selected_property_title
          ? `Gestionar visita: ${context.selected_property_title}`
          : 'Gestionar visita pendiente desde chatbot',
        priority: 'high',
        dueHours: 4,
        nextStep: context.selected_property_title
          ? `Coordinar visita para ${context.selected_property_title}.`
          : 'Confirmar disponibilidad y proponer cita/visita.',
      }
    case 'seller_valuation_action':
      return {
        title: 'Valorar inmueble / captacion desde chatbot',
        priority: 'high',
        dueHours: 24,
        nextStep: 'Solicitar zona, direccion aproximada, metros o precio orientativo para valorar.',
      }
    case 'financing_followup_action':
      return {
        title: 'Seguimiento financiero basico desde chatbot',
        priority: 'medium',
        dueHours: 24,
        nextStep: 'Responder sobre hipoteca basica y pedir presupuesto/cuota objetivo si falta.',
      }
    case 'buyer_contact_action':
      return {
        title: 'Solicitar datos de contacto del lead comprador',
        priority: 'medium',
        dueHours: 12,
        nextStep: 'Pedir telefono o email para continuar el seguimiento comercial.',
      }
  }
}

function buildTaskPayload(args: {
  existingAction?: TaskRecord | null
  assignedUserId: string
  tenantId: string
  conversationId: string
  leadId: string | null
  actionType: ChatbotActionType
  ruleReason: string
  leadCaptureDecision: UpsertChatbotCrmActionArgs['leadCaptureDecision']
  leadCaptureReason: string
  contactData: ActionContactData
  commercialContext: ActionCommercialContext
}) {
  const actionContent = buildActionContent(args.actionType, args.commercialContext)
  const previousMetadata = (args.existingAction?.metadata || {}) as Record<string, unknown>
  const dueDate = args.existingAction?.due_date || new Date(Date.now() + actionContent.dueHours * 60 * 60 * 1000).toISOString()
  const metadata = {
    source: 'chatbot',
    action_type: args.actionType,
    rule_reason: args.ruleReason,
    lead_capture_decision: (previousMetadata.lead_capture_decision as string | undefined) || args.leadCaptureDecision,
    lead_capture_reason: (previousMetadata.lead_capture_reason as string | undefined) || args.leadCaptureReason,
    lead_intent: args.commercialContext.lead_intent,
    interest_kind: args.commercialContext.interest_kind,
    selected_property_id: args.commercialContext.selected_property_id,
    selected_property_title: args.commercialContext.selected_property_title,
    extracted_contact: args.contactData,
    extracted_context: args.commercialContext,
    created_from: 'chatbot_conversation',
    updated_at: typeof previousMetadata.updated_at === 'string' ? previousMetadata.updated_at : new Date().toISOString(),
  }

  return {
    tenant_id: args.tenantId,
    user_id: args.assignedUserId,
    lead_id: args.leadId,
    property_id: args.commercialContext.selected_property_id,
    conversation_id: args.conversationId,
    title: actionContent.title,
    description: args.commercialContext.summary,
    priority: actionContent.priority,
    due_date: dueDate,
    completed: false,
    completed_at: null,
    action_type: args.actionType,
    action_status: 'pending' as ChatbotActionStatus,
    source: 'chatbot',
    reason: args.ruleReason,
    next_step: actionContent.nextStep,
    metadata,
  }
}

function diffTouchedFields(existingTask: TaskRecord | null, payload: Record<string, unknown>) {
  if (!existingTask) return Object.keys(payload)
  const touched: string[] = []
  for (const [key, value] of Object.entries(payload)) {
    const previous = (existingTask as unknown as Record<string, unknown>)[key]
    if (JSON.stringify(previous) !== JSON.stringify(value)) touched.push(key)
  }
  return touched
}

async function resolveAssignedUserId(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, role, created_at, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  if (error) throw error
  const users = data || []
  if (users.length === 0) throw new Error(`No active users found for tenant ${tenantId}`)

  const roleWeight: Record<string, number> = {
    coordinator: 0,
    admin: 1,
    agent: 2,
  }

  users.sort((a, b) => {
    const weightDiff = (roleWeight[a.role] ?? 9) - (roleWeight[b.role] ?? 9)
    if (weightDiff !== 0) return weightDiff
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  return users[0].id
}

async function findExistingOpenAction(args: {
  supabase: SupabaseClient
  tenantId: string
  conversationId: string
  actionType: ChatbotActionType
}) {
  const { data, error } = await args.supabase
    .from('tasks')
    .select('id, tenant_id, user_id, lead_id, property_id, conversation_id, title, description, priority, due_date, completed, completed_at, action_type, action_status, source, reason, next_step, metadata')
    .eq('tenant_id', args.tenantId)
    .eq('conversation_id', args.conversationId)
    .eq('action_type', args.actionType)
    .eq('source', 'chatbot')
    .eq('completed', false)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) throw error
  return (data?.[0] as TaskRecord | undefined) || null
}

export async function upsertChatbotCrmAction(args: UpsertChatbotCrmActionArgs): Promise<ChatbotCrmActionResult> {
  const rule = resolveActionRule({
    commercialContext: args.commercialContext,
    contactData: args.contactData,
    activeFocus: args.activeFocus,
  })

  if (!rule.actionType) {
    const metadataPatch = {
      chatbot_crm_action: {
        decision: 'no_op',
        reason: rule.reason,
        action_type: null,
        task_id: null,
        fields_touched: [],
        updated_at: new Date().toISOString(),
      },
    }

    await args.supabase.from('automation_events').insert({
      tenant_id: args.tenantId,
      event_type: 'crm_action.evaluated',
      entity_type: 'conversation',
      entity_id: args.conversationId,
      payload: {
        decision: 'no_op',
        action_type: null,
        conversation_id: args.conversationId,
        lead_id: args.leadId,
        reason: rule.reason,
      },
    })

    return {
      taskId: null,
      actionType: null,
      decision: 'no_op',
      reason: rule.reason,
      fieldsTouched: [],
      metadataPatch,
    }
  }

  const existingAction = await findExistingOpenAction({
    supabase: args.supabase,
    tenantId: args.tenantId,
    conversationId: args.conversationId,
    actionType: rule.actionType,
  })
  const assignedUserId = existingAction?.user_id || await resolveAssignedUserId(args.supabase, args.tenantId)
  const payload = buildTaskPayload({
    existingAction,
    assignedUserId,
    tenantId: args.tenantId,
    conversationId: args.conversationId,
    leadId: args.leadId,
    actionType: rule.actionType,
    ruleReason: rule.reason,
    leadCaptureDecision: args.leadCaptureDecision,
    leadCaptureReason: args.leadCaptureReason,
    contactData: args.contactData,
    commercialContext: args.commercialContext,
  })
  const fieldsTouched = diffTouchedFields(existingAction, payload)

  let taskId: string | null = existingAction?.id || null
  let decision: CrmActionDecision = 'create_action'

  if (existingAction) {
    decision = fieldsTouched.length > 0 ? 'update_action' : 'no_op'
    if (decision === 'update_action') {
      payload.metadata = {
        ...((payload.metadata as Record<string, unknown>) || {}),
        updated_at: new Date().toISOString(),
      } as typeof payload.metadata
      const { error } = await args.supabase
        .from('tasks')
        .update(payload)
        .eq('id', existingAction.id)
      if (error) throw error
    }
  } else {
    const { data, error } = await args.supabase
      .from('tasks')
      .insert(payload)
      .select('id')
      .single()
    if (error) throw error
    taskId = data.id
  }

  const metadataPatch = {
    chatbot_crm_action: {
      decision,
      reason: rule.reason,
      action_type: rule.actionType,
      task_id: taskId,
      lead_id: args.leadId,
      fields_touched: fieldsTouched,
      updated_at: new Date().toISOString(),
    },
  }

  await args.supabase.from('automation_events').insert({
    tenant_id: args.tenantId,
    event_type: 'crm_action.evaluated',
    entity_type: 'conversation',
    entity_id: args.conversationId,
    payload: {
      decision,
      action_type: rule.actionType,
      task_id: taskId,
      conversation_id: args.conversationId,
      lead_id: args.leadId,
        reason: rule.reason,
        lead_capture_decision: args.leadCaptureDecision,
        fields_touched: fieldsTouched,
      },
    })

  if (taskId && decision === 'create_action') {
    await args.supabase.from('automation_events').insert({
      tenant_id: args.tenantId,
      event_type: 'crm_action.created.from_chatbot',
      entity_type: 'task',
      entity_id: taskId,
      payload: {
        action_type: rule.actionType,
        conversation_id: args.conversationId,
        lead_id: args.leadId,
        source: 'chatbot',
      },
    })
  }

  if (taskId && decision === 'update_action') {
    await args.supabase.from('automation_events').insert({
      tenant_id: args.tenantId,
      event_type: 'crm_action.updated.from_chatbot',
      entity_type: 'task',
      entity_id: taskId,
      payload: {
        action_type: rule.actionType,
        conversation_id: args.conversationId,
        lead_id: args.leadId,
        source: 'chatbot',
        fields_touched: fieldsTouched,
      },
    })
  }

  return {
    taskId,
    actionType: rule.actionType,
    decision,
    reason: rule.reason,
    fieldsTouched,
    metadataPatch,
  }
}

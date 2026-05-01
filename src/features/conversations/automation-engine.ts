export type AutomationEventType =
  | 'lead.created'
  | 'appointment.created'
  | 'appointment.reminder_scheduled'
  | 'human_escalation.requested'
  | 'chatbot.session.started'
  | 'message.received'
  | 'tenant.suspended'
  | 'tenant.reactivated'
  | 'conversation.created'
  | 'email.inbound.received'
  | 'whatsapp.inbound.received'
  | 'intent.classified'
  | 'decision.made'

export type AutomationActionType =
  | 'create_followup'
  | 'create_reminder'
  | 'create_notification'
  | 'mark_for_review'
  | 'create_task'
  | 'block_automation'
  | 'resume_automation'

export interface AutomationRule {
  id: string
  tenant_id: string
  name: string
  description: string | null
  trigger_event: AutomationEventType
  action_type: AutomationActionType
  config: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface AutomationExecution {
  id: string
  tenant_id: string
  rule_id: string | null
  event_type: string
  entity_type: string | null
  entity_id: string | null
  action_type: AutomationActionType
  status: 'success' | 'failed' | 'blocked'
  payload: Record<string, unknown>
  error_message: string | null
  executed_at: string
}

export const RULE_TEMPLATES: Array<{
  id: string
  name: string
  description: string
  trigger_event: AutomationEventType
  action_type: AutomationActionType
  config: Record<string, unknown>
}> = [
  {
    id: 'appt_reminder',
    name: 'Recordatorio de cita',
    description: 'Genera recordatorio interno al crear una cita',
    trigger_event: 'appointment.created',
    action_type: 'create_reminder',
    config: { reminder_hours_before: 24 },
  },
  {
    id: 'human_followup',
    name: 'Follow-up de escalación humana',
    description: 'Genera follow-up interno cuando se escala a humano',
    trigger_event: 'human_escalation.requested',
    action_type: 'create_followup',
    config: { priority: 'high', assign_to: 'agent' },
  },
  {
    id: 'lead_initial_followup',
    name: 'Seguimiento inicial de lead',
    description: 'Genera evento de seguimiento al crear un lead',
    trigger_event: 'lead.created',
    action_type: 'create_followup',
    config: { followup_hours: 2 },
  },
  {
    id: 'tenant_suspended_block',
    name: 'Bloqueo por tenant suspendido',
    description: 'Bloquea automatizaciones cuando el tenant está suspendido',
    trigger_event: 'tenant.suspended',
    action_type: 'block_automation',
    config: {},
  },
  {
    id: 'tenant_reactivated_resume',
    name: 'Reanudación por tenant reactivado',
    description: 'Reanuda automatizaciones cuando el tenant se reactiva',
    trigger_event: 'tenant.reactivated',
    action_type: 'resume_automation',
    config: {},
  },
]

export function getRuleTemplate(eventType: string): typeof RULE_TEMPLATES[number] | null {
  return RULE_TEMPLATES.find(r => r.trigger_event === eventType) || null
}

export type IntentType =
  | 'general_question'
  | 'property_interest'
  | 'appointment_request'
  | 'pricing_question'
  | 'documentation_request'
  | 'complaint'
  | 'human_help'
  | 'unknown'

export type DecisionType =
  | 'suggest_auto_reply'
  | 'require_human'
  | 'suggest_appointment'
  | 'request_more_info'
  | 'no_action'

export interface IntentResult {
  intent: IntentType
  confidence: number
  matched_keywords: string[]
  source: 'heuristic'
}

export interface DecisionResult {
  decision: DecisionType
  reason: string
  source: 'rule'
}

export interface ClassificationResult {
  intent: IntentResult
  decision: DecisionResult
  classified_at: string
}

export interface MessageMetadata {
  intent?: IntentResult
  decision?: DecisionResult
  classified_at?: string
  [key: string]: unknown
}

export const INTENT_LABELS: Record<IntentType, string> = {
  general_question: 'Consulta general',
  property_interest: 'Interés en propiedad',
  appointment_request: 'Solicita cita/visita',
  pricing_question: 'Consulta de precio',
  documentation_request: 'Documentación',
  complaint: 'Queja',
  human_help: 'Solicita ayuda humana',
  unknown: 'Sin clasificar',
}

export const INTENT_COLORS: Record<IntentType, string> = {
  general_question: 'bg-blue-50 text-blue-700 border-blue-200',
  property_interest: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  appointment_request: 'bg-violet-50 text-violet-700 border-violet-200',
  pricing_question: 'bg-amber-50 text-amber-700 border-amber-200',
  documentation_request: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  complaint: 'bg-red-50 text-red-700 border-red-200',
  human_help: 'bg-orange-50 text-orange-700 border-orange-200',
  unknown: 'bg-slate-50 text-slate-600 border-slate-200',
}

export const DECISION_LABELS: Record<DecisionType, string> = {
  suggest_auto_reply: 'Respuesta automática sugerida',
  require_human: 'Requiere humano',
  suggest_appointment: 'Sugerir cita',
  request_more_info: 'Pedir más información',
  no_action: 'Sin acción',
}

export const DECISION_COLORS: Record<DecisionType, string> = {
  suggest_auto_reply: 'bg-green-50 text-green-700 border-green-200',
  require_human: 'bg-red-50 text-red-700 border-red-200',
  suggest_appointment: 'bg-violet-50 text-violet-700 border-violet-200',
  request_more_info: 'bg-amber-50 text-amber-700 border-amber-200',
  no_action: 'bg-slate-50 text-slate-600 border-slate-200',
}

export const DECISION_ICONS: Record<DecisionType, string> = {
  suggest_auto_reply: 'Bot',
  require_human: 'UserCheck',
  suggest_appointment: 'Calendar',
  request_more_info: 'HelpCircle',
  no_action: 'Minus',
}

export type ReplyStatus = 'draft' | 'sent' | 'skipped'

export interface AutoReplyResult {
  reply_text: string
  reply_status: ReplyStatus
  template_id: string
  based_on_intent: IntentType
  based_on_decision: DecisionType
  confidence: number
  generated_at: string
  channel: string
}

export interface MessageMetadataWithReply extends MessageMetadata {
  auto_reply?: AutoReplyResult
}

export type EscalationStatus = 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'failed'

export interface EscalationData {
  status: EscalationStatus
  requested_at: string
  requested_by: string | null
  assigned_to: string | null
  assigned_at: string | null
  resolved_at: string | null
  resolved_by: string | null
  reason: string
}

export interface HumanSuggestionResult {
  suggested_reply: string
  rationale: string
  source: 'template'
  based_on_intent: IntentType
  based_on_decision: DecisionType
  generated_at: string
}

export interface MessageMetadataFull extends MessageMetadata {
  auto_reply?: AutoReplyResult
  escalation?: EscalationData
  human_suggestion?: HumanSuggestionResult
  human_reply?: {
    reply_text: string
    sent_at: string
    sent_by: string
  }
}

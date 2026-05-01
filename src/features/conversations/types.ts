export type ConversationChannel = 'email' | 'whatsapp' | 'chatbot' | 'internal' | 'web_form'
export type ConversationStatus = 'open' | 'waiting' | 'resolved' | 'archived'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageStatus = 'draft' | 'sent' | 'delivered' | 'read' | 'failed'

export interface Conversation {
  id: string
  tenant_id: string
  lead_id: string | null
  subject: string | null
  channel: ConversationChannel
  status: ConversationStatus
  last_message_at: string | null
  last_message_preview: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: string
  conversation_id: string
  tenant_id: string
  sender_user_id: string | null
  direction: MessageDirection
  channel: ConversationChannel
  status: MessageStatus
  content: string
  content_type: string
  metadata: Record<string, unknown>
  is_automated: boolean
  error_message: string | null
  created_at: string
}

export interface ConversationParticipant {
  id: string
  conversation_id: string
  user_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  role: string
  joined_at: string
  left_at: string | null
}

export interface AutomationEvent {
  id: string
  tenant_id: string
  event_type: string
  entity_type: string | null
  entity_id: string | null
  actor_user_id: string | null
  payload: Record<string, unknown>
  processed: boolean
  processed_at: string | null
  error_message: string | null
  created_at: string
}

export type ConversationWithLead = Conversation & {
  lead: {
    id: string
    first_name: string
    last_name: string | null
    phone: string
    email: string | null
  } | null
  message_count: number
  unread_count: number
}

export type MessageWithSender = ConversationMessage & {
  sender: {
    id: string
    full_name: string | null
    email: string
  } | null
}

export const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  chatbot: 'Chatbot',
  internal: 'Interno',
  web_form: 'Formulario web',
}

export const CHANNEL_ICONS: Record<ConversationChannel, string> = {
  email: 'Mail',
  whatsapp: 'MessageCircle',
  chatbot: 'Bot',
  internal: 'MessageSquare',
  web_form: 'Globe',
}

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  open: 'Abierta',
  waiting: 'En espera',
  resolved: 'Resuelta',
  archived: 'Archivada',
}

export const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  waiting: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-blue-50 text-blue-700 border-blue-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
}

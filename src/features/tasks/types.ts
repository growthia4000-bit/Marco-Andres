export type TaskActionType =
  | 'general_task'
  | 'human_followup_action'
  | 'visit_action'
  | 'seller_valuation_action'
  | 'financing_followup_action'
  | 'buyer_contact_action'

export type TaskActionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface TaskRecord {
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
  created_at: string
  updated_at: string
  action_type: TaskActionType
  action_status: TaskActionStatus
  source: string
  reason: string | null
  next_step: string | null
  metadata: Record<string, unknown>
  leads?: {
    id: string
    first_name: string
    last_name: string | null
    phone: string | null
    email?: string | null
  } | null
  properties?: {
    id: string
    title: string
  } | null
  conversations?: {
    id: string
    subject: string | null
    status: string
    channel: string
  } | null
  users?: {
    id: string
    full_name: string | null
    email: string | null
  } | null
}

export const TASK_ACTION_TYPES: TaskActionType[] = [
  'human_followup_action',
  'visit_action',
  'seller_valuation_action',
  'financing_followup_action',
  'buyer_contact_action',
  'general_task',
]

export const TASK_ACTION_TYPE_LABELS: Record<TaskActionType, string> = {
  general_task: 'General',
  human_followup_action: 'Human follow-up',
  visit_action: 'Visit',
  seller_valuation_action: 'Seller valuation',
  financing_followup_action: 'Financing follow-up',
  buyer_contact_action: 'Buyer contact',
}

export const TASK_ACTION_STATUS_LABELS: Record<TaskActionStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

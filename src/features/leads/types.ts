export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'visit' | 'negotiation' | 'won' | 'lost'

export interface Lead {
  id: string
  tenant_id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string
  source: string | null
  budget_min: number | null
  budget_max: number | null
  preferred_location: string | null
  preferred_type: string | null
  notes: string | null
  status: LeadStatus
  assigned_to: string | null
  created_by: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}

export const LEAD_STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'new', label: 'Nuevo', color: 'blue' },
  { value: 'contacted', label: 'Contactado', color: 'amber' },
  { value: 'qualified', label: 'Cualificado', color: 'cyan' },
  { value: 'visit', label: 'Visita', color: 'green' },
  { value: 'negotiation', label: 'Negociacion', color: 'purple' },
  { value: 'won', label: 'Ganada', color: 'emerald' },
  { value: 'lost', label: 'Perdida', color: 'red' },
]

export const LEAD_SOURCES = [
  { value: 'web', label: 'Web' },
  { value: 'referral', label: 'Referido' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'phone', label: 'Telefono' },
  { value: 'walk_in', label: 'Visita directa' },
  { value: 'other', label: 'Otro' },
]

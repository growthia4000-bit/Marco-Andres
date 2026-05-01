export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type AppointmentType = 'visit' | 'meeting' | 'call' | 'video_call' | 'inspection'

export interface Appointment {
  id: string
  tenant_id: string
  lead_id: string | null
  property_id: string | null
  user_id: string
  title: string
  description: string | null
  appointment_type: AppointmentType
  status: AppointmentStatus
  start_time: string
  end_time: string
  location: string | null
  notes: string | null
  reminder_sent: boolean
  created_at: string
  updated_at: string
  leads?: { id: string; first_name: string; last_name: string; phone: string | null; email: string | null }
  properties?: { id: string; title: string }
}

export const APPOINTMENT_STATUSES: { value: AppointmentStatus; label: string }[] = [
  { value: 'scheduled', label: 'Programada' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'no_show', label: 'No asistio' },
]

export const APPOINTMENT_TYPES: { value: AppointmentType; label: string }[] = [
  { value: 'visit', label: 'Visita' },
  { value: 'meeting', label: 'Reunion' },
  { value: 'call', label: 'Llamada' },
  { value: 'video_call', label: 'Videollamada' },
  { value: 'inspection', label: 'Inspeccion' },
]

import type { AppointmentStatus, AppointmentType } from '@/features/appointments/types'
import type { LeadStatus } from '@/features/leads/types'
import type { DealType, PropertyStatus, PropertyType } from '@/features/properties/types'

type Translate = (key: string, vars?: Record<string, string | number>) => string

export function getPropertyTypeLabel(t: Translate, value: string | null | undefined) {
  if (!value) return '-'
  return t(`propertyLabels.types.${value}`)
}

export function getDealTypeLabel(t: Translate, value: DealType | string | null | undefined) {
  if (!value) return '-'
  return t(`propertyLabels.deals.${value}`)
}

export function getPropertyStatusLabel(t: Translate, value: PropertyStatus | string | null | undefined) {
  if (!value) return '-'
  return t(`propertyLabels.statuses.${value}`)
}

export function getLeadStatusLabel(t: Translate, value: LeadStatus | string | null | undefined) {
  if (!value) return '-'
  return t(`leadLabels.statuses.${value}`)
}

export function getLeadSourceLabel(t: Translate, value: string | null | undefined) {
  if (!value) return '-'
  return t(`leadLabels.sources.${value}`)
}

export function getAppointmentStatusLabel(t: Translate, value: AppointmentStatus | string | null | undefined) {
  if (!value) return '-'
  return t(`appointmentLabels.statuses.${value}`)
}

export function getAppointmentTypeLabel(t: Translate, value: AppointmentType | string | null | undefined) {
  if (!value) return '-'
  return t(`appointmentLabels.types.${value}`)
}

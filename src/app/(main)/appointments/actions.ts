'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { detectWhatsAppDeliveryConfig, sendWhatsAppViaMeta } from '@/features/conversations/whatsapp-engine'
import { DEFAULT_TIMEZONE } from '@/i18n/config'

type CreateAppointmentInput = {
  title: string
  description?: string | null
  appointment_type: string
  status: string
  start_time: string
  end_time: string
  location?: string | null
  lead_id?: string | null
  property_id?: string | null
  notes?: string | null
}

type SendAppointmentWhatsAppResult = {
  ok: boolean
  error?: string
}

type AppointmentWhatsAppRow = {
  id: string
  tenant_id: string
  lead_id: string | null
  start_time: string
  leads: {
    id: string
    phone: string | null
  } | null
}

type AppointmentWhatsAppSendResult = {
  ok: boolean
  status?: string
  error?: string
  providerMessageId?: string
  templateName?: string
}

function formatAppointmentWhatsAppParams(startTime: string) {
  const date = new Date(startTime)

  return {
    date: new Intl.DateTimeFormat('es-ES', {
      timeZone: DEFAULT_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('es-ES', {
      timeZone: DEFAULT_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date),
  }
}

async function sendAppointmentConfirmationWhatsApp(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  appointment: AppointmentWhatsAppRow
}): Promise<AppointmentWhatsAppSendResult> {
  const { supabase, appointment } = params

  if (!appointment.leads?.id) {
    return { ok: false, error: 'La cita no tiene un lead asociado.' }
  }

  const leadPhone = appointment.leads.phone?.trim()
  if (!leadPhone) {
    return { ok: false, error: 'El lead asociado no tiene teléfono.' }
  }

  const dbConfigResponse = await supabase
    .from('tenant_whatsapp_configs')
    .select('phone_number_id, access_token_encrypted, mode, status')
    .eq('tenant_id', appointment.tenant_id)
    .eq('status', 'active')
    .maybeSingle()

  let deliveryConfig = detectWhatsAppDeliveryConfig(process.env)

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

  if (!deliveryConfig.configured || deliveryConfig.provider !== 'meta_cloud' || !deliveryConfig.meta) {
    return { ok: false, error: 'WhatsApp outbound no está configurado completamente para esta inmobiliaria.' }
  }

  const formatted = formatAppointmentWhatsAppParams(appointment.start_time)
  const result = await sendWhatsAppViaMeta({
    config: deliveryConfig.meta,
    to: leadPhone,
    text: '',
    templateName: 'visita_confirmacion_detalle_es',
    templateLanguageCode: 'es',
    templateParams: [formatted.date, formatted.time],
  })

  if (result.status !== 'sent') {
    return {
      ok: false,
      status: result.status,
      error: result.error || result.reason || 'No se pudo enviar el WhatsApp.',
      templateName: result.template_name,
    }
  }

  return {
    ok: true,
    status: result.status,
    providerMessageId: result.provider_message_id,
    templateName: result.template_name,
  }
}

export async function createAppointmentAction(input: CreateAppointmentInput) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.tenant_id) {
    throw new Error('Tenant no encontrado para el usuario actual')
  }

  const appointmentPayload = {
    tenant_id: profile.tenant_id,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    appointment_type: input.appointment_type,
    status: input.status,
    start_time: input.start_time,
    end_time: input.end_time,
    location: input.location?.trim() || null,
    lead_id: input.lead_id || null,
    property_id: input.property_id || null,
    notes: input.notes?.trim() || null,
    user_id: user.id,
  }

  const { data: appointment, error: insertError } = await supabase
    .from('appointments')
    .insert(appointmentPayload)
    .select('id, tenant_id, lead_id, start_time, leads(id, phone)')
    .single<AppointmentWhatsAppRow>()

  if (insertError || !appointment) {
    throw new Error(insertError?.message || 'No se pudo crear la cita')
  }

  if (appointment.lead_id) {
    const waResult = await sendAppointmentConfirmationWhatsApp({ supabase, appointment })

    if (waResult.ok || appointment.leads?.phone?.trim()) {
      await supabase.from('automation_events').insert({
        tenant_id: appointment.tenant_id,
        event_type: waResult.ok ? 'whatsapp.visit_confirmation.sent' : 'whatsapp.visit_confirmation.failed',
        entity_type: 'appointment',
        entity_id: appointment.id,
        actor_user_id: user.id,
        payload: {
          from: appointment.leads?.phone || null,
          template_name: waResult.templateName || 'visita_confirmacion_detalle_es',
          template_key_base: 'visita_confirmacion_detalle_es',
          locale_resolved: 'es',
          used_fallback: false,
          provider_message_id: waResult.providerMessageId,
          status: waResult.status || (waResult.ok ? 'sent' : 'failed'),
          error: waResult.error,
          trigger: 'appointment.created.manual',
        },
      })
    }
  }

  revalidatePath('/appointments')
  if (appointment.lead_id) {
    revalidatePath(`/leads/${appointment.lead_id}`)
  }

  return { id: appointment.id }
}

export async function sendAppointmentWhatsAppAction(appointmentId: string): Promise<SendAppointmentWhatsAppResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.tenant_id) {
    return { ok: false, error: 'Tenant no encontrado para el usuario actual' }
  }

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, tenant_id, lead_id, start_time, leads(id, phone)')
    .eq('id', appointmentId)
    .eq('tenant_id', profile.tenant_id)
    .single<AppointmentWhatsAppRow>()

  if (appointmentError || !appointment) {
    return { ok: false, error: 'Cita no encontrada.' }
  }

  const result = await sendAppointmentConfirmationWhatsApp({ supabase, appointment })
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

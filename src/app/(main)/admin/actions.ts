'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireSuperadmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, global_role')
    .eq('id', user.id)
    .single()

  if (!currentUser || currentUser.global_role !== 'superadmin') {
    throw new Error('Forbidden')
  }

  return { supabase, actorUserId: currentUser.id }
}

export async function suspendTenantAction(formData: FormData) {
  const tenantId = String(formData.get('tenantId') || '')

  if (!tenantId) {
    throw new Error('Tenant ID is required')
  }

  const { supabase, actorUserId } = await requireSuperadmin()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, status, suspended_at')
    .eq('id', tenantId)
    .single()

  if (!tenant) {
    throw new Error('Tenant not found')
  }

  const suspendedAt = new Date().toISOString()

  const { error } = await supabase
    .from('tenants')
    .update({ status: 'suspended', suspended_at: suspendedAt })
    .eq('id', tenantId)

  if (error) {
    throw new Error(error.message)
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId,
    action: 'tenant.suspended',
    entity_type: 'tenant',
    entity_id: tenantId,
    metadata: {
      event_type: 'UPDATE',
      status: 'suspended',
      suspended_at: suspendedAt,
      changes: {
        status: { old: tenant.status, new: 'suspended' },
        suspended_at: { old: tenant.suspended_at, new: suspendedAt },
      },
    },
  })

  if (auditError) {
    throw new Error(auditError.message)
  }

  revalidatePath('/admin')
}

export async function reactivateTenantAction(formData: FormData) {
  const tenantId = String(formData.get('tenantId') || '')

  if (!tenantId) {
    throw new Error('Tenant ID is required')
  }

  const { supabase, actorUserId } = await requireSuperadmin()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, status, suspended_at')
    .eq('id', tenantId)
    .single()

  if (!tenant) {
    throw new Error('Tenant not found')
  }

  const { error } = await supabase
    .from('tenants')
    .update({ status: 'active', suspended_at: null })
    .eq('id', tenantId)

  if (error) {
    throw new Error(error.message)
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId,
    action: 'tenant.reactivated',
    entity_type: 'tenant',
    entity_id: tenantId,
    metadata: {
      event_type: 'UPDATE',
      status: 'active',
      suspended_at: null,
      changes: {
        status: { old: tenant.status, new: 'active' },
        suspended_at: { old: tenant.suspended_at, new: null },
      },
    },
  })

  if (auditError) {
    throw new Error(auditError.message)
  }

  revalidatePath('/admin')
}

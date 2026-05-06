'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

async function requireSuperadmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('No autenticado')
  }

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, global_role')
    .eq('id', user.id)
    .single()

  if (!currentUser || currentUser.global_role !== 'superadmin') {
    throw new Error('Acceso denegado')
  }

  return { supabase, actorUserId: currentUser.id }
}

export async function suspendTenantAction(formData: FormData) {
  const tenantId = String(formData.get('tenantId') || '')

  if (!tenantId) {
    throw new Error('ID de tenant requerido')
  }

  const { supabase, actorUserId } = await requireSuperadmin()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, status, suspended_at')
    .eq('id', tenantId)
    .single()

  if (!tenant) {
    throw new Error('Tenant no encontrado')
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
    throw new Error('ID de tenant requerido')
  }

  const { supabase, actorUserId } = await requireSuperadmin()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, status, suspended_at')
    .eq('id', tenantId)
    .single()

  if (!tenant) {
    throw new Error('Tenant no encontrado')
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

export async function updateCommercialStatusAction(formData: FormData) {
  const tenantId = String(formData.get('tenantId') || '')
  const planSlug = String(formData.get('planSlug') || '')
  const subscriptionStatus = String(formData.get('subscriptionStatus') || '')

  if (!tenantId || !subscriptionStatus) {
    throw new Error('Variables requeridas faltantes')
  }

  const { supabase, actorUserId } = await requireSuperadmin()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, status')
    .eq('id', tenantId)
    .single()

  if (!tenant) throw new Error('Tenant no encontrado')
  if (tenant.status === 'suspended') {
    throw new Error('No se puede cambiar el plan de un tenant suspendido')
  }

  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id, status, plan_id')
    .eq('tenant_id', tenantId)
    .eq('is_current', true)
    .single()

  if (!planSlug) {
    if (existingSub) {
      const { error: deactivateError } = await supabase
        .from('subscriptions')
        .update({ is_current: false })
        .eq('id', existingSub.id)

      if (deactivateError) throw new Error(deactivateError.message)
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      action: 'tenant.commercial_update',
      entity_type: 'tenant',
      entity_id: tenantId,
      metadata: {
        event_type: 'UPDATE',
        plan_slug: null,
        subscription_status: subscriptionStatus,
        changes: {
          plan_id: { old: existingSub?.plan_id, new: null },
          status: { old: existingSub?.status, new: subscriptionStatus },
        },
      },
    })

    if (auditError) throw new Error(auditError.message)

    revalidatePath('/admin')
    return
  }

  const { data: plan } = await supabase.from('plans').select('id, slug').eq('slug', planSlug).single()
  if (!plan) throw new Error('Plan no encontrado')

  if (existingSub) {
    const { error: subError } = await supabase
      .from('subscriptions')
      .update({
        plan_id: plan.id,
        status: subscriptionStatus,
      })
      .eq('id', existingSub.id)

    if (subError) throw new Error(subError.message)
  } else {
    const { error: instError } = await supabase.from('subscriptions').insert({
      tenant_id: tenantId,
      plan_id: plan.id,
      status: subscriptionStatus,
      is_current: true,
      billing_cycle: 'monthly',
    })

    if (instError) throw new Error(instError.message)
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId,
    action: 'tenant.commercial_update',
    entity_type: 'tenant',
    entity_id: tenantId,
    metadata: {
      event_type: 'UPDATE',
      plan_slug: planSlug,
      subscription_status: subscriptionStatus,
      changes: {
        plan_id: { old: existingSub?.plan_id, new: plan.id },
        status: { old: existingSub?.status, new: subscriptionStatus },
      },
    },
  })

  if (auditError) throw new Error(auditError.message)

  revalidatePath('/admin')
}

export async function createTenantAction(formData: FormData) {
  const tenantName = String(formData.get('tenantName') || '').trim()
  const tenantSlug = String(formData.get('tenantSlug') || '').trim()
  const ownerName = String(formData.get('ownerName') || '').trim()
  const ownerEmail = String(formData.get('ownerEmail') || '').trim().toLowerCase()
  const planSlug = String(formData.get('planSlug') || '').trim()

  if (!tenantName || !ownerName || !ownerEmail) {
    throw new Error('Nombre del tenant, nombre del owner y email son obligatorios')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error('Email inválido')
  }

  const { supabase, actorUserId } = await requireSuperadmin()

  const slugBase = tenantSlug || tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  let slug = slugBase
  let counter = 0
  let slugExists = true

  while (slugExists) {
    const { data: existing } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (!existing) {
      slugExists = false
    } else {
      counter++
      slug = `${slugBase}-${counter}`
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada. Contacta al administrador del sistema.')
  }

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const tempPassword = crypto.randomUUID().slice(0, 12) + 'A1!'
  const provisioningAppMetadata = {
    provisioning_source: 'superadmin',
  }

  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: ownerEmail,
    password: tempPassword,
    email_confirm: true,
    app_metadata: provisioningAppMetadata,
    user_metadata: {
      full_name: ownerName,
      tenant_name: tenantName,
      tenant_slug: slug,
    },
  })

  if (authError) {
    if (authError.message.includes('PUBLIC_SIGNUP_DISABLED')) {
      throw new Error('La creación automática fue bloqueada. Revisa la migración de provisioning en Supabase.')
    }
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      throw new Error('Este email ya está registrado')
    }
    throw new Error(authError.message)
  }

  const newUserId = authUser.user?.id

  if (!newUserId) {
    throw new Error('Supabase Auth no devolvió el usuario creado')
  }

  const { data: newUserData, error: newUserError } = await adminClient
    .from('users')
    .select('tenant_id')
    .eq('id', newUserId)
    .single()

  if (newUserError) {
    throw new Error(newUserError.message)
  }

  if (!newUserData?.tenant_id) {
    throw new Error('No se pudo vincular el nuevo usuario con su inmobiliaria')
  }

  const tenantId = newUserData.tenant_id

  const { error: tenantUpdateError } = await adminClient
    .from('tenants')
    .update({ email: ownerEmail })
    .eq('id', tenantId)

  if (tenantUpdateError) {
    throw new Error(tenantUpdateError.message)
  }

  if (planSlug) {
    const { data: plan, error: planError } = await adminClient
      .from('plans')
      .select('id')
      .eq('slug', planSlug)
      .single()

    if (planError) {
      throw new Error(planError.message)
    }

    const { error: resetSubscriptionError } = await adminClient
      .from('subscriptions')
      .update({ is_current: false })
      .eq('tenant_id', tenantId)
      .eq('is_current', true)

    if (resetSubscriptionError) {
      throw new Error(resetSubscriptionError.message)
    }

    const { error: insertSubscriptionError } = await adminClient.from('subscriptions').insert({
        tenant_id: tenantId,
        plan_id: plan.id,
        status: 'active',
        is_current: true,
        billing_cycle: 'monthly',
      })

    if (insertSubscriptionError) {
      throw new Error(insertSubscriptionError.message)
    }
  }

  const { error: auditError } = await adminClient.from('audit_logs').insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId,
    action: 'tenant.created',
    entity_type: 'tenant',
    entity_id: tenantId,
    metadata: {
      tenant_name: tenantName,
      tenant_slug: slug,
      owner_email: ownerEmail,
      owner_name: ownerName,
      plan_slug: planSlug || 'starter',
      provisioning_source: provisioningAppMetadata.provisioning_source,
    },
  })

  if (auditError) {
    throw new Error(auditError.message)
  }

  revalidatePath('/admin')

  return { password: tempPassword, ownerEmail, tenantName }
}

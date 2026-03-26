import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SuperadminDashboard from './SuperadminDashboard'
import { reactivateTenantAction, suspendTenantAction } from './actions'

type TenantRow = {
  id: string
  name: string
  slug: string
  status: 'active' | 'inactive' | 'suspended'
  email: string | null
  trial_ends_at: string | null
  suspended_at: string | null
  created_at: string
}

type SubscriptionRow = {
  tenant_id: string
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended'
  billing_cycle: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  plans: {
    slug: string
    name: string
    max_users: number
  }[] | null
}

type CapacitySnapshot = {
  tenant_id: string
  tenant_status: 'active' | 'inactive' | 'suspended'
  subscription_status: 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended' | null
  plan_slug: string | null
  billable_user_count: number
  max_users: number | null
  can_create_more_users: boolean
  is_operational: boolean
}

async function getCapacitySnapshot(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string) {
  const { data, error } = await supabase.rpc('app_tenant_capacity_snapshot', {
    target_tenant_id: tenantId,
  })

  if (error) {
    return null
  }

  return (data?.[0] ?? null) as CapacitySnapshot | null
}

export default async function AdminPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, full_name, email, global_role')
    .eq('id', user.id)
    .single()

  if (!currentUser || currentUser.global_role !== 'superadmin') {
    redirect('/dashboard')
  }

  const [{ data: tenantsData, error: tenantsError }, { data: subscriptionsData, error: subscriptionsError }] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, name, slug, status, email, trial_ends_at, suspended_at, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('subscriptions')
      .select('tenant_id, status, billing_cycle, current_period_end, trial_ends_at, plans(slug, name, max_users)')
      .eq('is_current', true),
  ])

  if (tenantsError || subscriptionsError) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Superadmin</p>
              <h1 className="text-2xl font-semibold text-slate-900">Panel Global</h1>
            </div>
          </div>
        </header>
        <main className="p-6">
          <div className="bg-white rounded-xl border border-red-200 p-6 text-red-600">
            Error al cargar los datos globales.
          </div>
        </main>
      </div>
    )
  }

  const tenants = (tenantsData ?? []) as TenantRow[]
  const subscriptions = ((subscriptionsData ?? []) as SubscriptionRow[]).map((item) => ({
    ...item,
    plans: item.plans?.[0] ? [item.plans[0]] : null,
  }))
  const subscriptionByTenant = new Map(
    subscriptions.map((item) => [
      item.tenant_id,
      {
        ...item,
        plans: item.plans?.[0] ?? null,
      },
    ])
  )

  const capacityEntries = await Promise.all(
    tenants.map(async (tenant) => [tenant.id, await getCapacitySnapshot(supabase, tenant.id)] as const)
  )

  const capacityByTenant = new Map(capacityEntries)

  return (
    <SuperadminDashboard
      currentUser={{
        fullName: currentUser.full_name ?? currentUser.email ?? 'Superadmin',
        email: currentUser.email ?? user.email ?? '',
      }}
      tenants={tenants.map((tenant) => ({
        ...tenant,
        subscription: subscriptionByTenant.get(tenant.id) ?? null,
        capacity: capacityByTenant.get(tenant.id) ?? null,
      }))}
      suspendTenantAction={suspendTenantAction}
      reactivateTenantAction={reactivateTenantAction}
    />
  )
}

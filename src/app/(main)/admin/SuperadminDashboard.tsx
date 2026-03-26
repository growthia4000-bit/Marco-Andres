import Link from 'next/link'
import { AlertTriangle, BadgeCheck, Building2, CircleOff, Shield, Users } from 'lucide-react'

type TenantItem = {
  id: string
  name: string
  slug: string
  status: 'active' | 'inactive' | 'suspended'
  email: string | null
  trial_ends_at: string | null
  suspended_at: string | null
  created_at: string
  subscription: {
    tenant_id: string
    status: 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended'
    billing_cycle: string | null
    current_period_end: string | null
    trial_ends_at: string | null
    plans: {
      slug: string
      name: string
      max_users: number
    } | null
  } | null
  capacity: {
    tenant_id: string
    tenant_status: 'active' | 'inactive' | 'suspended'
    subscription_status: 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended' | null
    plan_slug: string | null
    billable_user_count: number
    max_users: number | null
    can_create_more_users: boolean
    is_operational: boolean
  } | null
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function statusBadge(value: string | null) {
  switch (value) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'trial':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'past_due':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'suspended':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'canceled':
      return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'inactive':
      return 'bg-slate-100 text-slate-600 border-slate-200'
    default:
      return 'bg-slate-50 text-slate-500 border-slate-200'
  }
}

function statusLabel(value: string | null) {
  switch (value) {
    case 'active':
      return 'Activo'
    case 'trial':
      return 'Trial'
    case 'past_due':
      return 'Pago pendiente'
    case 'suspended':
      return 'Suspendido'
    case 'canceled':
      return 'Cancelado'
    case 'inactive':
      return 'Inactivo'
    default:
      return 'Sin dato'
  }
}

export default function SuperadminDashboard({
  currentUser,
  tenants,
  suspendTenantAction,
  reactivateTenantAction,
}: {
  currentUser: {
    fullName: string
    email: string
  }
  tenants: TenantItem[]
  suspendTenantAction: (formData: FormData) => Promise<void>
  reactivateTenantAction: (formData: FormData) => Promise<void>
}) {
  const totals = {
    tenants: tenants.length,
    operational: tenants.filter((tenant) => tenant.capacity?.is_operational).length,
    issues: tenants.filter(
      (tenant) => !tenant.capacity?.is_operational || tenant.subscription?.status === 'past_due' || tenant.status === 'suspended'
    ).length,
    billableUsers: tenants.reduce((sum, tenant) => sum + (tenant.capacity?.billable_user_count ?? 0), 0),
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Shield size={16} />
              <span>Superadmin</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 mt-1">Panel Global</h1>
            <p className="text-sm text-slate-500 mt-1">Monitorea tenants, suscripciones y capacidad sin afectar el flujo normal del CRM.</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{currentUser.fullName}</p>
            <p className="text-sm text-slate-500">{currentUser.email}</p>
            <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-700">
              Volver al dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Building2 size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Tenants</p>
                <p className="text-2xl font-bold text-slate-900">{totals.tenants}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <BadgeCheck size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Operativos</p>
                <p className="text-2xl font-bold text-slate-900">{totals.operational}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <AlertTriangle size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Con alertas</p>
                <p className="text-2xl font-bold text-slate-900">{totals.issues}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                <Users size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Usuarios facturables</p>
                <p className="text-2xl font-bold text-slate-900">{totals.billableUsers}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tenants</h2>
              <p className="text-sm text-slate-500">Estado operativo, suscripción actual y capacidad de usuarios.</p>
            </div>
          </div>

          {tenants.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <CircleOff className="mx-auto mb-3 text-slate-300" size={36} />
              No hay tenants disponibles.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Tenant</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Estado tenant</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Plan actual</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Suscripción</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Usuarios facturables</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Max usuarios</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Puede crear más</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Operativo</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Fechas</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{tenant.name}</p>
                          <p className="text-sm text-slate-500">/{tenant.slug}</p>
                          <p className="text-xs text-slate-400 mt-1">{tenant.email || 'Sin email'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-medium ${statusBadge(tenant.status)}`}>
                          {statusLabel(tenant.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {tenant.subscription?.plans?.name || tenant.capacity?.plan_slug || 'Sin plan'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-medium ${statusBadge(tenant.subscription?.status || tenant.capacity?.subscription_status || null)}`}>
                          {statusLabel(tenant.subscription?.status || tenant.capacity?.subscription_status || null)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {tenant.capacity?.billable_user_count ?? '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {tenant.capacity?.max_users ?? tenant.subscription?.plans?.max_users ?? '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={tenant.capacity?.can_create_more_users ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                          {tenant.capacity?.can_create_more_users ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={tenant.capacity?.is_operational ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                          {tenant.capacity?.is_operational ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        <p>Creado: {formatDate(tenant.created_at)}</p>
                        <p>Trial fin: {formatDate(tenant.trial_ends_at || tenant.subscription?.trial_ends_at || null)}</p>
                        <p>Periodo fin: {formatDate(tenant.subscription?.current_period_end || null)}</p>
                        <p>Suspension: {formatDate(tenant.suspended_at)}</p>
                      </td>
                      <td className="px-6 py-4">
                        {tenant.status === 'suspended' ? (
                          <form action={reactivateTenantAction}>
                            <input type="hidden" name="tenantId" value={tenant.id} />
                            <button
                              type="submit"
                              className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition text-sm font-medium"
                            >
                              Reactivar
                            </button>
                          </form>
                        ) : (
                          <form action={suspendTenantAction}>
                            <input type="hidden" name="tenantId" value={tenant.id} />
                            <button
                              type="submit"
                              className="px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition text-sm font-medium"
                            >
                              Suspender
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

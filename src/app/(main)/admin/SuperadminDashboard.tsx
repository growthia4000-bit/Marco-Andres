'use client'

import Link from 'next/link'
import { AlertTriangle, BadgeCheck, Building2, CircleOff, Shield, Users } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

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
  const fallback = 'admin.status.unknown'
  switch (value) {
    case 'active':
      return 'admin.status.active'
    case 'trial':
      return 'admin.status.trial'
    case 'past_due':
      return 'admin.status.past_due'
    case 'suspended':
      return 'admin.status.suspended'
    case 'canceled':
      return 'admin.status.canceled'
    case 'inactive':
      return 'admin.status.inactive'
    default:
      return fallback
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
  const { t, formatDate } = useI18n()
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
              <span>{t('admin.superadmin')}</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 mt-1">{t('admin.globalPanel')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t('admin.subtitle')}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{currentUser.fullName}</p>
            <p className="text-sm text-slate-500">{currentUser.email}</p>
            <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-700">
              {t('admin.backToDashboard')}
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
                <p className="text-sm text-slate-500">{t('admin.tenants')}</p>
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
                <p className="text-sm text-slate-500">{t('admin.operational')}</p>
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
                <p className="text-sm text-slate-500">{t('admin.issues')}</p>
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
                <p className="text-sm text-slate-500">{t('admin.billableUsers')}</p>
                <p className="text-2xl font-bold text-slate-900">{totals.billableUsers}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t('admin.tenantSectionTitle')}</h2>
              <p className="text-sm text-slate-500">{t('admin.tenantSectionSubtitle')}</p>
            </div>
          </div>

          {tenants.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <CircleOff className="mx-auto mb-3 text-slate-300" size={36} />
              {t('admin.noTenants')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.tenant')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.tenantStatus')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.currentPlan')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.subscription')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.billableUsers')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.maxUsers')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.canCreateMore')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.operational')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.dates')}</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{tenant.name}</p>
                          <p className="text-sm text-slate-500">/{tenant.slug}</p>
                          <p className="text-xs text-slate-400 mt-1">{tenant.email || t('admin.table.noEmail')}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-medium ${statusBadge(tenant.status)}`}>
                          {t(statusLabel(tenant.status))}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {tenant.subscription?.plans?.name || tenant.capacity?.plan_slug || t('admin.table.noPlan')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-medium ${statusBadge(tenant.subscription?.status || tenant.capacity?.subscription_status || null)}`}>
                          {t(statusLabel(tenant.subscription?.status || tenant.capacity?.subscription_status || null))}
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
                          {tenant.capacity?.can_create_more_users ? t('admin.table.yes') : t('admin.table.no')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={tenant.capacity?.is_operational ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                          {tenant.capacity?.is_operational ? t('admin.table.yes') : t('admin.table.no')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        <p>{t('admin.table.created')}: {formatDate(tenant.created_at, { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        <p>{t('admin.table.trialEnds')}: {tenant.trial_ends_at || tenant.subscription?.trial_ends_at ? formatDate(tenant.trial_ends_at || tenant.subscription?.trial_ends_at || '', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                        <p>{t('admin.table.periodEnds')}: {tenant.subscription?.current_period_end ? formatDate(tenant.subscription.current_period_end, { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                        <p>{t('admin.table.suspension')}: {tenant.suspended_at ? formatDate(tenant.suspended_at, { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        {tenant.status === 'suspended' ? (
                          <form action={reactivateTenantAction}>
                            <input type="hidden" name="tenantId" value={tenant.id} />
                            <button
                              type="submit"
                              className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition text-sm font-medium"
                            >
                              {t('admin.table.reactivate')}
                            </button>
                          </form>
                        ) : (
                          <form action={suspendTenantAction}>
                            <input type="hidden" name="tenantId" value={tenant.id} />
                            <button
                              type="submit"
                              className="px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition text-sm font-medium"
                            >
                              {t('admin.table.suspend')}
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

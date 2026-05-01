'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, BadgeCheck, Building2, CircleOff, Shield, Users, Edit2, Save, X, Plus } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'

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
  plans,
  suspendTenantAction,
  reactivateTenantAction,
  updateCommercialStatusAction,
  createTenantAction,
}: {
  currentUser: {
    fullName: string
    email: string
    tenantSlug: string | null
  }
  tenants: TenantItem[]
  plans: { id: string; slug: string; name: string; max_users: number }[]
  suspendTenantAction: (formData: FormData) => Promise<void>
  reactivateTenantAction: (formData: FormData) => Promise<void>
  updateCommercialStatusAction: (formData: FormData) => Promise<void>
  createTenantAction: (formData: FormData) => Promise<{ password: string; ownerEmail: string; tenantName: string }>
}) {
  const { t, formatDate } = useI18n()
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdCredentials, setCreatedCredentials] = useState<{ password: string; ownerEmail: string; tenantName: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  
  const totals = {
    tenants: tenants.length,
    operational: tenants.filter((tenant) => tenant.capacity?.is_operational).length,
    issues: tenants.filter(
      (tenant) => !tenant.capacity?.is_operational || tenant.subscription?.status === 'past_due' || tenant.status === 'suspended'
    ).length,
    billableUsers: tenants.reduce((sum, tenant) => sum + (tenant.capacity?.billable_user_count ?? 0), 0),
  }

  const filteredTenants = activeFilter === 'all' ? tenants
    : activeFilter === 'operational' ? tenants.filter(t => t.capacity?.is_operational)
    : activeFilter === 'issues' ? tenants.filter(t => !t.capacity?.is_operational || t.subscription?.status === 'past_due' || t.status === 'suspended')
    : activeFilter === 'billable' ? [...tenants].sort((a, b) => (b.capacity?.billable_user_count ?? 0) - (a.capacity?.billable_user_count ?? 0))
    : tenants

  const getLocalizedPlanName = (tenant: TenantItem): string => {
    const slug = tenant.subscription?.plans?.slug || tenant.capacity?.plan_slug
    const fallback = tenant.subscription?.plans?.name || tenant.capacity?.plan_slug
    if (!slug) return t('admin.table.noPlan')
    const localized = t(('admin.plans.' + slug) as 'admin.table.noPlan')
    return localized || fallback || slug
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-3">
            <nav className="flex items-center gap-2 text-sm text-slate-500">
              <Link href="/dashboard" className="transition hover:text-slate-700">{t('dashboard.title')}</Link>
              <span className="text-slate-300">/</span>
              <span>{t('admin.superadmin')}</span>
              <span className="text-slate-300">/</span>
              <span className="font-medium text-slate-900">{t('admin.globalPanel')}</span>
            </nav>

            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Shield size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>{t('admin.superadmin')}</span>
                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-600">
                    SUPERADMIN
                  </span>
                </div>
                <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t('admin.globalPanel')}</h1>
                <p className="mt-1 text-sm text-slate-500">{t('admin.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3 text-right">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-slate-900">{currentUser.fullName}</p>
              <p className="text-sm text-slate-500">{currentUser.email}</p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {t('admin.backToDashboard')}
            </Link>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {actionError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-start gap-2">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="ml-3 text-red-400 hover:text-red-600 text-sm underline">{t('common.close')}</button>
            </div>
          </div>
        )}

        {createdCredentials && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="font-medium">{t('admin.createTenant.successTitle', { name: createdCredentials.tenantName })}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p><span className="font-medium">{t('admin.createTenant.successEmail')}:</span> {createdCredentials.ownerEmail}</p>
                  <p><span className="font-medium">{t('admin.createTenant.successPassword')}:</span> <code className="bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900 font-mono">{createdCredentials.password}</code></p>
                </div>
                <p className="mt-2 text-xs text-emerald-600">{t('admin.createTenant.successHint')}</p>
              </div>
              <button onClick={() => setCreatedCredentials(null)} className="text-emerald-500 hover:text-emerald-700 flex-shrink-0">
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <button onClick={() => setActiveFilter('all')} className={`text-left bg-white rounded-xl border p-5 transition hover:shadow-md ${activeFilter === 'all' ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Building2 size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">{t('admin.tenants')}</p>
                <p className="text-2xl font-bold text-slate-900">{totals.tenants}</p>
              </div>
            </div>
          </button>

          <button onClick={() => setActiveFilter('operational')} className={`text-left bg-white rounded-xl border p-5 transition hover:shadow-md ${activeFilter === 'operational' ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <BadgeCheck size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">{t('admin.operational')}</p>
                <p className="text-2xl font-bold text-slate-900">{totals.operational}</p>
              </div>
            </div>
          </button>

          <button onClick={() => setActiveFilter('issues')} className={`text-left bg-white rounded-xl border p-5 transition hover:shadow-md ${activeFilter === 'issues' ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <AlertTriangle size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">{t('admin.issues')}</p>
                <p className="text-2xl font-bold text-slate-900">{totals.issues}</p>
              </div>
            </div>
          </button>

          <button onClick={() => setActiveFilter('billable')} className={`text-left bg-white rounded-xl border p-5 transition hover:shadow-md ${activeFilter === 'billable' ? 'border-violet-400 ring-2 ring-violet-100' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                <Users size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">{t('admin.billableUsers')}</p>
                <p className="text-2xl font-bold text-slate-900">{totals.billableUsers}</p>
              </div>
            </div>
          </button>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t('admin.tenantSectionTitle')}</h2>
              <p className="text-sm text-slate-500">{t('admin.tenantSectionSubtitle')}</p>
            </div>
            <div className="flex items-center gap-3">
              {activeFilter !== 'all' && (
                <button onClick={() => setActiveFilter('all')} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  {t('admin.filters.all')} ({tenants.length})
                </button>
              )}
              <button
                onClick={() => { setShowCreateForm(true); setCreateError(null) }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                <Plus size={16} />
                {t('admin.createTenant.button')}
              </button>
            </div>
          </div>

          {showCreateForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">{t('admin.createTenant.title')}</h3>
                  <button onClick={() => setShowCreateForm(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={20} />
                  </button>
                </div>
                <form
                  action={(formData) => {
                    setCreateError(null)
                    startTransition(() => {
                      createTenantAction(formData)
                        .then((result) => {
                          setShowCreateForm(false)
                          setCreatedCredentials(result)
                        })
                        .catch((err: Error) => { setCreateError(err.message) })
                    })
                  }}
                  className="p-6 space-y-4"
                >
                  {createError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-start gap-2">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{createError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.createTenant.tenantName')}</label>
                    <input name="tenantName" type="text" required placeholder={t('admin.createTenant.tenantNamePlaceholder')}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.createTenant.tenantSlug')}</label>
                    <input name="tenantSlug" type="text" placeholder={t('admin.createTenant.tenantSlugPlaceholder')}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm" />
                    <p className="text-xs text-slate-400 mt-1">{t('admin.createTenant.tenantSlugHint')}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.createTenant.ownerName')}</label>
                      <input name="ownerName" type="text" required placeholder={t('admin.createTenant.ownerNamePlaceholder')}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.createTenant.ownerEmail')}</label>
                      <input name="ownerEmail" type="email" required placeholder={t('admin.createTenant.ownerEmailPlaceholder')}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.createTenant.initialPlan')}</label>
                    <select name="planSlug" defaultValue="starter"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm">
                      {plans.map((p) => (
                        <option key={p.id} value={p.slug}>{t(('admin.plans.' + p.slug) as 'admin.table.noPlan') || p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowCreateForm(false)}
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                      {t('common.cancel')}
                    </button>
                    <button type="submit" disabled={isPending}
                      className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                      {isPending ? t('admin.createTenant.creating') : t('admin.createTenant.submit')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {filteredTenants.length === 0 ? (
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
                  {filteredTenants.map((tenant) => (
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
                        {editingTenantId === tenant.id && tenant.status !== 'suspended' ? (
                          <select
                            name="planSlug"
                            form={`edit-form-${tenant.id}`}
                            defaultValue={tenant.subscription?.plans?.slug || tenant.capacity?.plan_slug || ''}
                            className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          >
                            <option value="">{t('admin.table.noPlan')}</option>
                            {plans.map((p) => (
                              <option key={p.id} value={p.slug}>
                                {t(`admin.plans.${p.slug}` as string) || p.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          getLocalizedPlanName(tenant)
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingTenantId === tenant.id && tenant.status !== 'suspended' ? (
                          <select
                            name="subscriptionStatus"
                            form={`edit-form-${tenant.id}`}
                            defaultValue={tenant.subscription?.status || tenant.capacity?.subscription_status || 'active'}
                            className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          >
                            <option value="trial">{t('admin.status.trial')}</option>
                            <option value="active">{t('admin.status.active')}</option>
                            <option value="past_due">{t('admin.status.past_due')}</option>
                            <option value="canceled">{t('admin.status.canceled')}</option>
                            <option value="suspended">{t('admin.status.suspended')}</option>
                          </select>
                        ) : (
                          <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-medium ${statusBadge(tenant.subscription?.status || tenant.capacity?.subscription_status || null)}`}>
                            {t(statusLabel(tenant.subscription?.status || tenant.capacity?.subscription_status || null))}
                          </span>
                        )}
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
                        <div className="flex flex-col gap-2">
                          {editingTenantId === tenant.id ? (
                            <form
                              id={`edit-form-${tenant.id}`}
                              action={(formData) => {
                                setActionError(null)
                                startTransition(() => {
                                  updateCommercialStatusAction(formData)
                                    .then(() => {
                                      setEditingTenantId(null)
                                    })
                                    .catch((err: Error) => {
                                      setActionError(err.message)
                                    })
                                })
                              }}
                              className="flex gap-2"
                            >
                              <input type="hidden" name="tenantId" value={tenant.id} />
                              <button
                                type="submit"
                                disabled={isPending}
                                className="px-2 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
                                title={t('common.save')}
                              >
                                <Save size={16} />
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setEditingTenantId(null)}
                                className="px-2 py-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                                title={t('common.cancel')}
                              >
                                <X size={16} />
                              </button>
                            </form>
                          ) : (
                            <div className="flex gap-2">
                              {tenant.status !== 'suspended' && (
                                <button
                                  type="button"
                                  onClick={() => setEditingTenantId(tenant.id)}
                                  className="px-2 py-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                                  title={t('common.edit')}
                                >
                                  <Edit2 size={16} />
                                </button>
                              )}
                              
                              {tenant.status === 'suspended' ? (
                                <form action={(formData) => {
                                  setActionError(null)
                                  startTransition(() => {
                                    reactivateTenantAction(formData).catch((err: Error) => {
                                      setActionError(err.message)
                                    })
                                  })
                                }}>
                                  <input type="hidden" name="tenantId" value={tenant.id} />
                                  <button
                                    type="submit"
                                    disabled={isPending}
                                    className="px-3 py-1.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition text-sm font-medium w-full"
                                  >
                                    {t('admin.table.reactivate')}
                                  </button>
                                </form>
                              ) : (
                                <form action={(formData) => {
                                  setActionError(null)
                                  startTransition(() => {
                                    suspendTenantAction(formData).catch((err: Error) => {
                                      setActionError(err.message)
                                    })
                                  })
                                }}>
                                  <input type="hidden" name="tenantId" value={tenant.id} />
                                  <button
                                    type="submit"
                                    disabled={isPending}
                                    className="px-3 py-1.5 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition text-sm font-medium w-full"
                                  >
                                    {t('admin.table.suspend')}
                                  </button>
                                </form>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <ChatbotWidget tenantSlug={currentUser.tenantSlug} />
    </div>
  )
}

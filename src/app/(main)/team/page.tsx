'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Users, Mail, Shield, Crown, UserPlus, Copy, Check, X, Clock, Loader2, ChevronRight, Building2, UserCheck, BadgeAlert, Sparkles } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

interface Invitation {
  id: string
  token: string
  email: string
  role: string
  status: string
  expires_at: string
  created_at: string
  invited_by?: { full_name: string; email: string }
}

interface TeamMember {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

type TeamFilter = 'all' | 'active' | 'admin' | 'agent'

const KPI_STYLES = {
  all: {
    shell: 'border-slate-200 bg-white',
    icon: 'bg-slate-900 text-white',
    value: 'text-slate-900',
  },
  active: {
    shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
    icon: 'bg-emerald-500 text-white',
    value: 'text-emerald-700',
  },
  admin: {
    shell: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
    icon: 'bg-amber-500 text-white',
    value: 'text-amber-700',
  },
  agent: {
    shell: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white',
    icon: 'bg-blue-500 text-white',
    value: 'text-blue-700',
  },
} as const

export default function TeamPage() {
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('agent')
  const [tenantName, setTenantName] = useState<string>('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('agent')
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [showInvitations, setShowInvitations] = useState(false)
  const [inviteErrorCode, setInviteErrorCode] = useState('')
  const [inviteErrorMessage, setInviteErrorMessage] = useState('')
  const [inviteSuccessUrl, setInviteSuccessUrl] = useState('')
  const [inviting, setInviting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<TeamFilter>('all')
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()
  const canManageInvitations = currentUserRole === 'owner' || currentUserRole === 'admin'

  useEffect(() => {
    loadData()
  }, [])

  const resolveInvitationError = (errorCode?: string | null, fallback?: string) => {
    switch (errorCode) {
      case 'email_required':
        return t('team.emailRequired')
      case 'invalid_email':
        return t('team.invalidEmail')
      case 'user_exists':
        return t('teamExtra.errors.userExists')
      case 'invitation_exists':
        return t('teamExtra.errors.invitationExists')
      case 'invalid_role':
        return t('teamExtra.errors.invalidRole')
      case 'tenant_suspended':
        return t('teamExtra.errors.tenantSuspended')
      case 'tenant_inactive':
        return t('teamExtra.errors.tenantInactive')
      case 'forbidden':
        return t('teamExtra.errors.forbidden')
      case 'load_invitations_failed':
        return t('teamExtra.errors.loadInvitations')
      case 'cancel_invitation_failed':
        return t('teamExtra.errors.cancelFailed')
      case 'copy_failed':
        return t('teamExtra.errors.copyFailed')
      default:
        return fallback || t('team.connection')
    }
  }

  const loadData = async () => {
    try {
      setInviteErrorCode('')
      setInviteErrorMessage('')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setCurrentUser(user)

      const { data: profile } = await supabase
        .from('users')
        .select('id, tenant_id, role')
        .eq('id', user.id)
        .single()

      if (profile) {
        setCurrentUserRole(profile.role)

        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', profile.tenant_id)
          .single()
        
        if (tenant) {
          setTenantName(tenant.name)
        }

        const { data: members } = await supabase
          .from('users')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .order('created_at')
        
        setTeamMembers(members || [])

        if (profile.role === 'owner' || profile.role === 'admin') {
          const res = await fetch('/api/invitations')
          if (res.ok) {
            const data = await res.json()
            setInvitations(data.invitations || [])
          } else {
            const data = await res.json().catch(() => null)
            setInviteErrorCode(data?.errorCode || 'load_invitations_failed')
            setInviteErrorMessage(data?.error || '')
          }
        }
      }
    } catch (error) {
      console.error('Error loading:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteErrorCode('')
    setInviteErrorMessage('')
    setInviteSuccessUrl('')
    setInviting(true)

    if (!inviteEmail.trim()) {
      setInviteErrorCode('email_required')
      setInviteErrorMessage('')
      setInviting(false)
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setInviteErrorCode('invalid_email')
      setInviteErrorMessage('')
      setInviting(false)
      return
    }

    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })

      const data = await response.json()

      if (!response.ok) {
        setInviteErrorCode(data.errorCode || '')
        setInviteErrorMessage(data.error || t('team.inviteError'))
      } else {
        setInviteSuccessUrl(data.inviteUrl)
        setInviteEmail('')
        setShowInviteForm(false)
        loadData()
      }
    } catch (err) {
      setInviteErrorMessage(t('team.connection'))
    } finally {
      setInviting(false)
    }
  }

  const copyInviteLink = async (inviteUrl: string, id: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      setInviteErrorCode('copy_failed')
      setInviteErrorMessage('')
    }
  }

  const cancelInvitation = async (id: string) => {
    if (!confirm(t('team.cancelInvitation'))) return
    setDeletingId(id)

    try {
      const response = await fetch(`/api/invitations?id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        loadData()
      } else {
        const data = await response.json().catch(() => null)
        setInviteErrorCode(data?.errorCode || 'cancel_invitation_failed')
        setInviteErrorMessage(data?.error || '')
      }
    } catch (err) {
      console.error('Error cancelling invitation:', err)
      setInviteErrorCode('cancel_invitation_failed')
      setInviteErrorMessage('')
    } finally {
      setDeletingId(null)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown size={16} className="text-violet-500" />
      case 'admin': return <Crown size={16} className="text-amber-500" />
      case 'coordinator': return <Shield size={16} className="text-blue-500" />
      default: return <Users size={16} className="text-slate-400" />
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return t('team.roles.owner')
      case 'admin': return t('team.roles.admin')
      case 'coordinator': return t('team.roles.coordinator')
      case 'agent': return t('team.roles.agent')
      default: return role
    }
  }

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-violet-100 text-violet-700'
      case 'admin': return 'bg-amber-100 text-amber-700'
      case 'coordinator': return 'bg-blue-100 text-blue-700'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'accepted': return 'bg-green-100 text-green-700'
      case 'expired': return 'bg-red-100 text-red-700'
      case 'cancelled': return 'bg-slate-100 text-slate-500'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  const filteredMembers = teamMembers.filter((member) => {
    switch (activeFilter) {
      case 'active':
        return member.is_active
      case 'admin':
        return member.role === 'admin'
      case 'agent':
        return member.role === 'agent'
      default:
        return true
    }
  })

  const pendingInvitations = invitations.filter((invitation) => invitation.status === 'pending')

  const metricCards: Array<{ key: TeamFilter; label: string; value: number; icon: typeof Users }> = [
    { key: 'all', label: t('teamExtra.totalMembers'), value: teamMembers.length, icon: Users },
    { key: 'active', label: t('teamExtra.activeMembers'), value: teamMembers.filter((member) => member.is_active).length, icon: UserCheck },
    { key: 'admin', label: t('teamExtra.admins'), value: teamMembers.filter((member) => member.role === 'admin').length, icon: Crown },
    { key: 'agent', label: t('teamExtra.agents'), value: teamMembers.filter((member) => member.role === 'agent').length, icon: Shield },
  ]

  const formatJoinedDate = (value: string) => {
    const date = new Date(value)
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }

if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-stone-100 flex items-center justify-center">
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <section className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_40%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0 space-y-4">
                <nav className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900">
                    {t('dashboard.title')}
                  </Link>
                  <ChevronRight size={14} className="text-slate-300" />
                  <span className="font-medium text-slate-900">{t('team.title')}</span>
                </nav>
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                    <Users size={22} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('team.title')}</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('teamExtra.subtitle')}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:min-w-[320px] xl:items-end">
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{tenantName || t('team.title')}</p>
                  <p className="mt-1 text-sm font-medium text-slate-700">{t('teamExtra.inviteCtaSubtitle')}</p>
                </div>
                {canManageInvitations ? (
                  <div className="flex flex-wrap gap-3 xl:justify-end">
                    <button
                      onClick={() => setShowInvitations(!showInvitations)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Mail size={16} className="text-blue-600" />
                      {t('team.invitations', { count: pendingInvitations.length })}
                    </button>
                    <button
                      onClick={() => setShowInviteForm(!showInviteForm)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"
                    >
                      <UserPlus size={16} />
                      {t('team.inviteMember')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {showInviteForm && canManageInvitations && (
          <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Mail size={18} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{t('team.inviteNew')}</h3>
                <p className="mt-1 text-sm text-slate-500">{t('teamExtra.inviteCtaSubtitle')}</p>
              </div>
            </div>
            <form onSubmit={handleInvite} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('auth.signup.emailPlaceholder')}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              >
                <option value="agent">{t('team.roles.agent')}</option>
                <option value="coordinator">{t('team.roles.coordinator')}</option>
                <option value="admin">{t('team.roles.admin')}</option>
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {inviting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                {inviting ? t('teamExtra.sending') : t('teamExtra.send')}
              </button>
            </form>
            {(inviteErrorCode || inviteErrorMessage) && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {inviteErrorCode ? resolveInvitationError(inviteErrorCode, inviteErrorMessage) : inviteErrorMessage}
              </div>
            )}
            {inviteSuccessUrl && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {t('team.inviteSent', { url: inviteSuccessUrl })}
              </div>
            )}
          </section>
        )}

        {!canManageInvitations && (
          <section className="mb-6 rounded-3xl border border-amber-200 bg-[linear-gradient(135deg,_#fff7ed_0%,_#ffffff_100%)] p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <BadgeAlert size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-amber-900">{t('teamExtra.permissionTitle')}</h3>
                <p className="mt-1 text-sm leading-6 text-amber-800">{t('teamExtra.permissionDescription')}</p>
              </div>
            </div>
          </section>
        )}

        {showInvitations && canManageInvitations && (
          <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{t('teamExtra.pendingInvitationsTitle')}</h3>
                <p className="mt-1 text-sm text-slate-500">{t('teamExtra.pendingInvitationsSubtitle')}</p>
              </div>
            </div>
            {pendingInvitations.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
                <Mail className="mx-auto mb-4 text-slate-300" size={30} />
                <p className="text-sm font-medium text-slate-700">{t('teamExtra.noPendingInvitations')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingInvitations.map((inv) => {
                  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?invite=${inv.token}`
                  const isCopied = copiedId === inv.id
                  const isDeleting = deletingId === inv.id

                  return (
                    <article key={inv.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-slate-300 hover:bg-white">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{inv.email}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getRoleBadgeClass(inv.role)}`}>{getRoleLabel(inv.role)}</span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(inv.status)}`}>{t(`team.statuses.${inv.status}`)}</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">
                              <Clock size={12} />
                              {new Date(inv.expires_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          <button
                            onClick={() => copyInviteLink(inviteUrl, inv.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            {isCopied ? t('teamExtra.copied') : t('teamExtra.copyLink')}
                          </button>
                          {inv.status === 'pending' && (
                            <button
                              onClick={() => cancelInvitation(inv.id)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
                            >
                              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                              {t('teamExtra.cancel')}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => {
            const Icon = card.icon
            const style = KPI_STYLES[card.key]
            return (
              <button
                key={card.key}
                onClick={() => setActiveFilter(card.key)}
                className={`rounded-3xl border p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${style.shell} ${activeFilter === card.key ? 'border-slate-300 ring-2 ring-slate-300' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-500">{card.label}</p>
                    <p className={`text-3xl font-semibold tracking-tight ${style.value}`}>{card.value}</p>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm ${style.icon}`}>
                    <Icon size={18} />
                  </div>
                </div>
              </button>
            )
          })}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{t('teamExtra.membersTitle')}</h3>
                <p className="mt-1 text-sm text-slate-500">{t('teamExtra.membersSubtitle')}</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                <Building2 size={14} />
                {tenantName || t('team.title')}
              </div>
            </div>
          </div>
          {filteredMembers.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Users className="mx-auto mb-4 text-slate-300" size={44} />
              <h3 className="text-lg font-semibold text-slate-900">{t('teamExtra.noMembers')}</h3>
              <p className="mt-2 text-slate-500">{t('teamExtra.noMembersText')}</p>
            </div>
          ) : (
            <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-2">
              {filteredMembers.map((member) => (
                <article key={member.id} className="rounded-3xl border border-slate-200 bg-slate-50/60 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-base font-semibold text-slate-700">
                      {member.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || member.email[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-semibold text-slate-900">{member.full_name || t('teamExtra.noName')}</p>
                        {member.id === currentUser?.id ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{t('teamExtra.you')}</span> : null}
                      </div>
                      <p className="mt-2 flex items-center gap-2 truncate text-sm text-slate-500">
                        <Mail size={14} />
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${getRoleBadgeClass(member.role)}`}>
                      {getRoleIcon(member.role)}
                      {getRoleLabel(member.role)}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${member.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {member.is_active ? t('teamExtra.statusActive') : t('teamExtra.inactive')}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm text-slate-500">
                    <span>{t('teamExtra.memberSince')}</span>
                    <span className="font-medium text-slate-700">{formatJoinedDate(member.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

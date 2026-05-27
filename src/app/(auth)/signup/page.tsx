'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, UserPlus, CheckCircle, AlertCircle, Building2, ShieldCheck } from 'lucide-react'
import AuthHeroShell from '@/components/auth/AuthHeroShell'
import { useI18n } from '@/i18n/I18nProvider'

interface InviteInfo {
  email: string
  role: string
  tenant_name: string
  tenant_id: string
}

interface InvitationVerificationResponse {
  invitation?: {
    email: string
    role: string
    tenant_id: string
  }
  tenant_name?: string
  error?: string
  errorCode?: string
}

function SignupForm() {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [inviteLoading, setInviteLoading] = useState(true)
  const [invalidInvite, setInvalidInvite] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useI18n()
  const inputClassName = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/60'

  const getInviteErrorMessage = (errorCode?: string, fallback?: string) => {
    switch (errorCode) {
      case 'invite_not_found':
        return t('auth.signup.errors.inviteNotFound')
      case 'invite_expired':
        return t('auth.signup.errors.inviteExpired')
      case 'invite_used':
        return t('auth.signup.errors.inviteUsed')
      case 'tenant_suspended':
        return t('auth.signup.errors.tenantSuspended')
      case 'tenant_inactive':
        return t('auth.signup.errors.tenantInactive')
      case 'tenant_capacity_reached':
        return t('auth.signup.errors.tenantCapacityReached')
      case 'invalid_invite_role':
        return t('auth.signup.errors.invalidInviteRole')
      default:
        return fallback || t('auth.signup.errors.inviteVerifyFailed')
    }
  }

  const verifyInvitation = async (inviteToken: string) => {
    const response = await fetch(`/api/invitations/verify?token=${encodeURIComponent(inviteToken)}`)
    const data = (await response.json()) as InvitationVerificationResponse

    return { response, data }
  }

  useEffect(() => {
    const checkInvite = async () => {
      const inviteToken = searchParams.get('invite')
      
      if (!inviteToken) {
        setInviteLoading(false)
        return
      }

      try {
        const { response, data } = await verifyInvitation(inviteToken)

        if (response.ok && data.invitation) {
          setInviteInfo({
            email: data.invitation.email,
            role: data.invitation.role,
            tenant_name: data.tenant_name || t('auth.signup.unknownTenantName'),
            tenant_id: data.invitation.tenant_id,
          })
        } else {
          setInvalidInvite(true)
          setError(getInviteErrorMessage(data.errorCode, data.error))
        }
      } catch (err) {
        setInvalidInvite(true)
        setError(t('auth.signup.errors.inviteVerifyFailed'))
      } finally {
        setInviteLoading(false)
      }
    }

    checkInvite()
  }, [searchParams, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password.length < 6) {
      setError(t('auth.signup.errors.passwordMin'))
      setLoading(false)
      return
    }

    if (inviteInfo) {
      const inviteToken = searchParams.get('invite')

      if (!inviteToken) {
        setError(t('auth.signup.errors.inviteVerifyFailed'))
        setLoading(false)
        return
      }

      try {
        const { response, data } = await verifyInvitation(inviteToken)

        if (!response.ok || !data.invitation) {
          setInvalidInvite(true)
          setError(getInviteErrorMessage(data.errorCode, data.error))
          setLoading(false)
          return
        }
      } catch {
        setError(t('auth.signup.errors.inviteVerifyFailed'))
        setLoading(false)
        return
      }

      const supabase = createClient()
      const { data: signupData, error: authError } = await supabase.auth.signUp({
        email: inviteInfo.email,
        password,
        options: {
          data: {
            full_name: fullName,
            invite_token: inviteToken,
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (signupData.user && !signupData.session) {
        setSuccess(true)
        setConfirmEmail(inviteInfo.email)
        setLoading(false)
        return
      }

      if (signupData.session) {
        router.push('/dashboard')
        router.refresh()
      }
    }

    setLoading(false)
  }

  if (inviteLoading) {
    return (
      <AuthHeroShell
        eyebrow={t('auth.signup.inviteLoadingEyebrow')}
        title={t('auth.signup.inviteLoadingTitle')}
        description={t('auth.signup.inviteLoadingDescription')}
        panelTitle={t('auth.signup.verifyingInvitation')}
        panelDescription={t('auth.signup.inviteLoadingPanelDescription')}
      >
        <div className="py-8 text-center text-slate-500">{t('auth.signup.verifyingInvitation')}</div>
      </AuthHeroShell>
    )
  }

  if (success) {
    return (
      <AuthHeroShell
        eyebrow={t('auth.signup.successEyebrow')}
        title={t('auth.signup.successTitle')}
        description={t('auth.signup.successDescription')}
        panelTitle={t('auth.signup.accountCreated')}
        panelDescription={t('auth.signup.confirmationSent')}
      >
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle size={32} />
          </div>
          <p className="mb-2 text-sm uppercase tracking-[0.16em] text-slate-400">{t('auth.signup.confirmationEmailLabel')}</p>
          <p className="mb-6 text-lg font-semibold text-slate-950">{confirmEmail}</p>
          <p className="text-sm leading-6 text-slate-500">{t('auth.signup.confirmationHint')}</p>
          <Link
            href="/login"
            className="mt-8 inline-flex rounded-2xl bg-slate-950 px-6 py-3 font-semibold text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-900"
          >
            {t('auth.signup.goToLogin')}
          </Link>
        </div>
      </AuthHeroShell>
    )
  }

  const isInviteMode = !!inviteInfo && !invalidInvite
  const heroEyebrow = isInviteMode ? t('auth.signup.teamInvitationEyebrow') : invalidInvite ? t('auth.signup.invitationIssueEyebrow') : t('auth.signup.approvalEyebrow')
  const heroTitle = isInviteMode
    ? t('auth.signup.inviteTitle', { tenant: inviteInfo.tenant_name })
    : invalidInvite
      ? t('auth.signup.invalidHeroTitle')
      : t('auth.signup.approvalTitle')
  const heroDescription = isInviteMode
    ? t('auth.signup.inviteHeroDescription')
    : invalidInvite
      ? t('auth.signup.invalidHeroDescription')
      : t('auth.signup.approvalDescription')

  return (
    <AuthHeroShell
      eyebrow={heroEyebrow}
      title={heroTitle}
      description={heroDescription}
      panelTitle={isInviteMode ? t('auth.signup.inviteTitle', { tenant: inviteInfo.tenant_name }) : invalidInvite ? t('auth.signup.invalidInvitation') : t('auth.signup.approvalPanelTitle')}
      panelDescription={isInviteMode ? t('auth.signup.invitedAs', { role: t(`roles.${inviteInfo.role}`) }) : invalidInvite ? error : t('auth.signup.approvalPanelDescription')}
    >
      {isInviteMode ? (
        <>
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-blue-600">
              <Building2 size={20} />
            </div>
            <div>
              <p className="font-semibold text-blue-900">{inviteInfo.tenant_name}</p>
              <p className="text-blue-700/80">{t('auth.signup.invitedAs', { role: t(`roles.${inviteInfo.role}`) })}</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {t('auth.signup.fullName')}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('auth.signup.fullNamePlaceholder')}
                required
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {t('auth.signup.email')}
              </label>
              <input
                type="email"
                value={inviteInfo.email}
                disabled
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-500"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">
                  {t('auth.signup.password')}
                </label>
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('auth.signup.passwordMetaSecure')}</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.signup.passwordPlaceholder')}
                  required
                  minLength={6}
                  className={`${inputClassName} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 py-3.5 font-semibold text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="animate-spin">...</span>
              ) : (
                <>
                  <UserPlus size={20} />
                  {t('auth.signup.joinTeam')}
                </>
              )}
            </button>
          </form>
        </>
      ) : (
        <>
          {invalidInvite && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-700">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-600">
                <AlertCircle size={20} />
              </div>
              <div>
                <p className="font-semibold text-red-900">{t('auth.signup.invalidInvitation')}</p>
                <p className="text-red-700/80">{error}</p>
              </div>
            </div>
          )}

          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-600">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="font-semibold text-emerald-950">{t('auth.signup.approvalNoticeTitle')}</p>
              <p className="mt-1 leading-6 text-emerald-800/90">{t('auth.signup.approvalNoticeDescription')}</p>
            </div>
          </div>

          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-5 text-sm leading-6 text-slate-600">
            <p>{t('auth.signup.approvalHelp')}</p>
          </div>

          <Link
            href="/login"
            className="mt-6 flex w-full items-center justify-center rounded-2xl bg-slate-950 py-3.5 font-semibold text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-900"
          >
            {t('auth.signup.backToLogin')}
          </Link>
        </>
      )}
    </AuthHeroShell>
  )
}

export default function SignupPage() {
  const { t } = useI18n()

  return (
    <Suspense fallback={
      <AuthHeroShell
        eyebrow={t('auth.signup.suspenseEyebrow')}
        title={t('auth.signup.suspenseTitle')}
        description={t('auth.signup.suspenseDescription')}
        panelTitle={t('auth.signup.suspensePanelTitle')}
        panelDescription={t('auth.signup.suspensePanelDescription')}
      >
        <div className="py-8 text-center text-slate-500">{t('common.loading')}</div>
      </AuthHeroShell>
    }>
      <SignupForm />
    </Suspense>
  )
}

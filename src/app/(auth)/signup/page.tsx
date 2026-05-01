'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, UserPlus, CheckCircle, AlertCircle, Building2 } from 'lucide-react'
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
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
            tenant_name: data.tenant_name || 'Unknown',
            tenant_id: data.invitation.tenant_id,
          })
          setEmail(data.invitation.email)
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
    } else {
      if (!tenantName.trim()) {
          setError(t('auth.signup.errors.tenantRequired'))
        setLoading(false)
        return
      }

      const supabase = createClient()
      const tenantSlug = tenantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            tenant_name: tenantName,
            tenant_slug: tenantSlug,
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (data.user && !data.session) {
        setSuccess(true)
        setConfirmEmail(email)
        setLoading(false)
        return
      }

      if (data.session) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, tenant_id')
          .eq('id', data.user?.id)
          .single()

        if (!profile?.tenant_id) {
          setError(t('auth.signup.errors.tenantCreate'))
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        router.push('/dashboard')
        router.refresh()
      }
    }

    setLoading(false)
  }

  if (inviteLoading) {
    return (
      <AuthHeroShell
        eyebrow="Secure Access"
        title="Preparing your access"
        description="We are validating your invitation and getting the right onboarding path ready."
        panelTitle={t('auth.signup.verifyingInvitation')}
        panelDescription="This takes only a moment."
      >
        <div className="py-8 text-center text-slate-500">{t('auth.signup.verifyingInvitation')}</div>
      </AuthHeroShell>
    )
  }

  if (success) {
    return (
      <AuthHeroShell
        eyebrow="Account Ready"
        title="Your workspace is almost live"
        description="We have created your access. Confirm the email to enter a secure real estate workspace."
        panelTitle={t('auth.signup.accountCreated')}
        panelDescription={t('auth.signup.confirmationSent')}
      >
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle size={32} />
          </div>
          <p className="mb-2 text-sm uppercase tracking-[0.16em] text-slate-400">Confirmation email</p>
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
  const heroEyebrow = isInviteMode ? 'Team Invitation' : invalidInvite ? 'Invitation Issue' : 'Initial Setup'
  const heroTitle = isInviteMode
    ? `Join ${inviteInfo.tenant_name}`
    : invalidInvite
      ? 'This invitation is no longer available'
      : 'Create your real estate workspace'
  const heroDescription = isInviteMode
    ? 'Your team has already prepared access. Complete your profile and start collaborating with full context from day one.'
    : invalidInvite
      ? 'The token cannot be used anymore. You can request a new invite or create your own secure workspace.'
      : 'Set up your tenant, owner account and secure access in a single premium onboarding flow.'

  return (
    <AuthHeroShell
      eyebrow={heroEyebrow}
      title={heroTitle}
      description={heroDescription}
      panelTitle={isInviteMode ? t('auth.signup.inviteTitle', { tenant: inviteInfo.tenant_name }) : invalidInvite ? t('auth.signup.invalidInvitation') : t('auth.signup.createTitle')}
      panelDescription={isInviteMode ? t('auth.signup.invitedAs', { role: t(`roles.${inviteInfo.role}`) }) : invalidInvite ? error : t('auth.brandSubtitle')}
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
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Secure</span>
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
      ) : invalidInvite ? (
        <>
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-600">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="font-semibold text-red-900">{t('auth.signup.invalidInvitation')}</p>
              <p className="text-red-700/80">{error}</p>
            </div>
          </div>
          <Link
            href="/signup"
            className="flex w-full items-center justify-center rounded-2xl bg-slate-950 py-3.5 font-semibold text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-900"
          >
            {t('auth.signup.createOwnAccount')}
          </Link>
        </>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {t('auth.signup.companyName')}
              </label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder={t('auth.signup.companyPlaceholder')}
                required
                className={inputClassName}
              />
            </div>

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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.signup.emailPlaceholder')}
                required
                className={inputClassName}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">
                  {t('auth.signup.password')}
                </label>
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Owner access</span>
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
                  {t('auth.signup.submit')}
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {t('auth.signup.alreadyAccount')}{' '}
            <Link href="/login" className="font-semibold text-slate-900 transition hover:text-blue-700">
              {t('auth.signup.loginLink')}
            </Link>
          </p>
        </>
      )}
    </AuthHeroShell>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <AuthHeroShell
        eyebrow="Secure Access"
        title="Preparing your onboarding"
        description="We are loading the right access flow for your workspace."
        panelTitle="Loading"
        panelDescription="Please wait a moment."
      >
        <div className="py-8 text-center text-slate-500">Loading...</div>
      </AuthHeroShell>
    }>
      <SignupForm />
    </Suspense>
  )
}

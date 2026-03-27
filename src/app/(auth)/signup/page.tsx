'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, UserPlus, CheckCircle, AlertCircle, Building2 } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

interface InviteInfo {
  email: string
  role: string
  tenant_name: string
  tenant_id: string
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

  useEffect(() => {
    const checkInvite = async () => {
      const inviteToken = searchParams.get('invite')
      
      if (!inviteToken) {
        setInviteLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/invitations/verify?token=${inviteToken}`)
        const data = await response.json()

        if (response.ok && data.invitation) {
          setInviteInfo({
            email: data.invitation.email,
            role: data.invitation.role,
            tenant_name: data.tenant_name,
            tenant_id: data.invitation.tenant_id,
          })
          setEmail(data.invitation.email)
        } else {
          setInvalidInvite(true)
          setError(data.error || t('auth.signup.errors.inviteNotFound'))
        }
      } catch (err) {
        setInvalidInvite(true)
        setError(t('auth.signup.errors.inviteVerifyFailed'))
      } finally {
        setInviteLoading(false)
      }
    }

    checkInvite()
  }, [searchParams])

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
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signUp({
        email: inviteInfo.email,
        password,
        options: {
          data: {
            full_name: fullName,
            invite_token: searchParams.get('invite'),
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .update({
            full_name: fullName,
            tenant_id: inviteInfo.tenant_id,
            role: inviteInfo.role,
            is_active: true,
          })
          .eq('id', data.user.id)

        if (profileError) {
          setError(t('auth.signup.errors.profileSetup'))
          setLoading(false)
          return
        }

        await supabase
          .from('invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('token', searchParams.get('invite'))

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
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500">{t('auth.signup.verifyingInvitation')}</div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-green-500" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('auth.signup.accountCreated')}</h2>
          <p className="text-slate-500 mb-4">
            {t('auth.signup.confirmationSent')}
          </p>
          <p className="font-medium text-slate-900 mb-6">{confirmEmail}</p>
          <p className="text-slate-500 text-sm">
            {t('auth.signup.confirmationHint')}
          </p>
          <Link
            href="/login"
            className="inline-block mt-6 px-6 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
          >
            {t('auth.signup.goToLogin')}
          </Link>
        </div>
      </div>
    )
  }

  const isInviteMode = !!inviteInfo && !invalidInvite

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">I</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">InmoCRM</h1>
          <p className="text-slate-500 mt-1">{t('auth.brandSubtitle')}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {isInviteMode ? (
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 className="text-blue-500" size={28} />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{t('auth.signup.inviteTitle', { tenant: inviteInfo.tenant_name })}</h2>
                <p className="text-slate-500 mt-2">
                  {t('auth.signup.invitedAs', { role: t(`roles.${inviteInfo.role}`) })}
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('auth.signup.fullName')}
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('auth.signup.fullNamePlaceholder')}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('auth.signup.email')}
                  </label>
                  <input
                    type="email"
                    value={inviteInfo.email}
                    disabled
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('auth.signup.password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('auth.signup.passwordPlaceholder')}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                    <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="text-red-500" size={28} />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{t('auth.signup.invalidInvitation')}</h2>
                <p className="text-slate-500 mt-2">{error}</p>
              </div>
              <Link
                href="/signup"
                className="block w-full text-center bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition"
              >
                {t('auth.signup.createOwnAccount')}
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">{t('auth.signup.createTitle')}</h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('auth.signup.companyName')}
                  </label>
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder={t('auth.signup.companyPlaceholder')}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('auth.signup.fullName')}
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('auth.signup.fullNamePlaceholder')}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('auth.signup.email')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.signup.emailPlaceholder')}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t('auth.signup.password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('auth.signup.passwordPlaceholder')}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                    <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            </>
          )}

          {!isInviteMode && !invalidInvite && (
            <p className="text-center text-slate-500 mt-6">
              {t('auth.signup.alreadyAccount')}{' '}
              <Link href="/login" className="text-blue-500 font-medium hover:underline">
                {t('auth.signup.loginLink')}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500">Loading...</div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  )
}

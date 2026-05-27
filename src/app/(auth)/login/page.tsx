'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import AuthHeroShell from '@/components/auth/AuthHeroShell'
import { useI18n } from '@/i18n/I18nProvider'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()
  const inputClassName = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/60'

  const getLoginErrorMessage = (message: string) => {
    const normalized = message.toLowerCase()

    if (normalized.includes('invalid login credentials')) {
      return t('auth.login.errors.invalidCredentials')
    }

    if (normalized.includes('email not confirmed')) {
      return t('auth.login.errors.emailNotConfirmed')
    }

    if (
      normalized.includes('failed to fetch') ||
      normalized.includes('fetch failed') ||
      normalized.includes('networkerror') ||
      normalized.includes('network request failed')
    ) {
      return t('auth.login.errors.connection')
    }

    return message
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(getLoginErrorMessage(error.message))
        setLoading(false)
      } else {
        router.replace('/')
        router.refresh()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setError(getLoginErrorMessage(message || t('auth.login.errors.connection')))
      setLoading(false)
    }
  }

  return (
    <AuthHeroShell
      eyebrow={t('auth.login.heroEyebrow')}
      title={t('auth.login.heroTitle')}
      description={t('auth.login.heroDescription')}
      panelTitle={t('auth.login.title')}
      panelDescription={t('auth.brandSubtitle')}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            {t('auth.login.email')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.login.emailPlaceholder')}
            required
            className={inputClassName}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">
              {t('auth.login.password')}
            </label>
            <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('auth.login.passwordMeta')}</span>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
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
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
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
              <LogIn size={20} />
              {t('auth.login.submit')}
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        {t('auth.login.noAccount')}{' '}
        <Link href="/signup" className="font-semibold text-slate-900 transition hover:text-blue-700">
          {t('auth.login.signupLink')}
        </Link>
      </p>
    </AuthHeroShell>
  )
}

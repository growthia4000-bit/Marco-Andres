'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Check, ChevronRight, AlertCircle, Star, Building2, Users, Zap } from 'lucide-react'
import { Suspense } from 'react'
import { useI18n } from '@/i18n/I18nProvider'

function RegisterForm() {
  const { t } = useI18n()
  const searchParams = useSearchParams()

  const PLANS = [
    {
      key: 'starter',
      name: 'Starter',
      price: 29,
      description: t('register.plans.starter.desc'),
      icon: Building2,
      color: 'slate',
      popular: false,
      features: (['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const).map(k => t(`register.plans.starter.${k}`)),
    },
    {
      key: 'profesional',
      name: 'Profesional',
      price: 59,
      description: t('register.plans.profesional.desc'),
      icon: Users,
      color: 'blue',
      popular: true,
      features: (['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const).map(k => t(`register.plans.profesional.${k}`)),
    },
    {
      key: 'premium',
      name: 'Premium',
      price: 99,
      description: t('register.plans.premium.desc'),
      icon: Zap,
      color: 'amber',
      popular: false,
      features: (['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const).map(k => t(`register.plans.premium.${k}`)),
    },
  ]

  const [step, setStep] = useState<'plan' | 'details'>(
    searchParams.get('plan') ? 'details' : 'plan'
  )
  const [selectedPlan, setSelectedPlan] = useState<string>(
    searchParams.get('plan') || ''
  )
  const [form, setForm] = useState({ agency_name: '', full_name: '', email: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSelectPlan = (key: string) => {
    setSelectedPlan(key)
    setStep('details')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_key: selectedPlan,
          agency_name: form.agency_name,
          full_name: form.full_name,
          email: form.email,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || t('register.errorPayment'))
        setLoading(false)
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setError(t('register.errorConnection'))
      setLoading(false)
    }
  }

  const plan = PLANS.find((p) => p.key === selectedPlan)

  const inputClass =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100/60'

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Background image */}
      <Image
        src="/design/auth-hero-real-estate-duo.png"
        alt="Real estate"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[72%_center]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,250,252,0.97)_0%,rgba(248,250,252,0.93)_28%,rgba(248,250,252,0.72)_44%,rgba(248,250,252,0.34)_58%,rgba(15,23,42,0.10)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.62),transparent_34%)]" />

      <div className="relative z-10 flex min-h-screen flex-col px-4 pb-6 pt-10 sm:px-6 sm:pt-14">
        {/* Logo / nav */}
        <div className="mb-6 flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-slate-950">Growthia Global CRM</span>
          <span className="text-slate-400">/</span>
          <span className="text-sm text-slate-500">{t('register.breadcrumb')}</span>
        </div>

        {step === 'plan' ? (
          /* ── STEP 1: Plan selector ── */
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-2 inline-flex items-center rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 backdrop-blur-sm">
              {t('register.step1Badge')}
            </div>
            <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {t('register.step1Title')}
            </h1>
            <p className="mb-8 text-slate-500">
              {t('register.step1Subtitle')}
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              {PLANS.map((p) => {
                const Icon = p.icon
                return (
                  <button
                    key={p.key}
                    onClick={() => handleSelectPlan(p.key)}
                    className={`relative flex flex-col rounded-3xl border-2 bg-white/90 p-6 text-left shadow-sm backdrop-blur-sm transition hover:shadow-lg focus:outline-none ${
                      p.popular
                        ? 'border-blue-500 shadow-blue-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {p.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white shadow">
                          <Star size={11} className="fill-white" /> {t('register.popular')}
                        </span>
                      </div>
                    )}

                    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
                      p.popular ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Icon size={24} />
                    </div>

                    <div className="mb-1 text-xl font-bold text-slate-950">{p.name}</div>
                    <div className="mb-3 text-sm text-slate-500">{p.description}</div>

                    <div className="mb-5 flex items-end gap-1">
                      <span className="text-3xl font-bold text-slate-950">{p.price}€</span>
                      <span className="mb-0.5 text-sm text-slate-400">{t('register.perMonth')}</span>
                    </div>

                    <ul className="mb-6 space-y-2">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                          <Check size={15} className={`mt-0.5 flex-shrink-0 ${p.popular ? 'text-blue-500' : 'text-emerald-500'}`} />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className={`mt-auto flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition ${
                      p.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-950 text-white hover:bg-slate-800'
                    }`}>
                      {t('register.choosePlan')} {p.name}
                      <ChevronRight size={16} />
                    </div>
                  </button>
                )
              })}
            </div>

            <p className="mt-6 text-center text-sm text-slate-400">
              {t('register.alreadyAccount')}{' '}
              <Link href="/login" className="font-medium text-slate-700 hover:underline">
                {t('register.loginLink')}
              </Link>
            </p>
          </div>
        ) : (
          /* ── STEP 2: Account details ── */
          <div className="mx-auto w-full max-w-xl">
            <button
              onClick={() => setStep('plan')}
              className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              {t('register.step2Back')}
            </button>

            <div className="mb-2 inline-flex items-center rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 backdrop-blur-sm">
              {t('register.step2Badge')}
            </div>
            <h1 className="mb-1 text-3xl font-semibold tracking-tight text-slate-950">
              {t('register.step2Title')}
            </h1>
            <p className="mb-6 text-slate-500">
              {t('register.step2Subtitle')}
            </p>

            {/* Selected plan summary */}
            {plan && (
              <div className={`mb-5 flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                plan.popular ? 'border-blue-200 bg-blue-50/80' : 'border-slate-200 bg-slate-50/80'
              }`}>
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                  plan.popular ? 'bg-blue-600 text-white' : 'bg-slate-950 text-white'
                }`}>
                  {plan.price}€
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Plan {plan.name}</p>
                  <p className="text-xs text-slate-500">{plan.description}</p>
                </div>
                <button
                  onClick={() => setStep('plan')}
                  className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
                >
                  {t('register.changePlan')}
                </button>
              </div>
            )}

            {/* Form card */}
            <div className="rounded-[30px] border border-white/70 bg-white/86 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t('register.agencyNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={form.agency_name}
                    onChange={(e) => setForm((f) => ({ ...f, agency_name: e.target.value }))}
                    placeholder={t('register.agencyNamePlaceholder')}
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t('register.fullNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder={t('register.fullNamePlaceholder')}
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t('register.emailLabel')}
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder={t('register.emailPlaceholder')}
                    required
                    className={inputClass}
                  />
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
                    <span className="animate-spin text-lg">⏳</span>
                  ) : (
                    <>
                      {t('register.submit')}
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400">
                  {t('register.securePayment')}
                </p>
              </form>
            </div>

            <p className="mt-4 text-center text-sm text-slate-400">
              {t('register.alreadyAccount')}{' '}
              <Link href="/login" className="font-medium text-slate-700 hover:underline">
                {t('register.loginLink')}
              </Link>
            </p>
          </div>
        )}

        <footer className="mt-auto pt-6 text-center text-xs text-slate-400">
          {t('register.footer')}
        </footer>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-white">Cargando...</div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  )
}

'use client'

import Link from 'next/link'
import {
  Building2, TrendingUp, Calendar, MessageSquareText,
  BarChart3, Globe, Check, Star, ArrowRight, Phone,
  Mail, ChevronRight, Zap, Shield, Users,
} from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import LanguageSwitcher from '@/components/LanguageSwitcher'

const WA_NUMBER = '447506862450'
const WA_MESSAGE = encodeURIComponent('Hola, me interesa una demo gratuita de Growthia Global CRM')
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_MESSAGE}`

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { t } = useI18n()

  // ── Data (built from translations) ──────────────────────────────────────────

  const FEATURES = [
    { icon: Building2, key: 'prop',      color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100' },
    { icon: TrendingUp, key: 'leads',    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { icon: Calendar,   key: 'calendar', color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
    { icon: MessageSquareText, key: 'whatsapp', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { icon: BarChart3,  key: 'reports',  color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-100' },
    { icon: Globe,      key: 'multilang', color: 'text-sky-600',   bg: 'bg-sky-50',    border: 'border-sky-100' },
  ]

  const STATS = [
    { value: '+500', label: t('landing.hero.stat1Label') },
    { value: '+200', label: t('landing.hero.stat2Label') },
    { value: '3',    label: t('landing.hero.stat3Label') },
    { value: '99.9%', label: t('landing.hero.stat4Label') },
  ]

  const PLANS = [
    {
      name: 'Starter',
      price: '29',
      planKey: 'starter',
      desc: t('landing.pricing.starter.desc'),
      features: ['f1','f2','f3','f4','f5','f6'].map(k => t(`landing.pricing.starter.${k}`)),
      cta: t('landing.pricing.starter.cta'),
      highlight: false,
    },
    {
      name: 'Profesional',
      price: '59',
      planKey: 'profesional',
      desc: t('landing.pricing.pro.desc'),
      features: ['f1','f2','f3','f4','f5','f6','f7'].map(k => t(`landing.pricing.pro.${k}`)),
      cta: t('landing.pricing.pro.cta'),
      highlight: true,
    },
    {
      name: 'Premium',
      price: '99',
      planKey: 'premium',
      desc: t('landing.pricing.premium.desc'),
      features: ['f1','f2','f3','f4','f5','f6','f7'].map(k => t(`landing.pricing.premium.${k}`)),
      cta: t('landing.pricing.premium.cta'),
      highlight: false,
    },
  ]

  const TESTIMONIALS = [
    { key: 't1', initials: 'MG', color: 'from-blue-500 to-cyan-400' },
    { key: 't2', initials: 'CM', color: 'from-violet-500 to-purple-400' },
    { key: 't3', initials: 'AT', color: 'from-emerald-500 to-teal-400' },
  ]

  const VALUE_PROPS = [
    { icon: Shield, text: t('landing.valueProps.security') },
    { icon: Zap,    text: t('landing.valueProps.setup') },
    { icon: Users,  text: t('landing.valueProps.support') },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-gradient-to-br from-blue-500 via-sky-400 to-cyan-300 text-white shadow-md shadow-sky-400/20">
              <Building2 size={17} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase leading-none tracking-[0.18em] text-sky-700">Growthia</p>
              <p className="text-[10px] leading-tight text-slate-400">Global CRM</p>
            </div>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="transition hover:text-slate-900">{t('landing.nav.features')}</a>
            <a href="#pricing" className="transition hover:text-slate-900">{t('landing.nav.pricing')}</a>
            <a href="#testimonials" className="transition hover:text-slate-900">{t('landing.nav.testimonials')}</a>
            <a href="#contact" className="transition hover:text-slate-900">{t('landing.nav.contact')}</a>
          </nav>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/login"
              className="hidden rounded-2xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 sm:block"
            >
              {t('landing.nav.login')}
            </Link>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:from-blue-700 hover:to-sky-600"
            >
              {t('landing.nav.demo')}
              <ChevronRight size={14} />
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 pb-24 pt-20 text-white sm:pb-32 sm:pt-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-20 right-0 h-[400px] w-[400px] rounded-full bg-cyan-500/8 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-blue-300">
              <Zap size={12} className="text-blue-400" />
              {t('landing.hero.badge')}
            </div>

            <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t('landing.hero.h1a')}{' '}
              <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
                {t('landing.hero.h1b')}
              </span>{' '}
              {t('landing.hero.h1c')}
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-300 sm:text-xl">
              {t('landing.hero.description')}
            </p>

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-sky-400 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-600 hover:to-sky-500 hover:shadow-blue-500/40 sm:w-auto"
              >
                <Zap size={18} />
                {t('landing.hero.ctaPrimary')}
              </Link>
              <a
                href="#features"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-8 py-4 text-base font-medium text-white backdrop-blur-sm transition hover:bg-white/15 sm:w-auto"
              >
                {t('landing.hero.ctaSecondary')}
                <ArrowRight size={16} />
              </a>
            </div>

            <p className="mt-5 text-sm text-slate-400">
              {t('landing.hero.footnote')}
            </p>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-5 text-center backdrop-blur-sm">
                <p className="text-2xl font-bold text-white sm:text-3xl">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="bg-slate-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">{t('landing.features.eyebrow')}</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {t('landing.features.title')}
            </h2>
            <p className="mt-4 text-lg text-slate-500">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, key, color, bg, border }) => (
              <div
                key={key}
                className={`rounded-[28px] border ${border} bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
              >
                <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl ${bg}`}>
                  <Icon size={20} className={color} />
                </div>
                <h3 className="mb-2 text-base font-semibold text-slate-900">{t(`landing.features.${key}.title`)}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{t(`landing.features.${key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Value props strip ── */}
      <section className="border-y border-slate-100 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-16">
            {VALUE_PROPS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                  <Icon size={16} className="text-blue-600" />
                </span>
                <span className="text-sm font-medium text-slate-700">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="bg-slate-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">{t('landing.pricing.eyebrow')}</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {t('landing.pricing.title')}
            </h2>
            <p className="mt-4 text-lg text-slate-500">
              {t('landing.pricing.subtitle')}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              <Check size={14} />
              {t('landing.pricing.badge')}
            </div>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
            {PLANS.map(({ name, price, planKey, desc, features, cta, highlight }) => (
              <div
                key={name}
                className={`relative flex flex-col rounded-[32px] p-8 transition ${
                  highlight
                    ? 'bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-2xl shadow-blue-500/25 ring-0'
                    : 'border border-slate-200/80 bg-white shadow-sm'
                }`}
              >
                {highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-1 text-xs font-bold text-amber-900 shadow-sm">
                    {t('landing.pricing.popular')}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className={`text-lg font-bold ${highlight ? 'text-white' : 'text-slate-900'}`}>{name}</h3>
                  <div className="mt-3 flex items-end gap-1">
                    <span className={`text-4xl font-bold ${highlight ? 'text-white' : 'text-slate-900'}`}>{price}€</span>
                    <span className={`mb-1.5 text-sm ${highlight ? 'text-blue-100' : 'text-slate-400'}`}>{t('landing.pricing.perMonth')}</span>
                  </div>
                  <p className={`mt-3 text-sm leading-relaxed ${highlight ? 'text-blue-100' : 'text-slate-500'}`}>{desc}</p>
                </div>

                <ul className="mb-8 flex flex-1 flex-col gap-2.5">
                  {features.map(feat => (
                    <li key={feat} className="flex items-start gap-2.5 text-sm">
                      <Check size={15} className={`mt-0.5 shrink-0 ${highlight ? 'text-cyan-300' : 'text-blue-500'}`} />
                      <span className={highlight ? 'text-blue-50' : 'text-slate-600'}>{feat}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/register?plan=${planKey}`}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                    highlight
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {cta}
                  <ArrowRight size={15} />
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-slate-400">
            {t('landing.pricing.customPlan')}{' '}
            <a href={WA_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
              {t('landing.pricing.contactUs')}
            </a>
          </p>
          <p className="mt-3 text-center text-xs text-slate-400">{t('landing.pricing.eurNote')}</p>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section id="testimonials" className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">{t('landing.testimonials.eyebrow')}</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {t('landing.testimonials.title')}
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map(({ key, initials, color }) => (
              <div
                key={key}
                className="flex flex-col rounded-[28px] border border-slate-200/80 bg-white p-7 shadow-sm"
              >
                <div className="mb-5 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="mb-6 flex-1 text-sm leading-relaxed text-slate-600">
                  &ldquo;{t(`landing.testimonials.${key}.quote`)}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br ${color} text-sm font-bold text-white`}>
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t(`landing.testimonials.${key}.name`)}</p>
                    <p className="text-xs text-slate-400">{t(`landing.testimonials.${key}.role`)} · {t(`landing.testimonials.${key}.company`)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
            {t('landing.cta.title')}
          </h2>
          <p className="mb-10 text-lg text-slate-300">
            {t('landing.cta.desc')}
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-sky-400 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-600 hover:to-sky-500"
          >
            <Zap size={18} />
            {t('landing.cta.button')}
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer id="contact" className="border-t border-slate-100 bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">

            {/* Brand */}
            <div className="max-w-xs">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-gradient-to-br from-blue-500 via-sky-400 to-cyan-300 text-white shadow-md shadow-sky-400/20">
                  <Building2 size={17} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase leading-none tracking-[0.18em] text-sky-700">Growthia</p>
                  <p className="text-[10px] leading-tight text-slate-400">Global CRM</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                {t('landing.footer.desc')}
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-10">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">{t('landing.footer.product')}</p>
                <ul className="flex flex-col gap-3 text-sm text-slate-500">
                  <li><a href="#features" className="transition hover:text-slate-900">{t('landing.nav.features')}</a></li>
                  <li><a href="#pricing" className="transition hover:text-slate-900">{t('landing.nav.pricing')}</a></li>
                  <li><a href="#testimonials" className="transition hover:text-slate-900">{t('landing.nav.testimonials')}</a></li>
                  <li><Link href="/login" className="transition hover:text-slate-900">{t('landing.nav.login')}</Link></li>
                </ul>
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">{t('landing.footer.contact')}</p>
                <ul className="flex flex-col gap-3 text-sm text-slate-500">
                  <li>
                    <a
                      href="https://wa.me/447506862450"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 transition hover:text-slate-900"
                    >
                      <Phone size={13} />
                      Rodney Zambrano: +44 7506 862450 (UK)
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://wa.me/34631422119"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 transition hover:text-slate-900"
                    >
                      <Phone size={13} />
                      Marcos Zambrano: +34 631 422 119 (España)
                    </a>
                  </li>
                  <li>
                    <a
                      href="mailto:hola@growthiaglobal.com"
                      className="inline-flex items-center gap-2 transition hover:text-slate-900"
                    >
                      <Mail size={13} />
                      hola@growthiaglobal.com
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-8 sm:flex-row">
            <p className="text-xs text-slate-400">
              {t('landing.footer.copyright', { year: String(new Date().getFullYear()) })}
            </p>
            <p className="text-xs text-slate-400">
              {t('landing.footer.madeWith')}
            </p>
          </div>
        </div>
      </footer>

    </div>
  )
}

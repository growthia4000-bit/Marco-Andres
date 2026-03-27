'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, LOCALES, type AppLocale, resolveLocale } from './config'
import { messages, type MessageDictionary } from './messages'

type I18nContextValue = {
  locale: AppLocale
  locales: readonly AppLocale[]
  setLocale: (locale: AppLocale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string
  formatTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string
  formatCurrency: (value: number, currency?: string) => string
}

const localeMap: Record<AppLocale, string> = {
  es: 'es-ES',
  it: 'it-IT',
  en: 'en-US',
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getByPath(dictionary: MessageDictionary, path: string): string | undefined {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, dictionary) as string | undefined
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`))
}

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: AppLocale }) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<AppLocale>(resolveLocale(initialLocale ?? DEFAULT_LOCALE))

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = messages[locale]
    const localeCode = localeMap[locale]

    return {
      locale,
      locales: LOCALES,
      setLocale: (nextLocale) => {
        const resolved = resolveLocale(nextLocale)
        setLocaleState(resolved)
        document.cookie = `${LOCALE_COOKIE_NAME}=${resolved}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        localStorage.setItem(LOCALE_COOKIE_NAME, resolved)
        router.refresh()
      },
      t: (key, vars) => interpolate(getByPath(dictionary, key) ?? key, vars),
      formatDate: (value, options) => new Intl.DateTimeFormat(localeCode, options).format(new Date(value)),
      formatTime: (value, options) =>
        new Intl.DateTimeFormat(localeCode, { hour: '2-digit', minute: '2-digit', ...options }).format(new Date(value)),
      formatCurrency: (value, currency = 'EUR') =>
        new Intl.NumberFormat(localeCode, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value),
    }
  }, [locale, router])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }

  return context
}

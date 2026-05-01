'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_CURRENCY_CODE, DEFAULT_LOCALE, DEFAULT_LOCALE_CODE, DEFAULT_TIMEZONE, LOCALE_COOKIE_NAME, LOCALES, type AppLocale, resolveCurrencyCode, resolveLocale, resolveLocaleCode, resolveTimezone } from './config'
import { messages, type MessageDictionary } from './messages'
import { formatCurrency as baseFormatCurrency, formatDate as baseFormatDate, formatNumber as baseFormatNumber, formatTime as baseFormatTime } from './formatters'

type I18nContextValue = {
  locale: AppLocale
  localeCode: string
  currencyCode: string
  timezone: string
  locales: readonly AppLocale[]
  setLocale: (locale: AppLocale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string
  formatTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string
  formatCurrency: (value: number, currencyCode?: string, localeCode?: string) => string
  formatNumber: (value: number, localeCode?: string, options?: Intl.NumberFormatOptions) => string
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

export function I18nProvider({
  children,
  initialLocale,
  initialLocaleCode,
  initialCurrencyCode,
  initialTimezone,
}: {
  children: React.ReactNode
  initialLocale?: AppLocale
  initialLocaleCode?: string
  initialCurrencyCode?: string
  initialTimezone?: string
}) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<AppLocale>(resolveLocale(initialLocale ?? DEFAULT_LOCALE))

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = messages[locale]
    const localeCode = resolveLocaleCode(initialLocaleCode, locale) || DEFAULT_LOCALE_CODE
    const currencyCode = resolveCurrencyCode(initialCurrencyCode) || DEFAULT_CURRENCY_CODE
    const timezone = resolveTimezone(initialTimezone) || DEFAULT_TIMEZONE

    return {
      locale,
      localeCode,
      currencyCode,
      timezone,
      locales: LOCALES,
      setLocale: (nextLocale) => {
        const resolved = resolveLocale(nextLocale)
        setLocaleState(resolved)
        document.cookie = `${LOCALE_COOKIE_NAME}=${resolved}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        router.refresh()
      },
      t: (key, vars) => interpolate(getByPath(dictionary, key) ?? key, vars),
      formatDate: (value, options) => baseFormatDate(value, localeCode, timezone, options),
      formatTime: (value, options) => baseFormatTime(value, localeCode, timezone, options),
      formatCurrency: (value, nextCurrencyCode, nextLocaleCode) => baseFormatCurrency(value, nextCurrencyCode || currencyCode, nextLocaleCode || localeCode),
      formatNumber: (value, nextLocaleCode, options) => baseFormatNumber(value, nextLocaleCode || localeCode, options),
    }
  }, [initialCurrencyCode, initialLocaleCode, initialTimezone, locale, router])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }

  return context
}

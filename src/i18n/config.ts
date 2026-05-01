export const LOCALES = ['es', 'it', 'en'] as const
export type AppLocale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'es'
export const LOCALE_COOKIE_NAME = 'app_locale'
export const DEFAULT_LOCALE_CODE = 'es-ES'
export const DEFAULT_CURRENCY_CODE = 'EUR'
export const DEFAULT_TIMEZONE = 'Europe/Madrid'

export const LOCALE_CODE_BY_LANGUAGE: Record<AppLocale, string> = {
  es: 'es-ES',
  it: 'it-IT',
  en: 'en-US',
}

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return !!value && LOCALES.includes(value as AppLocale)
}

export function resolveLocale(value: string | null | undefined): AppLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE
}

export function resolveLocaleCode(value: string | null | undefined, fallbackLocale: AppLocale = DEFAULT_LOCALE) {
  void value
  return LOCALE_CODE_BY_LANGUAGE[fallbackLocale] || DEFAULT_LOCALE_CODE
}

export function resolveCurrencyCode(value: string | null | undefined) {
  return value?.trim() || DEFAULT_CURRENCY_CODE
}

export function resolveTimezone(value: string | null | undefined) {
  return value?.trim() || DEFAULT_TIMEZONE
}

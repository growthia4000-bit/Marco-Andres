export const LOCALES = ['es', 'it', 'en'] as const
export type AppLocale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'es'
export const LOCALE_COOKIE_NAME = 'app_locale'

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return !!value && LOCALES.includes(value as AppLocale)
}

export function resolveLocale(value: string | null | undefined): AppLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE
}

import { cookies } from 'next/headers'
import { LOCALE_COOKIE_NAME, resolveCurrencyCode, resolveLocale, resolveLocaleCode, resolveTimezone, type AppLocale } from './config'
import { createClient } from '@/lib/supabase/server'

export async function getRequestLocale(): Promise<AppLocale> {
  const cookieStore = await cookies()
  return resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value)
}

export async function getRequestI18nSettings() {
  const locale = await getRequestLocale()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      locale,
      localeCode: resolveLocaleCode(null, locale),
      currencyCode: resolveCurrencyCode(null),
      timezone: resolveTimezone(null),
    }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) {
    return {
      locale,
      localeCode: resolveLocaleCode(null, locale),
      currencyCode: resolveCurrencyCode(null),
      timezone: resolveTimezone(null),
    }
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('default_locale, default_currency_code, default_timezone')
    .eq('id', profile.tenant_id)
    .single()

  return {
    locale,
    localeCode: resolveLocaleCode(tenant?.default_locale, locale),
    currencyCode: resolveCurrencyCode(tenant?.default_currency_code),
    timezone: resolveTimezone(tenant?.default_timezone),
  }
}

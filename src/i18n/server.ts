import { cookies } from 'next/headers'
import { LOCALE_COOKIE_NAME, resolveLocale, type AppLocale } from './config'

export async function getRequestLocale(): Promise<AppLocale> {
  const cookieStore = await cookies()
  return resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value)
}

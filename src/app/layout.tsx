import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/i18n/I18nProvider'
import { getRequestI18nSettings } from '@/i18n/server'

export const metadata: Metadata = {
  title: 'Growthia Global CRM',
  description: 'CRM inmobiliario con separación total de tenants, roles claros y trazabilidad completa',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { locale, localeCode, currencyCode, timezone } = await getRequestI18nSettings()

  return (
    <html lang={localeCode}>
      <body>
        <I18nProvider initialLocale={locale} initialLocaleCode={localeCode} initialCurrencyCode={currencyCode} initialTimezone={timezone}>
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}

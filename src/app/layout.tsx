import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/i18n/I18nProvider'
import { getRequestLocale } from '@/i18n/server'

export const metadata: Metadata = {
  title: 'InmoCRM - CRM Inmobiliario Multi-Agente',
  description: 'CRM inmobiliario con separación total de tenants, roles claros y trazabilidad completa',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getRequestLocale()

  return (
    <html lang={locale}>
      <body>
        <I18nProvider initialLocale={locale}>
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}

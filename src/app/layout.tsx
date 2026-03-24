import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'InmoCRM - CRM Inmobiliario Multi-Agente',
  description: 'CRM inmobiliario con separación total de tenants, roles claros y trazabilidad completa',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

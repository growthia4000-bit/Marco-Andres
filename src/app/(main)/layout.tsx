'use client'

import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="px-6 pt-4">
        <div className="mx-auto flex max-w-7xl justify-end">
          <LanguageSwitcher />
        </div>
      </div>
      {children}
    </div>
  )
}

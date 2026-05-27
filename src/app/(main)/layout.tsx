'use client'

import LanguageSwitcher from '@/components/LanguageSwitcher'
import Sidebar from '@/components/layout/Sidebar'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: leaves space for mobile hamburger on the left */}
        <div className="flex items-center justify-end pl-14 pr-4 pt-4 sm:pr-6 lg:pl-0 lg:pr-6">
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    </div>
  )
}

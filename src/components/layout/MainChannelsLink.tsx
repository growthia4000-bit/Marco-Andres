'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

export default function MainChannelsLink() {
  const pathname = usePathname()
  const { t } = useI18n()
  const isActive = pathname === '/channels'

  return (
    <Link
      href="/channels"
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${isActive ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700'}`}
    >
      <ShieldAlert size={16} />
      <span>{t('dashboard.labels.viewChannels')}</span>
    </Link>
  )
}

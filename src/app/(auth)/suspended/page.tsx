'use client'

import SuspendedActions from './suspended-actions'
import { useI18n } from '@/i18n/I18nProvider'

export default function SuspendedPage() {
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-2xl font-bold">
          !
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-3">{t('auth.suspended.title')}</h1>
        <p className="text-slate-600 mb-6">
          {t('auth.suspended.description')}
        </p>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600 mb-6">
          {t('auth.suspended.contactSupport')}
        </div>
        <SuspendedActions />
      </div>
    </div>
  )
}

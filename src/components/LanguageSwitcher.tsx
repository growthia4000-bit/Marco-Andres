'use client'

import { Languages } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

export default function LanguageSwitcher() {
  const { locale, locales, setLocale, t } = useI18n()

  return (
    <div className="bg-white/95 backdrop-blur border border-slate-200 shadow-sm rounded-xl px-3 py-2 flex items-center gap-2 w-fit ml-auto">
      <Languages size={16} className="text-slate-500" />
      <label htmlFor="app-locale" className="text-sm text-slate-600">
        {t('common.language')}
      </label>
      <select
        id="app-locale"
        value={locale}
        onChange={(e) => setLocale(e.target.value as (typeof locales)[number])}
        className="text-sm bg-transparent text-slate-900 outline-none"
      >
        {locales.map((item) => (
          <option key={item} value={item}>
            {t(`languages.${item}`)}
          </option>
        ))}
      </select>
    </div>
  )
}

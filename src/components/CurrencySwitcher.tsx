'use client'

import { DollarSign } from 'lucide-react'
import { useCurrency, CURRENCY_RATES } from '@/context/CurrencyContext'
import type { CurrencyCode } from '@/lib/currency-rates'

export default function CurrencySwitcher() {
  const { currency, setCurrency, currencies } = useCurrency()

  return (
    <div className="bg-white/95 backdrop-blur border border-slate-200 shadow-sm rounded-xl px-3 py-2 flex items-center gap-2 w-fit">
      <DollarSign size={14} className="hidden sm:block text-slate-500 shrink-0" />
      <select
        id="app-currency"
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        className="text-sm bg-transparent text-slate-900 outline-none cursor-pointer"
        aria-label="Currency"
      >
        {currencies.map((code) => (
          <option key={code} value={code}>
            {CURRENCY_RATES[code].symbol} {code}
          </option>
        ))}
      </select>
    </div>
  )
}

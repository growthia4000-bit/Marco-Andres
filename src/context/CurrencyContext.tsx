'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  CURRENCY_CODES,
  CURRENCY_RATES,
  type CurrencyCode,
  convertBetween,
  convertFromEUR,
  formatCurrencyAmount,
  formatFromEUR,
  isCurrencyCode,
} from '@/lib/currency-rates'

const STORAGE_KEY = 'app_currency'
const DEFAULT_CURRENCY: CurrencyCode = 'EUR'

interface CurrencyContextValue {
  currency: CurrencyCode
  setCurrency: (code: CurrencyCode) => void
  currencies: readonly CurrencyCode[]
  /** Convert EUR amount to selected currency and format */
  formatPrice: (eurAmount: number) => string
  /** Convert from a stored currency (e.g. property.currency_code) to selected and format */
  formatPriceFrom: (amount: number, fromCode: string) => string
  /** Raw conversion from EUR to selected currency */
  convertPrice: (eurAmount: number) => number
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(DEFAULT_CURRENCY)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && isCurrencyCode(stored)) setCurrencyState(stored)
    } catch { /* ignore */ }
  }, [])

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState(code)
    try { localStorage.setItem(STORAGE_KEY, code) } catch { /* ignore */ }
  }, [])

  const formatPrice = useCallback(
    (eurAmount: number) => formatFromEUR(eurAmount, currency),
    [currency],
  )

  const formatPriceFrom = useCallback(
    (amount: number, fromCode: string) => {
      const from = isCurrencyCode(fromCode) ? fromCode : 'EUR'
      const converted = convertBetween(amount, from, currency)
      return formatCurrencyAmount(converted, currency)
    },
    [currency],
  )

  const convertPrice = useCallback(
    (eurAmount: number) => convertFromEUR(eurAmount, currency),
    [currency],
  )

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, currencies: CURRENCY_CODES, formatPrice, formatPriceFrom, convertPrice }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider')
  return ctx
}

export { CURRENCY_RATES }

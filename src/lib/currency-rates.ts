// Fixed exchange rates from EUR base. Update periodically.
// Last updated: 2025-06
export const CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'GTQ', 'MXN'] as const
export type CurrencyCode = (typeof CURRENCY_CODES)[number]

export interface CurrencyInfo {
  /** Display symbol */
  symbol: string
  /** BCP 47 locale for number formatting */
  locale: string
  /** Units per 1 EUR */
  rate: number
}

export const CURRENCY_RATES: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { symbol: '€',   locale: 'es-ES', rate: 1.00  },
  USD: { symbol: '$',   locale: 'en-US', rate: 1.09  },
  GBP: { symbol: '£',   locale: 'en-GB', rate: 0.85  },
  GTQ: { symbol: 'Q',   locale: 'es-GT', rate: 8.45  },
  MXN: { symbol: 'MX$', locale: 'es-MX', rate: 19.80 },
}

export function isCurrencyCode(code: string): code is CurrencyCode {
  return CURRENCY_CODES.includes(code as CurrencyCode)
}

/** Convert an amount from EUR to target currency */
export function convertFromEUR(amount: number, to: CurrencyCode): number {
  return amount * CURRENCY_RATES[to].rate
}

/** Convert an amount from a known source currency to EUR */
export function convertToEUR(amount: number, from: CurrencyCode): number {
  return amount / CURRENCY_RATES[from].rate
}

/** Convert between any two currencies in CURRENCY_RATES */
export function convertBetween(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount
  return convertFromEUR(convertToEUR(amount, from), to)
}

/** Format a pre-converted amount with the correct symbol and locale separators */
export function formatCurrencyAmount(amount: number, currency: CurrencyCode): string {
  const { symbol, locale } = CURRENCY_RATES[currency]
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
  return `${symbol}${formatted}`
}

/** Convert from EUR and format in one step */
export function formatFromEUR(eurAmount: number, to: CurrencyCode): string {
  return formatCurrencyAmount(convertFromEUR(eurAmount, to), to)
}

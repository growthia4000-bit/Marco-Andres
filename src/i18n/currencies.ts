export const SUPPORTED_CURRENCIES = ['EUR', 'GBP', 'USD', 'COP', 'CLP', 'MXN', 'PLN'] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

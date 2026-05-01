export function formatCurrency(amount: number, currencyCode: string, locale: string, options?: Intl.NumberFormatOptions) {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'symbol',
    ...options,
  })

  const parts = formatter.formatToParts(amount)

  const currencySymbol = parts.find((p) => p.type === 'currency')?.value ?? currencyCode
  const numberParts = parts
    .filter((p) => p.type !== 'currency')
    .map((p) => p.value)
    .join('')

  return `${currencySymbol}${numberParts}`
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options).format(value)
}

export function formatDate(
  value: string | number | Date,
  locale: string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(new Date(value))
}

export function formatTime(
  value: string | number | Date,
  locale: string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit', ...options }).format(new Date(value))
}

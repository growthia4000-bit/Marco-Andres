import Stripe from 'stripe'
import { convertFromEUR, type CurrencyCode } from '@/lib/currency-rates'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia',
})

export const PLANS = {
  starter: {
    name: 'Starter',
    slug: 'starter',
    priceEur: 29,
    priceCents: 2900,
    description: 'Ideal para inmobiliarias pequeñas y autónomos',
    features: ['Hasta 5 usuarios', '100 propiedades', '500 leads', '1 GB almacenamiento'],
  },
  profesional: {
    name: 'Profesional',
    slug: 'growth',
    priceEur: 59,
    priceCents: 5900,
    description: 'Para equipos en crecimiento',
    features: ['Hasta 15 usuarios', 'Propiedades ilimitadas', 'Leads ilimitados', 'WhatsApp & Email'],
  },
  premium: {
    name: 'Premium',
    slug: 'agency',
    priceEur: 99,
    priceCents: 9900,
    description: 'Para grandes inmobiliarias y franquicias',
    features: ['Hasta 30 usuarios', 'Todo ilimitado', 'IA avanzada', 'Soporte prioritario'],
  },
} as const

export type PlanKey = keyof typeof PLANS

// Currencies supported by this UK Stripe account (GTQ → USD fallback)
export type StripeCurrency = 'eur' | 'usd' | 'gbp' | 'mxn'

/** Map CurrencyCode to a Stripe-supported currency. GTQ is not supported on UK accounts → USD. */
export function toStripeCurrency(currency: CurrencyCode): StripeCurrency {
  if (currency === 'GTQ') return 'usd'
  return currency.toLowerCase() as StripeCurrency
}

/** Compute Stripe unit_amount (smallest currency unit) from EUR base price.
 *  MXN: rounds to whole peso then expresses in centavos (no fractional pesos).
 *  EUR/USD/GBP: rounds to nearest cent/pence. */
function computeUnitAmount(eurPrice: number, stripeCurrency: StripeCurrency): number {
  const codeMap: Record<StripeCurrency, CurrencyCode> = {
    eur: 'EUR', usd: 'USD', gbp: 'GBP', mxn: 'MXN',
  }
  const converted = convertFromEUR(eurPrice, codeMap[stripeCurrency])
  if (stripeCurrency === 'mxn') return Math.round(converted) * 100
  return Math.round(converted * 100)
}

/** Get or create a Stripe Price for a plan + currency combination.
 *  Each plan can have up to one active Price per supported currency. */
export async function getOrCreateStripePrice(
  planKey: PlanKey,
  currency: CurrencyCode = 'EUR',
): Promise<string> {
  const plan = PLANS[planKey]
  const stripeCurrency = toStripeCurrency(currency)

  // Find or create Product (shared across all currencies for this plan)
  const products = await stripe.products.search({
    query: `metadata['plan_slug']:'${plan.slug}'`,
    limit: 1,
  })

  let productId: string

  if (products.data.length > 0) {
    productId = products.data[0].id
  } else {
    const product = await stripe.products.create({
      name: `InmoCRM ${plan.name}`,
      description: plan.description,
      metadata: { plan_slug: plan.slug },
    })
    productId = product.id
  }

  // Find existing active Price for this product + currency
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    currency: stripeCurrency,
    limit: 1,
  })

  if (prices.data.length > 0) return prices.data[0].id

  // Create Price for this currency
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: computeUnitAmount(plan.priceEur, stripeCurrency),
    currency: stripeCurrency,
    recurring: { interval: 'month' },
    metadata: { plan_slug: plan.slug, display_currency: currency },
  })

  return price.id
}

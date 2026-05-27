import Stripe from 'stripe'

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

/** Get or create a Stripe Price for a plan. Stores price_id in plan metadata. */
export async function getOrCreateStripePrice(planKey: PlanKey): Promise<string> {
  const plan = PLANS[planKey]

  // Search for existing product by metadata
  const products = await stripe.products.search({
    query: `metadata['plan_slug']:'${plan.slug}'`,
    limit: 1,
  })

  let productId: string
  let priceId: string | null = null

  if (products.data.length > 0) {
    productId = products.data[0].id
    // Find active price for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 1,
    })
    if (prices.data.length > 0) {
      priceId = prices.data[0].id
    }
  } else {
    // Create product
    const product = await stripe.products.create({
      name: `InmoCRM ${plan.name}`,
      description: plan.description,
      metadata: { plan_slug: plan.slug },
    })
    productId = product.id
  }

  if (!priceId) {
    // Create price
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.priceCents,
      currency: 'eur',
      recurring: { interval: 'month' },
      metadata: { plan_slug: plan.slug },
    })
    priceId = price.id
  }

  return priceId
}

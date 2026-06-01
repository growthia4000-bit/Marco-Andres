import { NextRequest, NextResponse } from 'next/server'
import { stripe, getOrCreateStripePrice, PLANS, type PlanKey } from '@/lib/stripe'
import { isCurrencyCode, type CurrencyCode } from '@/lib/currency-rates'

const VALID_PLAN_KEYS = Object.keys(PLANS) as PlanKey[]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { plan_key, agency_name, full_name, email, currency } = body as {
      plan_key: string
      agency_name: string
      full_name: string
      email: string
      currency?: string
    }

    // Validate inputs
    if (!plan_key || !VALID_PLAN_KEYS.includes(plan_key as PlanKey)) {
      return NextResponse.json({ error: 'Plan inválido', errorCode: 'invalid_plan' }, { status: 400 })
    }
    if (!agency_name?.trim()) {
      return NextResponse.json({ error: 'Nombre de inmobiliaria requerido', errorCode: 'agency_name_required' }, { status: 400 })
    }
    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'Nombre completo requerido', errorCode: 'full_name_required' }, { status: 400 })
    }
    if (!email?.includes('@')) {
      return NextResponse.json({ error: 'Email inválido', errorCode: 'invalid_email' }, { status: 400 })
    }

    const activeCurrency: CurrencyCode =
      typeof currency === 'string' && isCurrencyCode(currency) ? currency : 'EUR'

    // Get or create Stripe price for this plan + currency
    const priceId = await getOrCreateStripePrice(plan_key as PlanKey, activeCurrency)

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      metadata: {
        plan_key,
        plan_slug: PLANS[plan_key as PlanKey].slug,
        agency_name: agency_name.trim(),
        full_name: full_name.trim(),
        email: email.toLowerCase().trim(),
        display_currency: activeCurrency,
      },
      success_url: `${baseUrl}/register/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/register?cancelled=1`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      locale: 'es',
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/create-checkout-session]', err)
    return NextResponse.json(
      { error: 'Error al crear la sesión de pago', errorCode: 'stripe_error' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLANS, type PlanKey } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type Stripe from 'stripe'

export const runtime = 'nodejs'

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid') return

  const { plan_key, plan_slug, agency_name, full_name, email } = (session.metadata ?? {}) as {
    plan_key: PlanKey
    plan_slug: string
    agency_name: string
    full_name: string
    email: string
  }

  if (!email || !agency_name || !plan_slug) {
    console.warn('[webhook] Missing metadata in session', session.id)
    return
  }

  // Idempotency check
  const { data: existingSubscription } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .contains('metadata', { stripe_session_id: session.id })
    .maybeSingle()

  if (existingSubscription) {
    console.log('[webhook] Already provisioned for session', session.id)
    return
  }

  // Get DB plan
  const { data: dbPlan } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('slug', plan_slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!dbPlan) {
    console.error('[webhook] Plan not found:', plan_slug)
    return
  }

  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

  // Provision user if not already exists
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id')
    .eq('email', email)
    .maybeSingle()

  let tenantId: string

  if (!existingUser) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name, tenant_name: agency_name },
    })

    if (authError || !authData.user) {
      console.error('[webhook] Failed to create user:', authError)
      return
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (!profile?.tenant_id) {
      console.error('[webhook] Tenant not found after user creation')
      return
    }

    tenantId = profile.tenant_id
  } else {
    tenantId = existingUser.tenant_id
  }

  // Update subscription
  await supabaseAdmin
    .from('subscriptions')
    .update({
      plan_id: dbPlan.id,
      status: 'active',
      provider: 'stripe',
      provider_customer_id: stripeCustomerId ?? null,
      provider_subscription_id: stripeSubscriptionId ?? null,
      billing_cycle: 'monthly',
      trial_ends_at: null,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        stripe_session_id: session.id,
        plan_key,
        created_by: 'stripe_webhook',
      },
    })
    .eq('tenant_id', tenantId)
    .eq('is_current', true)

  console.log('[webhook] Provisioned tenant', tenantId, 'for', email)
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    // In development without webhook secret, parse directly
    if (process.env.NODE_ENV === 'development' && !webhookSecret) {
      console.warn('[webhook] No STRIPE_WEBHOOK_SECRET set, skipping signature verification')
      try {
        const event = JSON.parse(body) as Stripe.Event
        if (event.type === 'checkout.session.completed') {
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        }
        return NextResponse.json({ received: true })
      } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      }
    }
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break
      default:
        console.log('[webhook] Unhandled event type:', event.type)
    }
  } catch (err) {
    console.error('[webhook] Error processing event:', err)
    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

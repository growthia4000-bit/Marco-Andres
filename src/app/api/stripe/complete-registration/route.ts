import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLANS, type PlanKey } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id requerido', errorCode: 'missing_session_id' }, { status: 400 })
  }

  try {
    // Retrieve and verify the Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    })

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Pago no completado', errorCode: 'payment_not_completed', status: session.payment_status },
        { status: 402 }
      )
    }

    const { plan_key, plan_slug, agency_name, full_name, email } = session.metadata as {
      plan_key: PlanKey
      plan_slug: string
      agency_name: string
      full_name: string
      email: string
    }

    // Idempotency: check if already provisioned via stripe_session_id in subscription metadata
    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, tenant_id')
      .contains('metadata', { stripe_session_id: sessionId })
      .maybeSingle()

    if (existingSubscription) {
      return NextResponse.json({
        success: true,
        already_provisioned: true,
        tenant_id: existingSubscription.tenant_id,
      })
    }

    // Get the plan from DB
    const { data: dbPlan } = await supabaseAdmin
      .from('plans')
      .select('id, slug')
      .eq('slug', plan_slug)
      .eq('is_active', true)
      .maybeSingle()

    if (!dbPlan) {
      return NextResponse.json({ error: 'Plan no encontrado en BD', errorCode: 'plan_not_found' }, { status: 500 })
    }

    // Extract Stripe IDs
    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
    const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

    // Create Supabase auth user via admin (service_role bypasses PUBLIC_SIGNUP_DISABLED check)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      email_confirm: true,
      user_metadata: {
        full_name: full_name,
        tenant_name: agency_name,
      },
    })

    if (authError) {
      // If user already exists, look them up
      if (authError.message?.includes('already') || authError.message?.includes('exists')) {
        return NextResponse.json(
          { error: 'Ya existe una cuenta con este email', errorCode: 'email_exists' },
          { status: 409 }
        )
      }
      console.error('[complete-registration] auth.admin.createUser error:', authError)
      return NextResponse.json({ error: authError.message, errorCode: 'user_creation_failed' }, { status: 500 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'No se pudo crear el usuario', errorCode: 'user_creation_failed' }, { status: 500 })
    }

    // At this point, the handle_new_user trigger has run and created:
    // - tenant record
    // - subscription (status: 'trial', plan: starter)
    // - user record (role: admin)
    // Now we need to update the subscription to the chosen plan + mark as active

    // Get the tenant that was just created
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (!userProfile?.tenant_id) {
      console.error('[complete-registration] User profile/tenant not found after provisioning')
      return NextResponse.json({ error: 'Error al obtener perfil', errorCode: 'profile_not_found' }, { status: 500 })
    }

    const tenantId = userProfile.tenant_id

    // Update subscription: set correct plan, status=active, Stripe IDs
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
          stripe_session_id: sessionId,
          plan_key,
          created_by: 'stripe_checkout',
        },
      })
      .eq('tenant_id', tenantId)
      .eq('is_current', true)

    // Send magic link so user can set password and log in
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${baseUrl}/dashboard`,
      },
    })

    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      user_id: authData.user.id,
      email,
    })
  } catch (err) {
    console.error('[stripe/complete-registration]', err)
    return NextResponse.json(
      { error: 'Error al procesar el registro', errorCode: 'processing_error' },
      { status: 500 }
    )
  }
}

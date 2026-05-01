import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_INVITATION_ROLES = ['admin', 'coordinator', 'agent'] as const
const ALLOWED_MANAGER_ROLES = ['owner', 'admin'] as const

async function getInvitationRequesterContext() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized', errorCode: 'unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !ALLOWED_MANAGER_ROLES.includes(profile.role as typeof ALLOWED_MANAGER_ROLES[number])) {
    return { error: NextResponse.json({ error: 'Only owners and admins can manage invitations', errorCode: 'forbidden' }, { status: 403 }) }
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('status')
    .eq('id', profile.tenant_id)
    .single()

  if (tenant?.status === 'suspended') {
    return { error: NextResponse.json({ error: 'Tenant is suspended', errorCode: 'tenant_suspended' }, { status: 403 }) }
  }

  if (tenant?.status === 'inactive') {
    return { error: NextResponse.json({ error: 'Tenant is inactive', errorCode: 'tenant_inactive' }, { status: 403 }) }
  }

  return { supabase, user, profile }
}

export async function GET(request: NextRequest) {
  const context = await getInvitationRequesterContext()
  if (context.error) {
    return context.error
  }

  const { supabase, profile } = context

  const { data: invitations, error } = await supabase
    .from('invitations')
    .select('*, users!invited_by(full_name, email)')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ invitations })
}

export async function POST(request: NextRequest) {
  const context = await getInvitationRequesterContext()
  if (context.error) {
    return context.error
  }

  const { supabase, user, profile } = context

  const { email, role } = await request.json()

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required', errorCode: 'invalid_email' }, { status: 400 })
  }

  if (role && !ALLOWED_INVITATION_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid invitation role', errorCode: 'invalid_role' }, { status: 400 })
  }

  const existingUser = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single()

  if (existingUser.data) {
    return NextResponse.json({ error: 'User already exists in the system', errorCode: 'user_exists' }, { status: 400 })
  }

  const existingInvitation = await supabase
    .from('invitations')
    .select('id, status')
    .eq('email', email.toLowerCase())
    .eq('tenant_id', profile.tenant_id)
    .in('status', ['pending'])
    .single()

  if (existingInvitation.data) {
    return NextResponse.json({ error: 'Invitation already sent to this email', errorCode: 'invitation_exists' }, { status: 400 })
  }

  const { data: invitation, error } = await supabase
    .from('invitations')
    .insert({
      tenant_id: profile.tenant_id,
      email: email.toLowerCase(),
      role: role || 'agent',
      invited_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/signup?invite=${invitation.token}`

  return NextResponse.json({
    invitation,
    inviteUrl,
    message: `Invitation created. Share this link with ${email}: ${inviteUrl}`
  })
}

export async function DELETE(request: NextRequest) {
  const context = await getInvitationRequesterContext()
  if (context.error) {
    return context.error
  }

  const { supabase, profile } = context

  const { searchParams } = new URL(request.url)
  const invitationId = searchParams.get('id')

  if (!invitationId) {
    return NextResponse.json({ error: 'Invitation ID is required', errorCode: 'invitation_id_required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('invitations')
    .update({ status: 'cancelled' })
    .eq('id', invitationId)
    .eq('tenant_id', profile.tenant_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ message: 'Invitation cancelled' })
}

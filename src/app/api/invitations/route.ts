import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can view invitations' }, { status: 403 })
  }

  const { data: invitations, error } = await supabase
    .from('invitations')
    .select('*, users!invited_by(full_name, email)')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ invitations })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can send invitations' }, { status: 403 })
  }

  const { email, role } = await request.json()

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  const existingUser = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single()

  if (existingUser.data) {
    return NextResponse.json({ error: 'User already exists in the system' }, { status: 400 })
  }

  const existingInvitation = await supabase
    .from('invitations')
    .select('id, status')
    .eq('email', email.toLowerCase())
    .eq('tenant_id', profile.tenant_id)
    .in('status', ['pending'])
    .single()

  if (existingInvitation.data) {
    return NextResponse.json({ error: 'Invitation already sent to this email' }, { status: 400 })
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
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can cancel invitations' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const invitationId = searchParams.get('id')

  if (!invitationId) {
    return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 })
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

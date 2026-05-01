import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type InvitationVerificationRow = {
  id: string
  token: string
  email: string
  role: string
  status: string
  expires_at: string
  tenant_id: string
  tenant_name: string | null
  tenant_status: string | null
  capacity_available: boolean | null
  role_valid: boolean | null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token is required', errorCode: 'token_required' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('app_verify_invitation', {
    invitation_token: token,
  })

  if (error) {
    return NextResponse.json({ error: error.message, errorCode: 'invite_verify_failed' }, { status: 500 })
  }

  const invitation = (data?.[0] ?? null) as InvitationVerificationRow | null

  if (!invitation) {
    return NextResponse.json({ error: 'Invitation not found', errorCode: 'invite_not_found' }, { status: 404 })
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: `Invitation has already been ${invitation.status}`, errorCode: 'invite_used' }, { status: 400 })
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invitation has expired', errorCode: 'invite_expired' }, { status: 400 })
  }

  if (invitation.tenant_status === 'suspended') {
    return NextResponse.json({ error: 'Tenant is suspended', errorCode: 'tenant_suspended' }, { status: 403 })
  }

  if (invitation.tenant_status === 'inactive') {
    return NextResponse.json({ error: 'Tenant is inactive', errorCode: 'tenant_inactive' }, { status: 403 })
  }

  if (invitation.role_valid === false) {
    return NextResponse.json({ error: 'Invitation role is invalid', errorCode: 'invalid_invite_role' }, { status: 400 })
  }

  if (invitation.capacity_available === false) {
    return NextResponse.json(
      { error: 'This team has reached the user limit for its current plan', errorCode: 'tenant_capacity_reached' },
      { status: 403 }
    )
  }

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      token: invitation.token,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expires_at: invitation.expires_at,
      tenant_id: invitation.tenant_id,
    },
    tenant_name: invitation.tenant_name || 'Unknown',
  })
}

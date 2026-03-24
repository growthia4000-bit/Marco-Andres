import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  const { data: invitation, error } = await supabase
    .from('invitations')
    .select('*, tenants(name)')
    .eq('token', token)
    .single()

  if (error || !invitation) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: `Invitation has already been ${invitation.status}` }, { status: 400 })
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
  }

  return NextResponse.json({
    invitation,
    tenant_name: invitation.tenants?.name || 'Unknown',
  })
}

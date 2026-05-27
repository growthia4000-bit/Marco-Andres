import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectMicrosoftGraphConfig, buildMicrosoftGraphAuthUrl } from '@/features/conversations/email-engine'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.tenant_id) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const tenantId = profile.tenant_id

  const config = detectMicrosoftGraphConfig(process.env)
  if (!config.configured) {
    return NextResponse.json({ error: config.reason || 'Microsoft Graph not configured' }, { status: 500 })
  }

  const authUrl = buildMicrosoftGraphAuthUrl(config, tenantId)

  return NextResponse.redirect(authUrl)
}
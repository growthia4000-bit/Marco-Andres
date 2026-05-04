import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { detectMicrosoftGraphConfig, refreshMicrosoftGraphToken } from '@/features/conversations/email-engine'
import { decryptToken, encryptToken, hasValidEncryptionKey } from '@/lib/email-token-encryption'

export async function POST(req: NextRequest) {
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

  if (!hasValidEncryptionKey()) {
    return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 })
  }

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: existingConfig } = await admin
    .from('tenant_email_configs')
    .select('id, refresh_token_encrypted, expires_at')
    .eq('tenant_id', tenantId)
    .eq('provider', 'microsoft_graph')
    .eq('status', 'active')
    .maybeSingle()

  if (!existingConfig?.refresh_token_encrypted) {
    return NextResponse.json({ error: 'No Graph connection found for this tenant' }, { status: 404 })
  }

  const encryptionKey = process.env.EMAIL_TOKEN_ENCRYPTION_KEY!.trim()

  let refreshToken: string
  try {
    refreshToken = decryptToken(existingConfig.refresh_token_encrypted, encryptionKey)
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt token' }, { status: 500 })
  }

  try {
    const refreshed = await refreshMicrosoftGraphToken(config, refreshToken)

    const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()

    const encryptedAccess = encryptToken(refreshed.accessToken, encryptionKey)
    const encryptedRefresh = encryptToken(refreshed.refreshToken, encryptionKey)

    await admin
      .from('tenant_email_configs')
      .update({
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingConfig.id)

    return NextResponse.json({ status: 'ok', expiresAt })
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Token refresh failed'

    await admin
      .from('tenant_email_configs')
      .update({
        status: 'reconnect_required',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingConfig.id)

    return NextResponse.json({ error: reason, requiresReconnect: true }, { status: 401 })
  }
}
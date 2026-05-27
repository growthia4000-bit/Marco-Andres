import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { detectMicrosoftGraphConfig, exchangeMicrosoftGraphCode } from '@/features/conversations/email-engine'
import { encryptToken, hasValidEncryptionKey } from '@/lib/email-token-encryption'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const state = searchParams.get('state')

  if (error || errorDescription) {
    const errMsg = errorDescription || error || 'OAuth error'
    return NextResponse.redirect(`/channels?error=${encodeURIComponent(errMsg)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect('/channels?error=Missing+code+or+state')
  }

  const tenantId = state

  const config = detectMicrosoftGraphConfig(process.env)
  if (!config.configured) {
    return NextResponse.redirect('/channels?error=Microsoft+Graph+not+configured')
  }

  if (!hasValidEncryptionKey()) {
    return NextResponse.redirect('/channels?error=Encryption+key+not+configured')
  }

  let tokenData: { accessToken: string; refreshToken: string; expiresIn: number; email: string }
  try {
    tokenData = await exchangeMicrosoftGraphCode(config, code)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Token exchange failed'
    return NextResponse.redirect(`/channels?error=${encodeURIComponent(reason)}`)
  }

  const expiresAt = new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const encryptionKey = process.env.EMAIL_TOKEN_ENCRYPTION_KEY!.trim()

  const encryptedAccess = encryptToken(tokenData.accessToken, encryptionKey)
  const encryptedRefresh = encryptToken(tokenData.refreshToken, encryptionKey)

  const existingConfig = await admin
    .from('tenant_email_configs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('provider', 'microsoft_graph')
    .maybeSingle()

  if (existingConfig?.data) {
    await admin
      .from('tenant_email_configs')
      .update({
        email_address: tokenData.email || 'unknown@outlook.com',
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        expires_at: expiresAt,
        scopes: config.scopes,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingConfig.data.id)
  } else {
    await admin
      .from('tenant_email_configs')
      .insert({
        tenant_id: tenantId,
        provider: 'microsoft_graph',
        email_address: tokenData.email || 'unknown@outlook.com',
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        expires_at: expiresAt,
        scopes: config.scopes,
        status: 'active',
      })
  }

  return NextResponse.redirect('/channels?graph=connected')
}
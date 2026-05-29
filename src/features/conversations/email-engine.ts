import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'

export interface EmailAddress {
  name: string
  email: string
}

export interface EmailMessage {
  id: string
  from: EmailAddress
  to: EmailAddress[]
  subject: string
  text: string
  html?: string
  date: string
  message_id?: string
  in_reply_to?: string
  references?: string[]
}

export interface EmailMetadata {
  email_from?: string
  email_to?: string
  email_subject?: string
  email_message_id?: string
  email_in_reply_to?: string
  email_references?: string[]
  email_thread_id?: string
  reply_type?: 'human' | 'auto'
  email_delivery_provider?: 'none' | 'resend' | 'sendgrid' | 'postmark' | 'smtp' | 'microsoft_graph' | 'email_demo'
  email_delivery_status?: 'pending' | 'sent' | 'failed'
  email_delivery_error?: string
  email_delivery_response?: string
  email_delivery_provider_message_id?: string
  email_delivery_accepted?: string[]
  email_delivery_rejected?: string[]
}

export interface EmailDeliveryConfig {
  provider: 'none' | 'resend' | 'sendgrid' | 'postmark' | 'smtp' | 'microsoft_graph' | 'email_demo'
  configured: boolean
  reason?: string
  smtp?: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    fromEmail: string
    fromName: string
  }
  graph?: {
    accessToken: string
    refreshToken: string
    expiresAt: string
    emailAddress: string
  }
}

export interface EmailInboundConfig {
  configured: boolean
  reason?: string
  imap?: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    mailbox: string
    maxFetch: number
  }
}

export interface ImapInboundEmail {
  uid: number
  from: string
  to: string
  subject: string
  text: string
  html?: string
  date?: string
  message_id?: string
  in_reply_to?: string
  references?: string[]
}

function stringifyParsedAddress(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const candidate = input as { text?: string; value?: Array<{ name?: string | null; address?: string | null }> }
  if (typeof candidate.text === 'string' && candidate.text.trim()) return candidate.text.trim()
  if (Array.isArray(candidate.value)) {
    return candidate.value
      .map((entry) => {
        const name = entry.name?.trim()
        const address = entry.address?.trim()
        if (!address) return null
        return name ? `${name} <${address}>` : address
      })
      .filter((value): value is string => Boolean(value))
      .join(', ')
  }
  return ''
}

export interface SmtpSendResult {
  provider: 'smtp'
  status: 'sent'
  messageId?: string
  response?: string
  accepted: string[]
  rejected: string[]
}

export function parseEmailAddress(raw: string): EmailAddress {
  const match = raw.match(/^(.*?)\s*<(.+?)>$/)
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() }
  }
  return { name: '', email: raw.trim() }
}

export function findConversationByThreadId(
  threadId: string,
  existingConversations: Array<{ id: string; metadata: Record<string, unknown> }>
): string | null {
  for (const conv of existingConversations) {
    const meta = conv.metadata
    if (meta.email_thread_id === threadId) return conv.id
    if (meta.email_message_id && Array.isArray(meta.email_references) && meta.email_references.includes(threadId)) return conv.id
  }
  return null
}

export function generateEmailSubject(prefix: string, conversationSubject: string): string {
  if (conversationSubject.startsWith('Re:') || conversationSubject.startsWith('RE:')) {
    return conversationSubject
  }
  return `Re: ${conversationSubject || prefix}`
}

export function normalizeEmailSubject(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd):\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function resolveInboundTenantSlug(recipientEmail: string, env: Record<string, string | undefined>): string | null {
  const fallbackSlug = env.EMAIL_INBOUND_TENANT_SLUG?.trim() || null
  const localPart = recipientEmail.split('@')[0]?.trim() || null
  return fallbackSlug || localPart
}

export function detectEmailInboundConfig(env: Record<string, string | undefined>): EmailInboundConfig {
  const host = env.EMAIL_IMAP_HOST?.trim()
  const portRaw = env.EMAIL_IMAP_PORT?.trim()
  const user = env.EMAIL_IMAP_USER?.trim()
  const pass = env.EMAIL_IMAP_PASS?.trim()
  const secureRaw = env.EMAIL_IMAP_SECURE?.trim()
  const mailbox = env.EMAIL_IMAP_MAILBOX?.trim() || 'INBOX'
  const maxFetchRaw = env.EMAIL_IMAP_MAX_FETCH?.trim() || '25'

  const vars = {
    EMAIL_IMAP_HOST: host,
    EMAIL_IMAP_PORT: portRaw,
    EMAIL_IMAP_USER: user,
    EMAIL_IMAP_PASS: pass,
    EMAIL_IMAP_SECURE: secureRaw,
  }

  const defined = Object.values(vars).some(Boolean)
  if (!defined) {
    return { configured: false, reason: 'No IMAP inbound email credentials were found in the server environment.' }
  }

  const missing = Object.entries(vars).filter(([, value]) => !value).map(([key]) => key)
  if (missing.length > 0) {
    return { configured: false, reason: `Missing required IMAP env vars: ${missing.join(', ')}` }
  }

  const port = Number(portRaw)
  const maxFetch = Number(maxFetchRaw)
  if (!Number.isInteger(port) || port <= 0) {
    return { configured: false, reason: 'EMAIL_IMAP_PORT must be a valid positive integer.' }
  }

  if (!['true', 'false', '1', '0'].includes((secureRaw || '').toLowerCase())) {
    return { configured: false, reason: 'EMAIL_IMAP_SECURE must be true, false, 1, or 0.' }
  }

  return {
    configured: true,
    imap: {
      host: host!,
      port,
      secure: secureRaw === 'true' || secureRaw === '1',
      user: user!,
      pass: pass!,
      mailbox,
      maxFetch: Number.isInteger(maxFetch) && maxFetch > 0 ? maxFetch : 25,
    },
  }
}

export async function fetchInboundEmailsViaImap(config: NonNullable<EmailInboundConfig['imap']>): Promise<ImapInboundEmail[]> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
    // Prevent IDLE command in background/scheduler contexts — avoids "Unexpected close"
    disableAutoIdle: true,
    // Fail fast if the server doesn't respond during connection
    connectionTimeout: 30000,
    // Keep socket alive with TCP keepalives instead of relying on IMAP IDLE
    socketTimeout: 120000,
  })

  await client.connect()
  const lock = await client.getMailboxLock(config.mailbox)

  try {
    const exists = client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0
    if (exists === 0) return []

    const mailboxUids = await client.search({ all: true }, { uid: true })
    if (!mailboxUids || mailboxUids.length === 0) return []

    const recentUids = mailboxUids.slice(-config.maxFetch)
    const emails: ImapInboundEmail[] = []

    // Collect raw sources first to minimise time holding the IMAP socket open
    const rawMessages: Array<{ uid: number; source: Buffer; envelope: typeof message['envelope']; internalDate: typeof message['internalDate'] }> = []
    for await (const message of client.fetch(recentUids, { uid: true, source: true, envelope: true, internalDate: true }, { uid: true })) {
      if (!message.source) continue
      rawMessages.push({ uid: message.uid, source: message.source as Buffer, envelope: message.envelope, internalDate: message.internalDate })
    }

    // Parse emails after the IMAP fetch loop is complete (socket no longer needs to stay active)
    for (const message of rawMessages) {
      const parsed = await simpleParser(message.source)

      const from = stringifyParsedAddress(parsed.from) || message.envelope?.from?.map((entry) => `${entry.name || ''} <${entry.address || ''}>`).join(', ') || ''
      const to = stringifyParsedAddress(parsed.to) || message.envelope?.to?.map((entry) => `${entry.name || ''} <${entry.address || ''}>`).join(', ') || ''
      const subject = parsed.subject || message.envelope?.subject || '(sin asunto)'
      const text = parsed.text?.trim() || ''
      const html = typeof parsed.html === 'string' ? parsed.html : undefined
      const messageId = parsed.messageId || undefined
      const inReplyTo = parsed.inReplyTo || undefined
      const refs = Array.isArray(parsed.references)
        ? parsed.references.filter((value: unknown): value is string => typeof value === 'string')
        : typeof parsed.references === 'string'
          ? parsed.references.split(/\s+/).filter(Boolean)
          : []

      const internalDate = message.internalDate
      const normalizedDate = internalDate instanceof Date
        ? internalDate.toISOString()
        : typeof internalDate === 'string'
          ? internalDate
          : undefined

      emails.push({
        uid: message.uid,
        from,
        to,
        subject,
        text,
        html,
        date: parsed.date?.toISOString() || normalizedDate,
        message_id: messageId,
        in_reply_to: inReplyTo,
        references: refs,
      })
    }

    return emails.sort((left, right) => right.uid - left.uid)
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {
      // Ignore logout errors — connection may already be closed
    }
  }
}

export function detectEmailDeliveryConfig(env: Record<string, string | undefined>): EmailDeliveryConfig {
  const smtpHost = env.SMTP_HOST?.trim()
  const smtpPortRaw = env.SMTP_PORT?.trim()
  const smtpUser = env.SMTP_USER?.trim()
  const smtpPass = env.SMTP_PASS?.trim()
  const smtpSecureRaw = env.SMTP_SECURE?.trim()
  const smtpFromEmail = env.SMTP_FROM_EMAIL?.trim()
  const smtpFromName = env.SMTP_FROM_NAME?.trim()

  const smtpVars = {
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPortRaw,
    SMTP_USER: smtpUser,
    SMTP_PASS: smtpPass,
    SMTP_SECURE: smtpSecureRaw,
    SMTP_FROM_EMAIL: smtpFromEmail,
    SMTP_FROM_NAME: smtpFromName,
  }
  const smtpDefined = Object.values(smtpVars).some(Boolean)

  if (smtpDefined) {
    const missing = Object.entries(smtpVars)
      .filter(([, value]) => !value)
      .map(([key]) => key)

    const smtpPort = Number(smtpPortRaw)
    if (missing.length > 0) {
      return {
        provider: 'smtp',
        configured: false,
        reason: `Missing required SMTP env vars: ${missing.join(', ')}`,
      }
    }

    if (!Number.isInteger(smtpPort) || smtpPort <= 0) {
      return {
        provider: 'smtp',
        configured: false,
        reason: 'SMTP_PORT must be a valid positive integer.',
      }
    }

    if (!['true', 'false', '1', '0'].includes((smtpSecureRaw || '').toLowerCase())) {
      return {
        provider: 'smtp',
        configured: false,
        reason: 'SMTP_SECURE must be true, false, 1, or 0.',
      }
    }

    return {
      provider: 'smtp',
      configured: true,
      smtp: {
        host: smtpHost!,
        port: smtpPort,
        secure: smtpSecureRaw === 'true' || smtpSecureRaw === '1',
        user: smtpUser!,
        pass: smtpPass!,
        fromEmail: smtpFromEmail!,
        fromName: smtpFromName!,
      },
    }
  }

  if (env.RESEND_API_KEY) {
    return { provider: 'resend', configured: true }
  }

  if (env.SENDGRID_API_KEY) {
    return { provider: 'sendgrid', configured: true }
  }

  if (env.POSTMARK_SERVER_TOKEN) {
    return { provider: 'postmark', configured: true }
  }

  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS) {
    return { provider: 'smtp', configured: true }
  }

  return {
    provider: 'none',
    configured: false,
    reason: 'No outbound email provider credentials were found in the server environment.',
  }
}

export interface EmailDemoConfig {
  enabled: boolean
}

export function detectEmailDemoConfig(env: Record<string, string | undefined>): EmailDemoConfig {
  // Demo mode is disabled when any real email provider (SMTP, Resend, SendGrid, Postmark) is configured
  const hasSmtp = !!(env.SMTP_HOST?.trim() && env.SMTP_PORT?.trim() && env.SMTP_USER?.trim() && env.SMTP_PASS?.trim())
  const hasOtherProvider = !!(env.RESEND_API_KEY?.trim() || env.SENDGRID_API_KEY?.trim() || env.POSTMARK_SERVER_TOKEN?.trim())
  if (hasSmtp || hasOtherProvider) return { enabled: false }

  const enabled = env.EMAIL_DEMO_MODE?.trim() === 'true'
  return { enabled }
}

export interface EmailDemoSendResult {
  provider: 'email_demo'
  status: 'sent'
  messageId: string
  simulated: boolean
  delivered: boolean
}

export async function sendEmailViaDemo(params: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<EmailDemoSendResult> {
  const { to, subject, text, html } = params

  const messageId = `<demo-${Date.now()}-${Math.random().toString(36).slice(2, 11)}@inmocrm.demo>`

  return {
    provider: 'email_demo',
    status: 'sent',
    messageId,
    simulated: true,
    delivered: false,
  }
}

export async function sendEmailViaSmtp(params: {
  config: NonNullable<EmailDeliveryConfig['smtp']>
  to: string
  subject: string
  text: string
  html?: string
  messageId?: string
  inReplyTo?: string
  references?: string[]
}): Promise<SmtpSendResult> {
  const { config, to, subject, text, html, messageId, inReplyTo, references } = params

  // Port 465 always uses implicit SSL/TLS (secure must be true).
  // Port 587 uses STARTTLS (secure false, requireTLS true).
  const isPort465 = config.port === 465
  const secure = isPort465 ? true : config.secure

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    ...(isPort465 ? {} : { requireTLS: true }),
    auth: {
      user: config.user,
      pass: config.pass,
    },
  })

  const info = await transporter.sendMail({
    from: config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail,
    to,
    subject,
    text,
    html,
    messageId,
    inReplyTo,
    references,
  })

  return {
    provider: 'smtp',
    status: 'sent',
    messageId: info.messageId,
    response: info.response,
    accepted: (info.accepted || []).map((value) => String(value)),
    rejected: (info.rejected || []).map((value) => String(value)),
  }
}

export interface MicrosoftGraphConfig {
  configured: boolean
  reason?: string
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

export interface MicrosoftGraphSendResult {
  provider: 'microsoft_graph'
  status: 'sent'
  messageId?: string
  response?: string
  accepted: string[]
  rejected: string[]
}

export function detectMicrosoftGraphConfig(env: Record<string, string | undefined>): MicrosoftGraphConfig {
  const clientId = env.MICROSOFT_GRAPH_CLIENT_ID?.trim()
  const clientSecret = env.MICROSOFT_GRAPH_CLIENT_SECRET?.trim()
  const redirectUri = env.MICROSOFT_GRAPH_REDIRECT_URI?.trim()
  const enabled = env.EMAIL_GRAPH_ENABLED?.trim() === 'true'

  if (!enabled) {
    return { configured: false, reason: 'Microsoft Graph is not enabled (EMAIL_GRAPH_ENABLED != true)' }
  }

  if (!clientId) {
    return { configured: false, reason: 'MICROSOFT_GRAPH_CLIENT_ID is not configured' }
  }

  if (!clientSecret) {
    return { configured: false, reason: 'MICROSOFT_GRAPH_CLIENT_SECRET is not configured' }
  }

  if (!redirectUri) {
    return { configured: false, reason: 'MICROSOFT_GRAPH_REDIRECT_URI is not configured' }
  }

  const scopes = [
    'openid',
    'offline_access',
    'User.Read',
    'Mail.Send',
    'Mail.Read',
  ]

  return {
    configured: true,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
  }
}

export function buildMicrosoftGraphAuthUrl(config: MicrosoftGraphConfig, tenantId: string): string {
  if (!config.configured || !config.clientId || !config.redirectUri) {
    throw new Error('Microsoft Graph config is not complete')
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: config.scopes?.join(' ') || 'openid offline_access User.Read Mail.Send',
    state: tenantId,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

export async function exchangeMicrosoftGraphCode(
  config: MicrosoftGraphConfig,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; email: string }> {
  if (!config.configured || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('Microsoft Graph config is not complete')
  }

  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
    scope: config.scopes?.join(' ') || 'openid offline_access User.Read Mail.Send',
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Microsoft Graph token exchange failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
    id_token?: string
    token_type: string
  }

  let email = ''
  try {
    if (data.id_token) {
      const parts = data.id_token.split('.')
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
        email = payload.email || payload.preferred_username || ''
      }
    }
  } catch {
    // ignore
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    email,
  }
}

export async function refreshMicrosoftGraphToken(
  config: MicrosoftGraphConfig,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  if (!config.configured || !config.clientId || !config.clientSecret) {
    throw new Error('Microsoft Graph config is not complete')
  }

  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: config.scopes?.join(' ') || 'openid offline_access User.Read Mail.Send',
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Microsoft Graph token refresh failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

export async function sendEmailViaMicrosoftGraph(
  accessToken: string,
  params: {
    from: string
    to: string
    subject: string
    text: string
    html?: string
    messageId?: string
    inReplyTo?: string
    references?: string[]
  }
): Promise<MicrosoftGraphSendResult> {
  const { from, to, subject, text, html, messageId, inReplyTo, references } = params

  const message: Record<string, unknown> = {
    subject,
    body: {
      contentType: html ? 'HTML' : 'text',
      content: html || text,
    },
    toRecipients: [
      {
        emailAddress: {
          address: to,
        },
      },
    ],
    from: {
      emailAddress: {
        address: from,
      },
    },
  }

  if (messageId) {
    message.messageId = messageId
  }

  if (inReplyTo) {
    message.inReplyTo = [inReplyTo]
  }

  if (references && references.length > 0) {
    message.references = references.join(' ')
  }

  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Microsoft Graph sendMail failed: ${response.status} - ${errorText}`)
  }

  const location = response.headers.get('Location') || undefined
  const sentMessageId = messageId || location?.split('/').pop() || `<${Date.now()}@graph.local>`

  return {
    provider: 'microsoft_graph',
    status: 'sent',
    messageId: sentMessageId,
    response: location,
    accepted: [to],
    rejected: [],
  }
}

export async function fetchEmailsViaMicrosoftGraph(
  accessToken: string,
  params: {
    mailbox: string
    maxFetch: number
  }
): Promise<ImapInboundEmail[]> {
  const { mailbox, maxFetch } = params

  const query = new URLSearchParams({
    $top: String(maxFetch),
    $select: 'id,subject,from,to,bodyPreview,body,receivedDateTime,inReplyTo,references,internetMessageId',
    $orderby: 'receivedDateTime desc',
  })

  const response = await fetch(`https://graph.microsoft.com/v1.0/me/mailfolders('${mailbox}')/messages?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Microsoft Graph fetch failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as {
    value: Array<{
      id: string
      subject: string
      from: { emailAddress: { address: string; name?: string } }
      toRecipients: Array<{ emailAddress: { address: string; name?: string } }>
      bodyPreview?: string
      body?: { contentType: string; content: string }
      receivedDateTime: string
      inReplyTo?: string
      references?: string
      internetMessageId: string
    }>
  }

  return (data.value || []).map((msg) => ({
    uid: parseInt(msg.id.replace(/[^0-9]/g, '').slice(0, 8)) || 0,
    from: msg.from?.emailAddress?.name
      ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
      : msg.from?.emailAddress?.address || '',
    to: msg.toRecipients
      ?.map((r) => r.emailAddress?.name
        ? `${r.emailAddress.name} <${r.emailAddress.address}>`
        : r.emailAddress?.address || '')
      .join(', ') || '',
    subject: msg.subject || '',
    text: msg.body?.contentType === 'text' ? msg.body.content : msg.bodyPreview || '',
    html: msg.body?.contentType === 'HTML' ? msg.body.content : undefined,
    date: msg.receivedDateTime,
    message_id: msg.internetMessageId,
    in_reply_to: msg.inReplyTo,
    references: msg.references?.split(/\s+/).filter(Boolean) || [],
  }))
}

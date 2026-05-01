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
  email_delivery_provider?: 'none' | 'resend' | 'sendgrid' | 'postmark' | 'smtp'
  email_delivery_status?: 'pending' | 'sent' | 'failed'
  email_delivery_error?: string
  email_delivery_response?: string
  email_delivery_provider_message_id?: string
  email_delivery_accepted?: string[]
  email_delivery_rejected?: string[]
}

export interface EmailDeliveryConfig {
  provider: 'none' | 'resend' | 'sendgrid' | 'postmark' | 'smtp'
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

    for await (const message of client.fetch(recentUids, { uid: true, source: true, envelope: true, internalDate: true }, { uid: true })) {
      if (!message.source) continue
      const parsed = await simpleParser(message.source as Buffer)

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
    await client.logout()
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

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
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

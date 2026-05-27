import type { WhatsAppTemplateVariable } from './whatsapp-templates'

export type MetaWhatsAppTemplateConfig = {
  token: string
  whatsappBusinessAccountId: string
}

export type TenantWhatsAppTemplateMetaPayload = {
  meta_template_name: string
  language_code: string
  category: string
  body_text: string
  header_text: string | null
  footer_text: string | null
  variables_schema: WhatsAppTemplateVariable[]
}

export type MetaTemplateSyncRecord = {
  id?: string
  name: string
  status?: string
  language?: string
  category?: string
  reason?: string | null
  rejected_reason?: string | null
  components?: Array<{
    type?: string
    format?: string | null
    text?: string | null
  }>
}

async function parseMetaResponse(response: Response) {
  const raw = await response.text()
  let parsed: any = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const apiError = parsed?.error
    const message = apiError?.message || apiError?.error_user_msg || raw || `Meta API responded with ${response.status}`
    const code = apiError?.code ? `code=${apiError.code}` : null
    const subcode = apiError?.error_subcode ? `subcode=${apiError.error_subcode}` : null
    const detail = apiError?.error_data?.details || null
    throw new Error([message, detail, code, subcode].filter(Boolean).join(' | '))
  }

  return parsed
}

function buildBodyExample(variables: WhatsAppTemplateVariable[]) {
  if (!variables.length) return undefined
  return {
    body_text: [variables.map((variable) => variable.example || variable.label || variable.key)],
  }
}

export async function publishTemplateToMeta(config: MetaWhatsAppTemplateConfig, template: TenantWhatsAppTemplateMetaPayload) {
  const components: Array<Record<string, unknown>> = []

  if (template.header_text?.trim()) {
    components.push({
      type: 'HEADER',
      format: 'TEXT',
      text: template.header_text.trim(),
    })
  }

  components.push({
    type: 'BODY',
    text: template.body_text,
    ...(template.variables_schema.length > 0 ? { example: buildBodyExample(template.variables_schema) } : {}),
  })

  if (template.footer_text?.trim()) {
    components.push({
      type: 'FOOTER',
      text: template.footer_text.trim(),
    })
  }

  const response = await fetch(`https://graph.facebook.com/v23.0/${config.whatsappBusinessAccountId}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: template.meta_template_name,
      language: template.language_code,
      category: template.category.toUpperCase(),
      components,
    }),
  })

  return parseMetaResponse(response)
}

export async function syncTemplatesFromMeta(config: MetaWhatsAppTemplateConfig) {
  const records: MetaTemplateSyncRecord[] = []
  let after: string | null = null

  do {
    const url = new URL(`https://graph.facebook.com/v23.0/${config.whatsappBusinessAccountId}/message_templates`)
    url.searchParams.set('limit', '100')
    url.searchParams.set('fields', 'id,name,status,language,category,rejected_reason,reason,components')
    if (after) url.searchParams.set('after', after)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      cache: 'no-store',
    })

    const parsed = await parseMetaResponse(response)
    records.push(...((parsed?.data || []) as MetaTemplateSyncRecord[]))
    after = parsed?.paging?.cursors?.after || null
  } while (after)

  return records
}

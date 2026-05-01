'use server'

import { generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { AI_MODELS, getOpenRouterProvider, hasAiProviderConfig } from '@/lib/ai/openrouter'
import { detectWhatsAppDeliveryConfig, sendWhatsAppViaMeta, resolveTemplateByKeyAndLocale } from '@/features/conversations/whatsapp-engine'
import { revalidatePath } from 'next/cache'

type LeadEmailLocale = 'es' | 'it' | 'en'

type LeadEmailDraftInput = {
  locale: LeadEmailLocale
  variationIndex?: number
  previousDraft?: {
    subject?: string | null
    body?: string | null
  }
  lead: {
    firstName: string
    lastName?: string | null
    email?: string | null
    phone?: string | null
    budget?: string | null
    preferredArea?: string | null
    preferredType?: string | null
    source?: string | null
    status?: string | null
    notes?: string | null
  }
}

type LeadEmailDraftResult = {
  subject: string
  body: string
  mode: 'ai' | 'fallback'
  source: string
}

type VariantKey = 'direct' | 'consultative' | 'call' | 'selection'

const VARIANT_SEQUENCE: VariantKey[] = ['direct', 'consultative', 'call', 'selection']
const MAX_AI_DRAFT_ATTEMPTS = 6

const COPY = {
  es: {
    system: 'Eres la persona responsable comercial de una inmobiliaria. Escribe emails cortos, profesionales, útiles y naturales. No menciones que eres IA. No inventes datos. No uses placeholders como [Tu Nombre], [Nombre de la Inmobiliaria] o tuemail@inmobiliaria.com. No inventes horarios concretos ni afirmes disponibilidad de propiedades u opciones si no están en los datos. No asumas que el lead es propietario si eso no aparece en los datos. No uses frases raras, coloquiales o poco profesionales. No firmes como si conocieras la identidad del remitente: no añadas nombres propios, nombres de empresa, cargos ni firmas genéricas si no vienen en los datos. Usa un tono cercano, sobrio y orientado a ayudar al lead a avanzar.',
    promptIntro: 'Escribe un email comercial corto listo para enviar a este lead.',
    promptFocus: 'Si hay presupuesto, zona, tipo de propiedad o notas, intégralos de forma natural. Si el lead ya está avanzado, escribe como continuación. Si está en fase inicial, escribe como primer seguimiento. Termina siempre con un siguiente paso realista. No inventes número de propiedades, metros, condiciones de alquiler, visitas, disponibilidad ni horarios concretos. No digas que has encontrado, revisado o seleccionado opciones salvo que ese dato exista realmente. No uses expresiones como “opciones disponibles”, “las opciones disponibles”, “opciones actuales”, “opciones que podrían encajar”, “opciones que encajan ahora”, “tenemos disponibles”, “disponemos de” ni equivalentes si no hay confirmación real. Evita frases raras o poco elegantes como “estamos a la vuelta de casa”. Si no hay agenda real, usa una CTA neutra del tipo “si te parece, dime qué horario te viene bien”. Si no hay propiedades confirmadas, usa formulaciones prudentes como “puedo orientarte”, “puedo ayudarte a revisar la búsqueda” o “puedo preparar una orientación inicial”. Cierra de forma neutra y profesional, sin género ni firma inventada.',
    output: 'Devuelve solo JSON válido con dos claves: subject y body. Sin markdown, sin HTML, sin placeholders y sin texto extra fuera del JSON.',
    fallbackSubject: 'Seguimiento de tu búsqueda inmobiliaria',
    fallbackGreeting: 'Hola',
    fallbackLine1: 'Quería retomar tu búsqueda inmobiliaria y ayudarte a enfocar el siguiente paso con más claridad.',
    fallbackLine2: 'Si te parece, puedo orientarte mejor según tus preferencias y ayudarte a decidir el siguiente paso con criterio.',
    fallbackClosing: 'Seguimos a partir de aquí cuando te venga bien.',
    fallbackSourceIntro: 'Como llegaste a través de {source}, quería darte seguimiento de forma clara y útil.',
    fallbackStatusQualified: 'Como ya tenemos una visión más clara de tu búsqueda, puedo ayudarte a enfocar mejor el siguiente paso.',
    fallbackStatusVisit: 'Como el seguimiento ya está en una fase avanzada, puedo ayudarte a concretar mejor cómo avanzar.',
    fallbackStatusNegotiation: 'Como la conversación ya está avanzada, puedo ayudarte a definir con más precisión el siguiente paso.',
    fallbackPreferences: 'Tengo presente tu interés en {details}.',
    fallbackNotes: 'También tengo en cuenta esta nota importante: {notes}',
    fallbackCtaInitial: 'Si te parece, puedo prepararte una orientación inicial breve y bien enfocada.',
    fallbackCtaAdvanced: 'Si te viene bien, dime qué horario te encaja mejor y coordinamos una llamada breve.',
    variants: {
      direct: {
        label: 'seguimiento directo breve',
        subject: 'Seguimiento de tu búsqueda inmobiliaria',
        intro: 'Te escribo brevemente para dar seguimiento a tu búsqueda y ayudarte a avanzar de forma práctica.',
        cta: 'Si te parece, puedo enviarte una orientación breve y revisar contigo el siguiente paso con calma.',
      },
      consultative: {
        label: 'seguimiento consultivo',
        subject: 'Podemos afinar mejor tu búsqueda',
        intro: 'Quiero ayudarte a afinar mejor tu búsqueda para enfocar el siguiente paso con más claridad.',
        cta: 'Si quieres, respóndeme con los detalles más importantes y preparo una orientación más precisa.',
      },
      call: {
        label: 'seguimiento orientado a llamada',
        subject: '¿Te viene bien una llamada breve para avanzar?',
        intro: 'Una llamada breve puede ayudarnos a aclarar prioridades y facilitar mucho el siguiente paso.',
        cta: 'Si te parece bien, dime qué horario te viene mejor y coordinamos una llamada breve.',
      },
      selection: {
        label: 'seguimiento orientado a revisión de opciones',
        subject: 'Puedo ayudarte a revisar opciones con mejor enfoque',
        intro: 'Puedo ayudarte a revisar opciones con mejor enfoque para avanzar solo con lo que realmente encaje.',
        cta: 'Si te parece, te preparo una orientación breve y revisamos juntos cómo seguir.',
      },
    },
  },
  it: {
    system: 'Sei il responsabile commerciale di un’agenzia immobiliare. Scrivi email brevi, professionali, utili e naturali. Non dire che sei un’IA. Non inventare dati. Non usare placeholder come [Il tuo nome], [Nome agenzia] o tuemail@inmobiliaria.com. Non inventare orari specifici e non affermare disponibilità di immobili o opzioni se non sono presenti nei dati. Non assumere che il lead sia proprietario se non è indicato nei dati. Usa un tono caldo, sicuro e orientato ad aiutare il lead a fare il passo successivo.',
    promptIntro: 'Scrivi una email commerciale breve pronta da inviare a questo lead.',
    promptFocus: 'Se sono disponibili budget, zona, tipo di immobile o note, integrali in modo naturale. Se il lead è già avanzato, scrivi come continuazione. Se è in fase iniziale, scrivi come primo follow-up. Chiudi sempre con un passo successivo realistico. Non inventare numero di immobili, metri quadri, condizioni di affitto, visite, disponibilità o orari specifici. Non dire di aver trovato, revisionato o selezionato opzioni se questo non risulta dai dati. Se non c’è agenda reale, usa una CTA neutra come “dimmi quale orario ti è più comodo”. Se non ci sono immobili confermati, usa formule prudenti come “posso orientarti” o “posso aiutarti a valutare le opzioni”.',
    output: 'Restituisci solo JSON valido con due chiavi: subject e body. Niente markdown, niente HTML, niente placeholder e nessun testo extra fuori dal JSON.',
    fallbackSubject: 'Follow-up della tua ricerca immobiliare',
    fallbackGreeting: 'Ciao',
    fallbackLine1: 'Grazie per il tuo interesse. Ti scrivo per seguire la tua ricerca immobiliare e aiutarti ad avanzare con più chiarezza.',
    fallbackLine2: 'Se per te va bene, posso orientarti meglio in base alle tue preferenze e aiutarti a chiarire il prossimo passo.',
    fallbackClosing: 'Resto in attesa di un tuo riscontro.',
    fallbackSourceIntro: 'Dato che sei arrivato tramite {source}, volevo ricontattarti in modo chiaro e utile.',
    fallbackStatusQualified: 'Dato che abbiamo già una visione più chiara della tua ricerca, posso aiutarti a definire meglio il passo successivo.',
    fallbackStatusVisit: 'Dato che il follow-up è già in una fase avanzata, posso aiutarti a rendere più concreto il prossimo passo.',
    fallbackStatusNegotiation: 'Dato che la conversazione è già avanzata, posso aiutarti a chiarire meglio il prossimo passo.',
    fallbackPreferences: 'Tengo presente il tuo interesse per {details}.',
    fallbackNotes: 'Tengo conto anche di questa nota importante: {notes}',
    fallbackCtaInitial: 'Se vuoi, posso darti un orientamento breve e ben mirato.',
    fallbackCtaAdvanced: 'Se per te va bene, dimmi quale orario ti è più comodo e organizziamo una breve chiamata.',
    variants: {
      direct: {
        label: 'follow-up diretto breve',
        subject: 'Follow-up della tua ricerca immobiliare',
        intro: 'Ti scrivo brevemente per seguire la tua ricerca e aiutarti ad avanzare in modo pratico.',
        cta: 'Se vuoi, posso inviarti un orientamento breve e rivedere insieme il prossimo passo.',
      },
      consultative: {
        label: 'follow-up consultivo',
        subject: 'Possiamo affinare meglio la tua ricerca',
        intro: 'Vorrei aiutarti ad affinare meglio la tua ricerca per impostare con più chiarezza il passo successivo.',
        cta: 'Se vuoi, rispondimi con i dettagli più importanti e preparo un orientamento più preciso.',
      },
      call: {
        label: 'follow-up orientato a una chiamata',
        subject: 'Ti va una breve chiamata per fare il punto?',
        intro: 'Una breve chiamata può aiutarci a chiarire le priorità e rendere più semplice il prossimo passo.',
        cta: 'Se per te va bene, dimmi quale orario ti è più comodo e organizziamo una breve chiamata.',
      },
      selection: {
        label: 'follow-up orientato alla revisione delle opzioni',
        subject: 'Posso aiutarti a valutare opzioni più in linea',
        intro: 'Posso aiutarti a valutare opzioni più in linea con la tua ricerca, così da avanzare solo con ciò che ha davvero senso.',
        cta: 'Se sei d’accordo, ti preparo un orientamento breve e lo rivediamo insieme.',
      },
    },
  },
  en: {
    system: 'You are the commercial lead at a real estate agency. Write short, professional, useful, natural emails. Do not mention being AI. Do not invent facts. Do not use placeholders like [Your Name], [Agency Name], or youremail@inmobiliaria.com. Do not invent specific schedules or claim availability of properties or options if they are not in the data. Do not assume the lead is an owner unless the data says so. Use a warm, confident tone focused on helping the lead move forward.',
    promptIntro: 'Write a short commercial email that is ready to send to this lead.',
    promptFocus: 'If budget, area, preferred property type, or notes are available, weave them in naturally. If the lead is already advanced, write as a continuation. If the lead is early stage, write as a first follow-up. Always end with a realistic next step. Do not invent property counts, square footage, rental conditions, visits, availability, or specific schedules. Do not say you found, reviewed, or shortlisted options unless that is explicitly present in the data. If there is no real calendar availability, use a neutral CTA such as “let me know what time works best for you”. If no properties are confirmed, use cautious phrasing such as “I can help guide you” or “I can help you review options”.',
    output: 'Return only valid JSON with two keys: subject and body. No markdown, no HTML, no placeholders, and no extra text outside the JSON.',
    fallbackSubject: 'Following up on your property search',
    fallbackGreeting: 'Hello',
    fallbackLine1: 'Thank you for your interest. I am reaching out to follow up on your property search and help you move forward more clearly.',
    fallbackLine2: 'If helpful, I can better guide you based on your preferences and help clarify the next step.',
    fallbackClosing: 'I look forward to hearing from you.',
    fallbackSourceIntro: 'Since you came through {source}, I wanted to follow up in a clear and helpful way.',
    fallbackStatusQualified: 'As we already have a clearer view of your search, I can help shape the next step more precisely.',
    fallbackStatusVisit: 'As the follow-up is already at an advanced stage, I can help make the next step more concrete.',
    fallbackStatusNegotiation: 'As the conversation is already advanced, I can help clarify the next step with more precision.',
    fallbackPreferences: 'I am keeping your interest in {details} in mind.',
    fallbackNotes: 'I am also taking this important note into account: {notes}',
    fallbackCtaInitial: 'If helpful, I can share a short and well-focused recommendation.',
    fallbackCtaAdvanced: 'If it works for you, let me know what time suits you best and we can set up a short call.',
    variants: {
      direct: {
        label: 'brief direct follow-up',
        subject: 'Following up on your property search',
        intro: 'I wanted to follow up briefly and help you move your search forward in a practical way.',
        cta: 'If helpful, I can share a short recommendation and review the next step with you.',
      },
      consultative: {
        label: 'consultative follow-up',
        subject: 'Let us refine your property search',
        intro: 'I would like to help refine your search so the next step is better focused from the start.',
        cta: 'If you like, reply with the key details and I will prepare a more precise recommendation.',
      },
      call: {
        label: 'call-oriented follow-up',
        subject: 'Would a short call help move this forward?',
        intro: 'A short call could help us align priorities quickly and make the next step much easier.',
        cta: 'If it suits you, let me know what time works best and we can arrange a quick call.',
      },
      selection: {
        label: 'option-review follow-up',
        subject: 'I can help you review more relevant options',
        intro: 'I can help you review more relevant options so you only move forward with what truly fits.',
        cta: 'If that works for you, I can prepare a short recommendation and review it with you right away.',
      },
    },
  },
} as const

function safeTrim(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildLeadContext(input: LeadEmailDraftInput) {
  const fullName = [input.lead.firstName, input.lead.lastName].filter(Boolean).join(' ').trim()

  return [
    `Lead name: ${fullName || input.lead.firstName}`,
    input.lead.email ? `Lead email: ${input.lead.email}` : '',
    input.lead.phone ? `Lead phone: ${input.lead.phone}` : '',
    input.lead.budget ? `Budget: ${input.lead.budget}` : '',
    input.lead.preferredArea ? `Preferred area: ${input.lead.preferredArea}` : '',
    input.lead.preferredType ? `Preferred property type: ${input.lead.preferredType}` : '',
    input.lead.source ? `Lead source: ${input.lead.source}` : '',
    input.lead.status ? `Current lead status: ${input.lead.status}` : '',
    input.lead.notes ? `Notes: ${input.lead.notes}` : '',
  ].filter(Boolean).join('\n')
}

function trimNote(notes?: string | null) {
  const note = safeTrim(notes)
  if (!note) return ''
  return note.length > 220 ? `${note.slice(0, 217)}...` : note
}

function getVariant(input: LeadEmailDraftInput) {
  const index = typeof input.variationIndex === 'number' ? input.variationIndex : 0
  return {
    index,
    key: VARIANT_SEQUENCE[((index % VARIANT_SEQUENCE.length) + VARIANT_SEQUENCE.length) % VARIANT_SEQUENCE.length],
  }
}

const UNSAFE_DRAFT_PATTERNS = [
  /\[[^\]]+\]/,
  /tuemail@inmobiliaria\.com/i,
  /youremail@inmobiliaria\.com/i,
  /tuaemail@inmobiliaria\.com/i,
  /he encontrado\s+\d+\s+(?:propiedades|opciones)/i,
  /ho trovato\s+\d+\s+(?:immobili|opzioni)/i,
  /i(?: have|'ve) found\s+\d+\s+(?:properties|options)/i,
  /\b\d+\s*(?:-|a|to)\s*\d+\s*(?:m²|m2|sqm|sq m|metri|metros)\b/i,
  /alquiler semi[- ]?mensual/i,
  /semi[- ]?monthly rent/i,
  /podemos coordinar una visita/i,
  /possiamo organizzare una visita/i,
  /we can arrange a viewing/i,
  /he revisado opciones/i,
  /ho revisionato opzioni/i,
  /i have reviewed options/i,
  /tengo varias opciones/i,
  /ho diverse opzioni/i,
  /i have several options/i,
  /disponemos de propiedades/i,
  /abbiamo disponibili immobili/i,
  /we have available properties/i,
  /las opciones disponibles/i,
  /tenemos disponibles/i,
  /disponemos de opciones disponibles/i,
  /tu equipo inmobiliario/i,
  /your real estate team/i,
  /il tuo team immobiliare/i,
  /soy\s+[A-ZÁÉÍÓÚÑ][\p{L}' -]{1,40},?\s+del equipo comercial/iu,
  /i[' ]?m\s+[A-Z][\p{L}' -]{1,40},?\s+from the commercial team/iu,
  /sono\s+[A-ZÀ-ÖØ-Ý][\p{L}' -]{1,40},?\s+del team commerciale/iu,
  /a la vuelta de casa/i,
]

function hasUnsafeDraftContent(subject: string, body: string) {
  const combined = `${subject}\n${body}`
  return UNSAFE_DRAFT_PATTERNS.some((pattern) => pattern.test(combined))
}

function parseDraft(text: string) {
  // Try to parse the whole text as JSON first
  try {
    const json = JSON.parse(text) as { subject?: string; body?: string }
    if (safeTrim(json.subject) && safeTrim(json.body)) {
      return {
        subject: safeTrim(json.subject),
        body: safeTrim(json.body),
      }
    }
  } catch {
    // If fails, try to extract JSON object from the text
  }

  // Fallback: find the first '{' and the last '}' and try to parse that substring
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null

  try {
    const json = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as { subject?: string; body?: string }
    if (safeTrim(json.subject) && safeTrim(json.body)) {
      return {
        subject: safeTrim(json.subject),
        body: safeTrim(json.body),
      }
    }
  } catch {
    return null
  }

  return null
}

function buildSpanishFallbackBody(args: {
  copy: (typeof COPY)['es']
  name: string
  intro: string
  source: string
  statusLine: string
  details: string
  note: string
  cta: string
}) {
  const { copy, name, intro, source, statusLine, details, note, cta } = args

  const contextLine = [
    note ? copy.fallbackNotes.replace('{notes}', note) : '',
    details ? copy.fallbackPreferences.replace('{details}', details) : '',
    source ? copy.fallbackSourceIntro.replace('{source}', source) : '',
    statusLine,
    copy.fallbackLine1,
  ].find(Boolean) || copy.fallbackLine1

  return [
    `${copy.fallbackGreeting} ${name},`,
    '',
    intro,
    contextLine,
    cta,
    '',
    copy.fallbackClosing,
  ].join('\n')
}

function buildFallbackDraft(input: LeadEmailDraftInput, fallbackReason?: string): LeadEmailDraftResult {
  const copy = COPY[input.locale]
  const variant = getVariant(input)
  const variantCopy = copy.variants[variant.key]
  const name = input.lead.firstName || 'there'
  const details = [
    input.lead.preferredArea,
    input.lead.preferredType,
    input.lead.budget,
  ].filter(Boolean).join(' · ')
  const status = safeTrim(input.lead.status).toLowerCase()
  const source = safeTrim(input.lead.source)
  const note = trimNote(input.lead.notes)
  const statusLine = status.includes('qual')
    ? copy.fallbackStatusQualified
    : status.includes('visit') || status.includes('visita')
      ? copy.fallbackStatusVisit
      : status.includes('negot')
        ? copy.fallbackStatusNegotiation
        : ''
  const ctaLine = variant.key === 'call'
    ? copy.fallbackCtaAdvanced
    : variant.key === 'selection'
      ? copy.fallbackCtaInitial
      : statusLine
        ? copy.fallbackCtaAdvanced
        : copy.fallbackCtaInitial

  const body = input.locale === 'es'
    ? buildSpanishFallbackBody({
        copy: COPY.es,
        name,
        intro: variantCopy.intro,
        source,
        statusLine,
        details,
        note,
        cta: variantCopy.cta || ctaLine,
      })
    : [
        `${copy.fallbackGreeting} ${name},`,
        '',
        variantCopy.intro,
        copy.fallbackLine1,
        source ? copy.fallbackSourceIntro.replace('{source}', source) : '',
        statusLine,
        details ? copy.fallbackPreferences.replace('{details}', details) : '',
        note ? copy.fallbackNotes.replace('{notes}', note) : '',
        variant.key === 'consultative' ? '' : copy.fallbackLine2,
        ctaLine,
        variantCopy.cta,
        '',
        copy.fallbackClosing,
      ].filter(Boolean).join('\n')

  return {
    subject: variantCopy.subject || copy.fallbackSubject,
    body,
    mode: 'fallback',
    source: `${fallbackReason || (hasAiProviderConfig() ? 'fallback_parse_error' : 'fallback_no_provider')}:${variant.key}`,
  }
}

export async function generateLeadEmailDraftAction(input: LeadEmailDraftInput): Promise<LeadEmailDraftResult> {
  if (!input.lead.email) {
    throw new Error('Lead email is required to generate an email draft')
  }

  if (!hasAiProviderConfig()) {
    return buildFallbackDraft(input)
  }

  try {
    const openrouter = getOpenRouterProvider()
    const copy = COPY[input.locale]
    const variant = getVariant(input)
    const previousSubject = safeTrim(input.previousDraft?.subject)
    const previousBody = safeTrim(input.previousDraft?.body)

    let lastParseFailure = false
    let lastGuardrailFailure = false

    for (let attempt = 0; attempt < MAX_AI_DRAFT_ATTEMPTS; attempt += 1) {
      try {
        const { text } = await generateText({
          model: openrouter(AI_MODELS.balanced),
          system: copy.system,
          prompt: [
            copy.promptIntro,
            `Genera la variante con este enfoque: ${copy.variants[variant.key].label}.`,
            buildLeadContext(input),
            copy.promptFocus,
            previousSubject || previousBody ? `Borrador anterior para evitar repeticiones:\nAsunto: ${previousSubject || '-'}\nCuerpo:\n${previousBody || '-'}` : '',
            'La nueva version debe ser claramente distinta en enfoque, CTA y forma de abrir el mensaje. No repitas estructuras ni frases del borrador anterior.',
            copy.output,
          ].join('\n\n'),
          temperature: 0.4,
          maxOutputTokens: 420,
        })

        const parsed = parseDraft(text)
        if (!parsed) {
          lastParseFailure = true
          continue
        }

        if (hasUnsafeDraftContent(parsed.subject, parsed.body)) {
          lastGuardrailFailure = true
          continue
        }

        return {
          subject: parsed.subject,
          body: parsed.body,
          mode: 'ai',
          source: `openrouter_balanced:${variant.key}`,
        }
      } catch (error) {
        if (attempt === MAX_AI_DRAFT_ATTEMPTS - 1) {
          throw error
        }
      }
    }

    if (lastGuardrailFailure) return buildFallbackDraft(input, 'fallback_guardrail_error')
    if (lastParseFailure) return buildFallbackDraft(input, 'fallback_parse_error')
    return buildFallbackDraft(input, 'fallback_ai_error:no_valid_output')
  } catch (error) {
    console.error('[lead ai email] generation failed', error)
    const message = error instanceof Error ? error.message : 'unknown_ai_error'
    return buildFallbackDraft(input, `fallback_ai_error:${message}`)
  }
}

export async function reactivateLeadAction(leadId: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, tenant_id, first_name, last_name, phone, status, metadata')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) throw new Error('Lead no encontrado')
  if (!lead.phone) throw new Error('Lead sin teléfono para reactivar')

  const tenantId = lead.tenant_id
  const contactPhone = lead.phone
  const contactLocale = (lead.metadata as Record<string, unknown>)?.locale as string || 'es'

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    action: 'lead.reactivated',
    entity_type: 'lead',
    entity_id: leadId,
    metadata: { event_type: 'MANUAL_ACTION', trigger: 'manual.reactivate' },
  })

  const dbConfigResponse = await supabase
    .from('tenant_whatsapp_configs')
    .select('phone_number_id, access_token_encrypted, mode, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  let deliveryConfig = detectWhatsAppDeliveryConfig(process.env)

  if (dbConfigResponse?.data?.phone_number_id && dbConfigResponse.data.access_token_encrypted) {
    deliveryConfig = {
      provider: 'meta_cloud',
      configured: true,
      meta: {
        token: dbConfigResponse.data.access_token_encrypted,
        phoneNumberId: dbConfigResponse.data.phone_number_id,
      },
    }
  }

  if (deliveryConfig.configured && deliveryConfig.meta) {
    const resolved = resolveTemplateByKeyAndLocale('lead_reactivacion', contactLocale)
    const templateName = resolved?.templateName || 'lead_reactivacion_es'
    const langCode = resolved?.localeCode || 'es'
    const templateParams: string[] = []

    console.log('[reactivateLeadAction] Sending lead_reactivacion template', {
      template: templateName,
      lang: langCode,
      leadId,
      tenantId,
    })

    const waResult = await sendWhatsAppViaMeta({
      config: deliveryConfig.meta,
      to: contactPhone,
      text: templateParams.join('|'),
      templateName,
      templateParams,
      templateLanguageCode: langCode,
    })

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: waResult.status === 'sent' ? 'whatsapp.reactivacion_template.sent' : 'whatsapp.reactivacion_template.failed',
      entity_type: 'lead',
      entity_id: leadId,
      actor_user_id: user.id,
      payload: {
        from: contactPhone,
        template_name: waResult.template_name,
        template_key_base: 'lead_reactivacion',
        locale_resolved: resolved?.localeCode || langCode,
        used_fallback: resolved?.usedFallback || false,
        provider_message_id: waResult.provider_message_id,
        status: waResult.status,
        error: waResult.error,
        trigger: 'manual.reactivate',
      },
    })

    revalidatePath(`/leads/${leadId}`)
    return {
      success: waResult.status === 'sent',
      template: templateName,
      providerMessageId: waResult.provider_message_id,
      status: waResult.status,
      error: waResult.error,
    }
  }

  await supabase.from('automation_events').insert({
    tenant_id: tenantId,
    event_type: 'whatsapp.reactivacion_template.no_config',
    entity_type: 'lead',
    entity_id: leadId,
    actor_user_id: user.id,
    payload: { trigger: 'manual.reactivate', reason: 'whatsapp_not_configured' },
  })

  return { success: false, error: 'WhatsApp no configurado' }
}

function normalizeLeadPhone(phone: string | null | undefined) {
  return (phone || '').replace(/[^0-9+]/g, '')
}

export async function ensureLeadWhatsAppConversationAction(leadId: string) {
  const supabase = await createClient()
  const openedAt = new Date().toISOString()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, tenant_id, first_name, last_name, phone')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) throw new Error('Lead no encontrado')

  const normalizedPhone = normalizeLeadPhone(lead.phone)

  const { data: byLead, error: byLeadError } = await supabase
    .from('conversations')
    .select('id, metadata, created_at')
    .eq('tenant_id', lead.tenant_id)
    .eq('channel', 'whatsapp')
    .eq('lead_id', lead.id)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (byLeadError) throw new Error(byLeadError.message)

  const existingByLead = byLead?.[0]
  if (existingByLead) {
    await supabase
      .from('conversations')
      .update({ last_message_at: openedAt })
      .eq('id', existingByLead.id)
      .eq('tenant_id', lead.tenant_id)

    return { id: existingByLead.id, created: false }
  }

  let existingByPhone: { id: string } | null = null
  if (normalizedPhone) {
    const { data: whatsappConversations, error: phoneSearchError } = await supabase
      .from('conversations')
      .select('id, metadata')
      .eq('tenant_id', lead.tenant_id)
      .eq('channel', 'whatsapp')
      .order('updated_at', { ascending: false })

    if (phoneSearchError) throw new Error(phoneSearchError.message)

    existingByPhone = (whatsappConversations || []).find((conversation) => {
      const metadata = (conversation.metadata || {}) as Record<string, unknown>
      return normalizeLeadPhone(typeof metadata.whatsapp_from === 'string' ? metadata.whatsapp_from : null) === normalizedPhone
        || normalizeLeadPhone(typeof metadata.last_whatsapp_to === 'string' ? metadata.last_whatsapp_to : null) === normalizedPhone
        || normalizeLeadPhone(typeof metadata.contact_phone === 'string' ? metadata.contact_phone : null) === normalizedPhone
    }) || null
  }

  if (existingByPhone) {
    const { error: attachLeadError } = await supabase
      .from('conversations')
      .update({ lead_id: lead.id, last_message_at: openedAt })
      .eq('id', existingByPhone.id)
      .eq('tenant_id', lead.tenant_id)

    if (attachLeadError) throw new Error(attachLeadError.message)
    return { id: existingByPhone.id, created: false }
  }

  const contactName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.first_name || 'Lead'
  const subject = `WhatsApp: ${contactName}`
  const metadata: Record<string, unknown> = normalizedPhone
    ? {
        whatsapp_from: normalizedPhone,
        last_whatsapp_to: normalizedPhone,
        contact_phone: normalizedPhone,
        whatsapp_contact_name: contactName,
      }
    : {
        whatsapp_contact_name: contactName,
      }

  const { data: conversation, error: insertError } = await supabase
    .from('conversations')
    .insert({
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      subject,
      channel: 'whatsapp',
      status: 'open',
      last_message_at: openedAt,
      created_by: user.id,
      metadata,
    })
    .select('id')
    .single()

  if (insertError || !conversation) {
    throw new Error(insertError?.message || 'No se pudo crear la conversación')
  }

  await supabase.from('conversation_participants').insert([
    {
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'agent',
    },
    {
      conversation_id: conversation.id,
      contact_name: contactName,
      contact_phone: normalizedPhone || lead.phone || null,
      role: 'contact',
    },
  ])

  await supabase.from('automation_events').insert({
    tenant_id: lead.tenant_id,
    event_type: 'conversation.created',
    entity_type: 'conversation',
    entity_id: conversation.id,
    actor_user_id: user.id,
    payload: { channel: 'whatsapp', subject, lead_id: lead.id, trigger: 'lead.whatsapp_button' },
  })

  revalidatePath('/conversations')
  revalidatePath(`/leads/${leadId}`)

  return { id: conversation.id, created: true }
}

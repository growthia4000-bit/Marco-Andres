import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerConfig, hasSupabaseConfig } from '@/lib/supabase/config'
import { classifyMessage } from '@/features/conversations/intent-engine'
import { generateReply } from '@/features/conversations/reply-engine'
import { sendWhatsAppViaMeta, detectWhatsAppDeliveryConfig, resolveTemplateByKeyAndLocale } from '@/features/conversations/whatsapp-engine'
import { interpretPropertyTurn, mergePropertyState, decidePropertyFlow, hasPropertySearchContext } from '@/features/conversations/chatbot-property-core'
import { detectHumanContactIntent, detectCrmSupportIntent, detectFinancingIntent, detectSellerIntent, buildCrmSupportReply, buildFinancingReply, buildSellerHelpReply, buildHumanContactReply } from '@/features/conversations/chatbot-engine'
import { orchestrateConversation, shouldUseOrchestrator, type OrchestratorResult } from '@/features/conversations/whatsapp-orchestrator'

function detectVisitRequestIntent(text: string): boolean {
  const normalized = text.toLowerCase()
  const visitPatterns = [
    /\b(verlo|verla|ver el|ver la|mirarlo|mirarla|mirar el|mirar la|visitar|visita)\b/,
    /\b(este\s+fin\s+de\s+semana|próximo\s+fin\s+semana|este\s+sabado|este\s+domingo)\b/,
    /\b(cuando\s+puedo|cuando\s+puede|qué\s+horario|qué\s+días|qué\s+hora)\b/,
    /\b(coordinar|agendar|concertar|reservar)\s+(una\s+)?(cita|visita|hora)\b/,
    /\b(me\s+gustaría\s+ver|quiero\s+ver|necesito\s+ver|podría\s+ver)\b/,
    /\b(apartamento\s+en\s+el\s+centro|piso\s+en\s+la\s+zona|inmueble\s+en)\b/,
    /\b(gran\s+vía|granvia|centro\s+de\s+madrid)\b/i,
  ]
  return visitPatterns.some(pattern => pattern.test(normalized))
}

function buildVisitReply(textContent: string, locale = 'es'): string {
  const normalized = textContent.toLowerCase()
  const hasWeekend = /fin\s+de\s+semana|sabado|domingo/.test(normalized)
  const hasLocation = /gran\s*vía|centro|madrid|zona/i.test(normalized)
  
  if (locale === 'en') {
    if (hasWeekend) return 'Great, I can help you arrange a visit this weekend. Let me check availability and coordinate with the agent who handles that property in that area.'
    return 'Sure, I can help you arrange a visit. Let me coordinate with the agent who handles that property.'
  }
  
  if (locale === 'it') {
    if (hasWeekend) return 'Ottimo, posso aiutarti a organizzare una visita questo fine settimana. Verifico la disponibilità e coordino con l agente.'
    return 'Certo, posso aiutarti a organizzare una visita. Coordino con l agente che gestisce quella proprietà.'
  }
  
  if (hasWeekend) {
    return 'Perfecto. Si te interesa verlo este fin de semana, te paso con la persona que lleva esa propiedad para confirmar disponibilidad y coordinar la visita.'
  }
  
  if (hasLocation) {
    return 'Claro, te ayudo con eso. Para esa zona de Gran Vía, lo correcto es revisar disponibilidad de visita y horario. Te ayudo a coordinar la visita con el asesor que lleva esa propiedad.'
  }
  
  return 'Claro. Te ayudo a coordinar la visita. Te paso con el asesor que lleva esa propiedad en esa zona para confirmar disponibilidad y horario.'
}

function buildHumanWhatsAppReply(args: {
  criteria: Record<string, unknown>
  missing: 'operation' | 'city' | null
  act: string
  locale?: string
  newCriteria?: Record<string, unknown>
}): string {
  const { criteria, missing, locale = 'es', newCriteria = {} } = args
  const operation = criteria.operation as string | undefined
  const city = criteria.city as string | undefined
  const budget = criteria.budget_max as number | undefined
  const propertyType = criteria.property_type as string | undefined
  const searchArea = criteria.search_area as string | undefined
  const subzone = criteria.subzone as string | undefined
  const locationClauses = criteria.location_clauses as Array<{landmark?: string}> | undefined

  const hasNewCity = !!newCriteria.city || !!newCriteria.search_area || !!newCriteria.subzone
  const hasNewBudget = !!newCriteria.budget_max
  const hasNewOperation = !!newCriteria.operation
  const hasNewPropertyType = !!newCriteria.property_type

  const extractedZone = subzone || searchArea || city || (locationClauses?.[0]?.landmark) || ''
  const zone = extractedZone.replace(/^(cerca de|en la zona de|en el sector de)\s+/i, '').trim()

  if (missing === 'operation' && !hasNewOperation) {
    if (locale === 'en') return 'Sure, I can help you with that. Are you looking to buy or rent?'
    if (locale === 'it') return 'Certo, posso aiutarti. Stai cercando di comprare o affittare?'
    return 'Perfecto, te ayudo con eso. ¿Buscas comprar o alquilar?'
  }

  if (missing === 'city' && !hasNewCity) {
    if (locale === 'en') return 'Great. Which area or city would you like to focus on?'
    if (locale === 'it') return 'Perfetto. Quale zona o città vorresti considerare?'
    return 'Perfecto. ¿En qué zona o ciudad te gustaría buscar?'
  }

  if (operation === 'sale' || operation === 'rent') {
    const opText = operation === 'sale' ? 'compra' : 'alquiler'
    const propText = propertyType || 'inmueble'
    const budgetText = budget ? `hasta ${budget}€` : ''

    if (zone && budget) {
      if (locale === 'en') return `Perfect. In the ${zone} area for ${opText} ${budgetText}, I can help you find options. Let me see what we have that fits.`
      if (locale === 'it') return `Perfetto. Nella zona di ${zone} per ${opText} ${budgetText}, posso aiutarti a trovare opzioni. Vediamo cosa c'è.`
      return `Perfecto. En la zona de ${zone} para ${opText} ${budgetText}, puedo orientarte con opciones. Déjame ver qué hay.`
    }

    if (zone && !budget) {
      if (locale === 'en') return `Great, ${zone} is a nice area for ${opText}. I can help you find what fits. What type of ${propText} are you looking for?`
      if (locale === 'it') return `Perfetto, ${zone} è una buona zona per ${opText}. Posso aiutarti a trovare quello che cerchi. Che tipo di ${propText} stai cercando?`
      return `Perfecto, ${zone} es una buena zona para ${opText}. Puedo ayudarte a encontrar lo que buscas. ¿Qué tipo de ${propText} buscas?`
    }

    if (budget && !zone) {
      if (locale === 'en') return `Sure, with ${budget}€ for ${opText} I can help you. What area interests you?`
      if (locale === 'it') return `Certo, con ${budget}€ per ${opText} posso aiutarti. Quale zona ti interessa?`
      return `Claro, con ${budget}€ para ${opText} te ayudo. ¿Qué zona te interesa?`
    }

    if (locale === 'en') return 'Sure, I can help you with that. Tell me a bit more about what you need.'
    if (locale === 'it') return 'Certo, posso aiutarti. Dimmi un po\' di più su cosa ti serve.'
    return 'Perfecto, te ayudo. Cuéntame un poco más de lo que necesitas.'
  }

  if (searchArea && !hasNewCity) {
    if (locale === 'en') return `Sure, I can help you around ${searchArea}. What type of property and budget are you looking at?`
    if (locale === 'it') return `Certo, posso aiutarti intorno a ${searchArea}. Che tipo di immobile e budget stai considerando?`
    return `Perfecto, te ayudo en la zona de ${searchArea}. ¿Qué tipo de inmueble y presupuesto tienes?`
  }

  if (locale === 'en') return 'Sure, I can help you find what you need. Tell me more about what you are looking for.'
  if (locale === 'it') return 'Certo, posso aiutarti a trovare quello che cerchi. Dimmi di più su cosa stai cercando.'
  return 'Perfecto, te ayudo a encontrar lo que buscas. Cuéntame más de lo que necesitas.'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  if (!hasSupabaseConfig()) {
    console.error('[whatsapp-webhook] Missing Supabase configuration')
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  const { url: supabaseUrl, serviceKey } = getSupabaseServerConfig()

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const body = await req.json()

    if (!body.entry || !body.entry.length) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const entry = body.entry[0]
    const change = entry.changes?.[0]?.value

    if (!change) {
      return NextResponse.json({ error: 'No changes in payload' }, { status: 400 })
    }

    if (change.statuses && change.statuses.length > 0) {
      for (const status of change.statuses) {
        try {
          await supabase.from('automation_events').insert({
            tenant_id: null,
            event_type: `whatsapp.status.${status.status}`,
            entity_type: 'whatsapp_message',
            entity_id: status.id,
            payload: {
              recipient_id: status.recipient_id,
              status: status.status,
              timestamp: status.timestamp,
            },
          })
        } catch (err) {
          console.error('[whatsapp-webhook] Failed to insert status event', err)
        }
      }
      return NextResponse.json({ status: 'ok' })
    }

    const hasMessages = change.messages?.length > 0
    if (!hasMessages) {
      return NextResponse.json({ status: 'ok', note: 'no_messages_to_process' })
    }

    const messages = change.messages || []
    const contacts = change.contacts || []
    const phoneNumberId = change.metadata?.phone_number_id || ''

    let scopedTenantId: string | null = null
    let whatsappConfigMode: string = 'sandbox'
    
    if (phoneNumberId) {
      const { data: whatsappConfig } = await supabase
        .from('tenant_whatsapp_configs')
        .select('tenant_id, mode, verify_token')
        .eq('phone_number_id', phoneNumberId)
        .eq('status', 'active')
        .single()

      if (whatsappConfig) {
        scopedTenantId = whatsappConfig.tenant_id
        whatsappConfigMode = whatsappConfig.mode || 'production'
        console.log('[whatsapp-webhook] Resolved tenant from phone_number_id', { 
          phoneNumberId, 
          tenantId: scopedTenantId,
          mode: whatsappConfigMode 
        })
      }
    }

    if (!scopedTenantId) {
      const tenantSlugFromPayload = body.tenant_slug || change.metadata?.tenant_slug || null
      const tenantSlug = tenantSlugFromPayload || process.env.WHATSAPP_INBOUND_TENANT_SLUG || null

      if (tenantSlug) {
        const { data: scopedTenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('slug', tenantSlug)
          .single()
        scopedTenantId = scopedTenant?.id || null
        whatsappConfigMode = 'sandbox'
      }
    }

    for (const msg of change.messages || []) {
      const from = msg.from
      const to = change.metadata?.display_phone_number || ''
      const textContent = msg.text?.body || ''
      const msgType = msg.type || 'text'
      const providerMessageId = msg.id || ''
      const contactName = contacts.find((c: { wa_id: string; profile: { name: string } }) => c.wa_id === from)?.profile?.name || ''

      if (!from || !textContent) continue

      const { data: existingConvs } = await supabase
        .from('conversations')
        .select('id, tenant_id, metadata, lead_id')
        .eq('channel', 'whatsapp')
        .eq('tenant_id', scopedTenantId)

      let conversationId: string | null = null
      let tenantId: string | null = null
      let isNewConversation = false
      let newConversation: { id: string; metadata: unknown } | null = null

      const cleanPhone = from.replace(/[^0-9+]/g, '')

      if (existingConvs?.length) {
        for (const conv of existingConvs) {
          const meta = conv.metadata as Record<string, unknown>
          if (meta.whatsapp_from === cleanPhone ||
              meta.whatsapp_from === from ||
              meta.last_whatsapp_to === cleanPhone ||
              meta.last_whatsapp_to === from) {
            conversationId = conv.id
            tenantId = conv.tenant_id
            break
          }
        }
      }

      if (!conversationId) {
        if (!scopedTenantId) {
          console.error('[whatsapp-webhook] No tenant resolved for inbound message', {
            from,
            phoneNumberId,
            whatsappConfigMode,
            scopedTenantId,
          })
          await supabase.from('automation_events').insert({
            tenant_id: null,
            event_type: 'whatsapp.inbound.dropped',
            entity_type: 'webhook',
            entity_id: 'whatsapp',
            payload: { from, reason: 'no_tenant_resolved', phoneNumberId, whatsappConfigMode },
          })
          continue
        }

        const { data: tenantRecord } = await supabase
          .from('tenants')
          .select('id, slug')
          .eq('id', scopedTenantId)
          .single()

        if (!tenantRecord) {
          console.error('[whatsapp-webhook] Tenant not found in database', { scopedTenantId })
          await supabase.from('automation_events').insert({
            tenant_id: null,
            event_type: 'whatsapp.inbound.dropped',
            entity_type: 'webhook',
            entity_id: 'whatsapp',
            payload: { from, reason: 'tenant_not_found', scopedTenantId },
          })
          continue
        }

        tenantId = tenantRecord.id

        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            tenant_id: tenantId,
            subject: `WhatsApp: ${contactName || from}`,
            channel: 'whatsapp',
            status: 'open',
            metadata: {
              whatsapp_from: cleanPhone,
              whatsapp_contact_name: contactName,
              last_whatsapp_to: cleanPhone,
              whatsapp_phone_number_id: phoneNumberId,
            },
          })
          .select()
          .single()

        if (convError) continue

        newConversation = newConv
        conversationId = newConv.id
        isNewConversation = true
      }

      const whatsappMeta = {
        whatsapp_from: cleanPhone,
        whatsapp_to: to,
        whatsapp_provider_message_id: providerMessageId,
        whatsapp_message_type: msgType,
        whatsapp_contact_name: contactName,
        whatsapp_phone_number_id: phoneNumberId,
      }

      await supabase.from('conversation_messages').insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        direction: 'inbound',
        channel: 'whatsapp',
        status: 'delivered',
        content: textContent,
        is_automated: false,
        metadata: whatsappMeta,
      })

      await supabase.from('automation_events').insert({
        tenant_id: tenantId,
        event_type: 'whatsapp.inbound.received',
        entity_type: 'conversation',
        entity_id: conversationId,
        payload: {
          from: cleanPhone,
          to,
          message_type: msgType,
          provider_message_id: providerMessageId,
          contact_name: contactName,
        },
      })

      if (isNewConversation) {
        await supabase.from('automation_events').insert({
          tenant_id: tenantId,
          event_type: 'whatsapp.thread.created',
          entity_type: 'conversation',
          entity_id: conversationId,
          payload: { from: cleanPhone, contact_name: contactName },
        })

        const deliveryConfig = detectWhatsAppDeliveryConfig(process.env)
        if (deliveryConfig.configured && deliveryConfig.meta) {
          const convMeta = (newConversation?.metadata as Record<string, unknown>) || {}
          const contactLocale = (convMeta.whatsapp_locale as string) || 'es'
          const resolved = resolveTemplateByKeyAndLocale('lead_bienvenida', contactLocale)

          const welcomeTemplateName = resolved?.templateName || 'lead_bienvenida_es'
          const welcomeLangCode = resolved?.localeCode || 'es'
          const welcomeParams = [
            contactName || 'there',
            (convMeta.whatsapp_contact_name as string) || contactName || '',
          ].filter(Boolean)

          console.log('[whatsapp-webhook] Sending lead_bienvenida template', {
            template: welcomeTemplateName,
            lang: welcomeLangCode,
            locale: contactLocale,
            usedFallback: resolved?.usedFallback,
            conversationId,
            to: cleanPhone,
          })

          const welcomeResult = await sendWhatsAppViaMeta({
            config: deliveryConfig.meta,
            to: cleanPhone,
            text: welcomeParams.join('|'),
            templateName: welcomeTemplateName,
            templateParams: welcomeParams,
            templateLanguageCode: welcomeLangCode,
          })

          await supabase.from('conversation_messages').insert({
            conversation_id: conversationId,
            tenant_id: tenantId,
            direction: 'outbound',
            channel: 'whatsapp',
            status: welcomeResult.status === 'sent' ? 'sent' : 'failed',
            content: `Welcome template: ${welcomeTemplateName}`,
            is_automated: true,
            metadata: {
              whatsapp_to: cleanPhone,
              whatsapp_from: 'noreply',
              whatsapp_message_type: 'template',
              whatsapp_provider_message_id: welcomeResult.provider_message_id,
              whatsapp_delivery_status: welcomeResult.status === 'sent' ? 'accepted' : welcomeResult.status,
              whatsapp_delivery_provider: 'meta_cloud',
              whatsapp_template_name: welcomeResult.template_name,
              whatsapp_template_key: 'lead_bienvenida',
              whatsapp_template_key_base: 'lead_bienvenida',
              whatsapp_locale_requested: contactLocale,
              whatsapp_locale_resolved: resolved?.localeCode || welcomeLangCode,
              whatsapp_locale_used_fallback: resolved?.usedFallback || false,
              whatsapp_locale_fallback_reason: resolved?.fallbackReason || null,
              trigger: 'whatsapp.thread.created',
              reply_type: 'welcome_template',
            },
          })

          await supabase.from('automation_events').insert({
            tenant_id: tenantId,
            event_type: welcomeResult.status === 'sent' ? 'whatsapp.welcome_template.sent' : 'whatsapp.welcome_template.failed',
            entity_type: 'conversation',
            entity_id: conversationId,
            payload: {
              from: cleanPhone,
              template_name: welcomeResult.template_name,
              template_key_base: 'lead_bienvenida',
              locale_requested: contactLocale,
              locale_resolved: resolved?.localeCode || welcomeLangCode,
              used_fallback: resolved?.usedFallback || false,
              fallback_reason: resolved?.fallbackReason || null,
              provider_message_id: welcomeResult.provider_message_id,
              status: welcomeResult.status,
              error: welcomeResult.error,
            },
          })
        }
      } else {
        await supabase.from('automation_events').insert({
          tenant_id: tenantId,
          event_type: 'whatsapp.thread.matched',
          entity_type: 'conversation',
          entity_id: conversationId,
          payload: { from: cleanPhone, provider_message_id: providerMessageId },
        })
      }

      try {
        console.log('[whatsapp-webhook] Starting auto-reply processing', { 
          conversationId,
          textContent: textContent.substring(0, 50),
        })
        
        const classification = classifyMessage(textContent)
        console.log('[whatsapp-webhook] Classification result', { 
          intent: classification.intent.intent, 
          decision: classification.decision.decision,
        })

        if (classification.decision.decision === 'require_human') {
          const humanReply = buildHumanContactReply()
          const replyText = humanReply.text
          const replyType = 'escalation'
          const replySource = 'human_handoff'
          
          await supabase.from('automation_events').insert({
            tenant_id: tenantId,
            event_type: 'whatsapp.conversation.human_handoff',
            entity_type: 'conversation',
            entity_id: conversationId,
            payload: { from: cleanPhone, intent: classification.intent.intent, decision: classification.decision.decision },
          })

          const deliveryConfig = detectWhatsAppDeliveryConfig(process.env)
          console.log('[whatsapp-webhook] Human handoff - delivery config check', { 
            configured: deliveryConfig.configured, 
            hasMeta: !!deliveryConfig.meta,
            reason: deliveryConfig.reason,
          })

          if (deliveryConfig.configured && deliveryConfig.meta) {
            const autoReplyResult = await sendWhatsAppViaMeta({
              config: deliveryConfig.meta,
              to: cleanPhone,
              text: replyText,
            })

            if (autoReplyResult.status === 'sent') {
              await supabase.from('conversation_messages').insert({
                conversation_id: conversationId,
                tenant_id: tenantId,
                direction: 'outbound',
                channel: 'whatsapp',
                status: 'sent',
                content: replyText,
                is_automated: true,
                metadata: {
                  whatsapp_to: cleanPhone,
                  whatsapp_from: 'noreply',
                  whatsapp_message_type: 'text',
                  whatsapp_provider_message_id: autoReplyResult.provider_message_id,
                  whatsapp_delivery_status: 'sent',
                  whatsapp_delivery_provider: 'meta_cloud',
                  auto_reply: {
                    source: replySource,
                    reply_type: replyType,
                    intent: classification.intent.intent,
                    decision: classification.decision.decision,
                  },
                },
              })

              await supabase.from('automation_events').insert({
                tenant_id: tenantId,
                event_type: 'whatsapp.auto_reply.sent',
                entity_type: 'conversation',
                entity_id: conversationId,
                payload: { from: cleanPhone, intent: classification.intent.intent, decision: classification.decision.decision, reply_source: replySource, provider_message_id: autoReplyResult.provider_message_id },
              })
            }
          }
        } else {
          const activeLocale = 'es'
          const conversationMeta = (await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', conversationId)
            .single()
          ).data?.metadata || {}
          
          const hasVisitIntent = detectVisitRequestIntent(textContent)
          const currentCriteria = (conversationMeta.whatsapp_criteria || {}) as Record<string, unknown>
          const propertyTurn = interpretPropertyTurn(textContent, activeLocale, currentCriteria as never)
          const mergedCriteria = mergePropertyState(currentCriteria as never, propertyTurn.patch, propertyTurn.act)
          
          await supabase
            .from('conversations')
            .update({ metadata: { ...conversationMeta, whatsapp_criteria: mergedCriteria } })
            .eq('id', conversationId)

          let replyText = ''
          let replyType = 'fallback'
          let replySource = 'chatbot'
          
          const cleanCriteriaFromCurrentTurn = hasVisitIntent 
            ? { ...propertyTurn.patch } as Record<string, unknown>
            : {} as Record<string, unknown>

          const useLLM = shouldUseOrchestrator(textContent)
          console.log('[whatsapp-webhook] Processing message', { 
            useLLM, 
            textLength: textContent.length,
            hasVisitIntent,
            cleanCriteria: Object.keys(cleanCriteriaFromCurrentTurn),
          })

          if (useLLM) {
            const lastMessages = await supabase
              .from('conversation_messages')
              .select('direction, content, created_at')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: false })
              .limit(6)

            const previousTurns = lastMessages.data
              ?.reverse()
              .map(m => ({
                role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
                content: m.content || '',
              })) || []

            const conversationContext = {
              conversationId: conversationId!,
              tenantId: tenantId!,
              contactName: contactName || undefined,
              contactPhone: cleanPhone,
              lastSearchCriteria: hasVisitIntent || propertyTurn.patch
                ? { ...propertyTurn.patch } as Record<string, unknown>
                : undefined,
              previousMessages: previousTurns,
            }

            const orchestratorResult: OrchestratorResult = await orchestrateConversation(
              textContent,
              conversationContext
            )

            replyText = orchestratorResult.response
            replySource = orchestratorResult.source
            replyType = orchestratorResult.source === 'human_handoff' ? 'escalation' : 'auto_reply'

            await supabase.from('automation_events').insert({
              tenant_id: tenantId,
              event_type: `whatsapp.conversation.${orchestratorResult.source}`,
              entity_type: 'conversation',
              entity_id: conversationId,
              payload: {
                from: cleanPhone,
                intent: orchestratorResult.intent,
                action: orchestratorResult.action,
                confidence: orchestratorResult.confidence,
                reply_source: orchestratorResult.source,
              },
            })

            console.log('[whatsapp-webhook] LLM path - result check', {
                replyText: replyText?.substring(0, 50),
                replySource,
                orchestratorSource: orchestratorResult.source,
                sourceNotHumanHandoff: orchestratorResult.source !== 'human_handoff',
              })
              if (replyText && (orchestratorResult.source !== 'human_handoff')) {
                const deliveryConfig = detectWhatsAppDeliveryConfig(process.env)
                console.log('[whatsapp-webhook] LLM path - delivery config check', {
                  configured: deliveryConfig.configured,
                  hasMeta: !!deliveryConfig.meta,
                  reason: deliveryConfig.reason,
                  replySource,
                })
                if (deliveryConfig.configured && deliveryConfig.meta) {
                  const autoReplyResult = await sendWhatsAppViaMeta({
                    config: deliveryConfig.meta,
                    to: cleanPhone,
                    text: replyText,
                  })
                  console.log('[whatsapp-webhook] LLM path - send result', {
                    status: autoReplyResult.status,
                    error: autoReplyResult.error,
                    messageId: autoReplyResult.provider_message_id,
                  })

                if (autoReplyResult.status === 'sent') {
                  await supabase.from('conversation_messages').insert({
                    conversation_id: conversationId,
                    tenant_id: tenantId,
                    direction: 'outbound',
                    channel: 'whatsapp',
                    status: 'sent',
                    content: replyText,
                    is_automated: true,
                    metadata: {
                      whatsapp_to: cleanPhone,
                      whatsapp_from: 'noreply',
                      whatsapp_message_type: 'text',
                      whatsapp_provider_message_id: autoReplyResult.provider_message_id,
                      whatsapp_delivery_status: 'sent',
                      whatsapp_delivery_provider: 'meta_cloud',
                      auto_reply: {
                        source: replySource,
                        reply_type: replyType,
                        intent: orchestratorResult.intent,
                        action: orchestratorResult.action,
                      },
                    },
                  })

                  await supabase.from('automation_events').insert({
                    tenant_id: tenantId,
                    event_type: 'whatsapp.auto_reply.sent',
                    entity_type: 'conversation',
                    entity_id: conversationId,
                    payload: { from: cleanPhone, intent: orchestratorResult.intent, action: orchestratorResult.action, reply_source: orchestratorResult.source, provider_message_id: autoReplyResult.provider_message_id },
                  })
                }
              }
            }
          } else {
            let intent: string = classification.intent.intent
            let decision: string = classification.decision.decision

            const hasVisitIntent = detectVisitRequestIntent(textContent)
            if (hasVisitIntent) {
              intent = 'property_visit_request'
              decision = 'suggest_visit_coordination'
            } else if (hasPropertySearchContext(mergedCriteria)) {
              intent = 'property_interest'
              const flow = decidePropertyFlow(mergedCriteria as never)
              decision = flow.missing ? 'request_more_info' : 'suggest_auto_reply'
            } else if (detectHumanContactIntent(textContent)) {
              intent = 'human_help'
              decision = 'require_human'
            } else if (detectFinancingIntent(textContent)) {
              intent = 'general_question'
              decision = 'suggest_auto_reply'
            } else if (detectCrmSupportIntent(textContent)) {
              intent = 'general_question'
              decision = 'suggest_auto_reply'
            } else if (detectSellerIntent(textContent)) {
              intent = 'general_question'
              decision = 'suggest_auto_reply'
            }

            if (decision === 'require_human' && hasPropertySearchContext(mergedCriteria)) {
              decision = 'suggest_auto_reply'
            }

            console.log('[whatsapp-webhook] Decision after classification logic', { 
              intent, 
              decision,
              hasVisitIntent: detectVisitRequestIntent(textContent),
              hasPropertySearch: hasPropertySearchContext(mergedCriteria),
            })

            if (decision === 'require_human') {
              const humanReply = buildHumanContactReply()
              replyText = humanReply.text
              replyType = 'escalation'
              replySource = 'human_handoff'
              
              await supabase.from('automation_events').insert({
                tenant_id: tenantId,
                event_type: 'whatsapp.conversation.human_handoff',
                entity_type: 'conversation',
                entity_id: conversationId,
                payload: { from: cleanPhone, intent, decision },
              })
            } else {
              replyText = ''
              replyType = 'fallback'
              replySource = 'chatbot'

              if (decision === 'suggest_visit_coordination') {
                replyText = buildVisitReply(textContent, activeLocale)
                replyType = 'auto_reply'
                replySource = 'visit_coordination'
              } else if (hasPropertySearchContext(mergedCriteria)) {
                const flow = decidePropertyFlow(mergedCriteria as never)
                replyText = buildHumanWhatsAppReply({
                  criteria: mergedCriteria as Record<string, unknown>,
                  missing: flow.missing,
                  act: propertyTurn.act,
                  locale: activeLocale,
                  newCriteria: propertyTurn.patch as Record<string, unknown>,
                })
                replyType = 'auto_reply'
                replySource = 'whatsapp_human_reply'
              } else if (decision === 'suggest_auto_reply' || decision === 'request_more_info') {
                if (detectCrmSupportIntent(textContent)) {
                  const crmReply = buildCrmSupportReply(activeLocale)
                  replyText = crmReply.text
                  replyType = crmReply.replyType
                  replySource = 'crm_support'
                } else if (detectFinancingIntent(textContent)) {
                  const financingReply = buildFinancingReply(activeLocale)
                  replyText = financingReply.text
                  replyType = financingReply.replyType
                  replySource = 'financing_support'
                } else if (detectSellerIntent(textContent)) {
                  const sellerReply = buildSellerHelpReply()
                  replyText = sellerReply.text
                  replyType = sellerReply.replyType
                  replySource = 'seller_help'
                } else {
                  const autoReply = generateReply({ intent: intent as any, decision: decision as any, confidence: classification.intent.confidence, channel: 'whatsapp', contactName })
                  if (autoReply) {
                    replyText = autoReply.reply_text
                    replyType = 'auto_reply'
                    replySource = autoReply.template_id
                  }
                }
              }

              if (!replyText) {
                const greeting = contactName ? `Hola ${contactName}, ` : 'Hola, '
                replyText = `${greeting}gracias por contactarnos. ¿En qué podemos ayudarle?`
                replyType = 'fallback'
                replySource = 'whatsapp_fallback_greeting'
              }

              if (replyText) {
                console.log('[whatsapp-webhook] About to send reply', { 
                  replyText: replyText.substring(0, 80),
                  replySource,
                  replyType,
                })
                
                const deliveryConfig = detectWhatsAppDeliveryConfig(process.env)
                console.log('[whatsapp-webhook] Delivery config', { 
                  configured: deliveryConfig.configured, 
                  hasMeta: !!deliveryConfig.meta,
                  provider: deliveryConfig.provider,
                  reason: deliveryConfig.reason,
                })

                if (deliveryConfig.configured && deliveryConfig.meta) {
                  const autoReplyResult = await sendWhatsAppViaMeta({
                    config: deliveryConfig.meta,
                    to: cleanPhone,
                    text: replyText,
                  })

                  if (autoReplyResult.status === 'sent') {
                    console.log('[whatsapp-webhook] Message sent successfully', { 
                      providerMessageId: autoReplyResult.provider_message_id,
                      replyText: replyText.substring(0, 50),
                    })
                    
                    await supabase.from('conversation_messages').insert({
                      conversation_id: conversationId,
                      tenant_id: tenantId,
                      direction: 'outbound',
                      channel: 'whatsapp',
                      status: 'sent',
                      content: replyText,
                      is_automated: true,
                      metadata: {
                        whatsapp_to: cleanPhone,
                        whatsapp_from: 'noreply',
                        whatsapp_message_type: 'text',
                        whatsapp_provider_message_id: autoReplyResult.provider_message_id,
                        whatsapp_delivery_status: 'sent',
                        whatsapp_delivery_provider: 'meta_cloud',
                        auto_reply: {
                          source: replySource,
                          reply_type: replyType,
                          intent,
                          decision,
                          criteria: mergedCriteria,
                        },
                      },
                    })

                    await supabase.from('automation_events').insert({
                      tenant_id: tenantId,
                      event_type: 'whatsapp.auto_reply.sent',
                      entity_type: 'conversation',
                      entity_id: conversationId,
                      payload: { from: cleanPhone, intent, decision, reply_source: replySource, provider_message_id: autoReplyResult.provider_message_id },
                    })
                  } else {
                    await supabase.from('automation_events').insert({
                      tenant_id: tenantId,
                      event_type: 'whatsapp.auto_reply.failed',
                      entity_type: 'conversation',
                      entity_id: conversationId,
                      payload: { from: cleanPhone, reason: autoReplyResult.error || 'Failed to send', reply_source: replySource },
                    })
                  }
                }
              }
            }
          }
        }
      } catch (autoReplyError) {
        console.error('[whatsapp-webhook] Auto-reply error', { error: autoReplyError })
        
        try {
          await supabase.from('automation_events').insert({
            tenant_id: tenantId,
            event_type: 'whatsapp.auto_reply.error',
            entity_type: 'conversation',
            entity_id: conversationId,
            payload: { 
              from: cleanPhone, 
              error: autoReplyError instanceof Error ? autoReplyError.message : String(autoReplyError),
              stack: autoReplyError instanceof Error ? autoReplyError.stack : null 
            },
          })
        } catch (loggingError) {
          console.error('[whatsapp-webhook] Failed to log error', { loggingError })
        }
      }
    }

    console.log('[whatsapp-webhook] Finished processing all messages')
    
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[whatsapp-webhook] Top-level error', { error: errorMessage })
    return NextResponse.json({ error: 'Internal error', details: errorMessage }, { status: 500 })
  }
}

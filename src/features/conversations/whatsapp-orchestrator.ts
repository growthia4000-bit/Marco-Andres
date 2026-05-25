
import { generateText } from 'ai'
import { getLLMProvider, getLLMModelString, getLLMProviderConfig, hasLLMConfig, LLM_DEFAULTS } from '@/lib/ai/llm-client'

export type ConversationTurn = {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export type ConversationContext = {
  conversationId: string
  tenantId: string
  contactName?: string
  contactPhone?: string
  lastPropertyInterest?: string
  lastSearchCriteria?: Record<string, unknown>
  previousMessages?: ConversationTurn[]
  leadStatus?: string
}

export type IntentCategory = 
  | 'property_search'
  | 'visit_request'
  | 'human_contact'
  | 'selling_request'
  | 'follow_up'
  | 'support'
  | 'general_question'

export type ActionType = 
  | 'respond_with_property_options'
  | 'coordinate_visit'
  | 'handoff_to_human'
  | 'request_more_info'
  | 'provide_general_info'
  | 'escalate_to_agent'

export type OrchestratorResult = {
  response: string
  intent: IntentCategory
  action: ActionType
  source: 'model' | 'fallback' | 'human_handoff'
  confidence: number
  metadata?: Record<string, unknown>
}

const SYSTEM_PROMPT = `Eres un asesor inmobiliario profesional de Growthia Global CRM. Tu objetivo es ayudar a los clientes de forma natural, breve y útil como lo haría un asesor humano real.

REGLAS OBLIGATORIAS:
1. Siempre responde en español, de forma natural y fluida
2. NO uses frases robóticas como "Entiendo la búsqueda como..." o "Perfecto. En la zona de..."
3. NO arrastres criterios de búsqueda anteriores si el cliente no los menciona de nuevo
4. NO inventes propiedades o disponibilidad que no existan
5. Si no tienes información clara, sé honesto: "Te ayudo a coordinarlo, pero necesito confirmar disponibilidad"
6. Prioriza el ÚLTIMO mensaje del cliente sobre cualquier contexto anterior

INTENCIONES DEL CLIENTE:
- Búsqueda de propiedad: el cliente busca comprar/alquilar un inmueble
- Solicitud de visita: el cliente quiere ver un inmueble, habla de "verlo", "este fin de semana", "coordinar visita"
- Hablar con asesor: el cliente pide hablar con persona, dice "hablar con alguien", "asesor"
- Vender propiedad: el cliente quiere vender o alquilar su propiedad
- Seguimiento: el cliente responde a un mensaje anterior
- Soporte: el cliente tiene duda o problema

RESPUESTAS ESPERADAS:
- Si el cliente quiere VISITA: "Claro, te ayudo a coordinar. Te paso con el asesor que lleva esa zona para confirmar disponibilidad."
- Si el cliente quiere HABLAR CON PERSONA: "Claro, te conecto con un asesor ahora mismo."
- Si el cliente BUSCA: Pregunta clara y útil, no asumas presupuesto si no lo dijo
- Si FALTA INFO: "Para ayudarte mejor, ¿me dices más o menos qué presupuesto tienes?" (una pregunta a la vez)

NUNCA:
- Repetir "hasta X€" si el cliente no mencionó presupuesto
- Usar listas de propiedades que no has verificado
- Hacer más de una pregunta por respuesta
- Responder como robot o parser`

function buildConversationHistory(context: ConversationContext, currentMessage: string): string {
  const history: string[] = []
  
  if (context.previousMessages && context.previousMessages.length > 0) {
    const recentTurns = context.previousMessages.slice(-2)
    for (const turn of recentTurns) {
      history.push(`${turn.role === 'user' ? 'Cliente' : 'Asesor'}: ${turn.content}`)
    }
  }
  
  history.push(`Cliente: ${currentMessage}`)
  
  return history.join('\n')
}

const INTENT_JSON_PROMPT = `Analiza el siguiente mensaje de un cliente y responde SOLO con JSON (sin texto adicional):
{
  "intent": "property_search|visit_request|human_contact|selling_request|follow_up|support|general_question",
  "action": "respond_with_property_options|coordinate_visit|handoff_to_human|request_more_info|provide_general_info|escalate_to_agent",
  "confidence": 0.0-1.0,
  "response": "tu respuesta en español",
  "escalate_reason": "razón si action es handoff_to_human o escalate_to_agent, sino null"
}`

export async function orchestrateConversation(
  userMessage: string,
  context: ConversationContext,
  suppressLogs = false
): Promise<OrchestratorResult> {
  const providerInfo = getLLMProviderConfig()
  
  if (!providerInfo.configured) {
    return {
      response: 'Lo siento, en este momento no puedo procesar tu solicitud. Por favor, contacta directamente con nuestra oficina.',
      intent: 'support',
      action: 'handoff_to_human',
      source: 'fallback',
      confidence: 0,
      metadata: { reason: 'no_ai_config', provider_info: providerInfo }
    }
  }

  try {
    const llmModel = getLLMProvider()
    const modelString = getLLMModelString()
    const conversationHistory = buildConversationHistory(context, userMessage)
    
    const fullPrompt = `${SYSTEM_PROMPT}

Contexto del cliente:
- Nombre: ${context.contactName || 'no disponible'}
- Teléfono: ${context.contactPhone || 'no disponible'}
- Estado del lead: ${context.leadStatus || 'nuevo'}

Historial de conversación (más reciente al final):
${conversationHistory}

${INTENT_JSON_PROMPT}`
    
    const { text } = await generateText({
      model: llmModel,
      messages: [
        { role: 'system', content: fullPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
    })

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No valid JSON response from model')
    }

    const parsed = JSON.parse(jsonMatch[0])
    
    const shouldHandoff = parsed.action === 'handoff_to_human' || parsed.action === 'escalate_to_agent'
    
    if (!suppressLogs) {
      console.info('[whatsapp-orchestrator] LLM response', {
        intent: parsed.intent,
        action: parsed.action,
        confidence: parsed.confidence,
        hasEscalation: shouldHandoff,
        provider: providerInfo.provider,
        model: providerInfo.model,
      })
    }

    return {
      response: parsed.response || 'Gracias por contactarnos. ¿En qué puedo ayudarte?',
      intent: parsed.intent as IntentCategory,
      action: parsed.action as ActionType,
      source: shouldHandoff ? 'human_handoff' : 'model',
      confidence: parsed.confidence || 0.5,
      metadata: { 
        ...(parsed.escalate_reason ? { escalate_reason: parsed.escalate_reason } : {}),
        provider: providerInfo.provider,
        model: providerInfo.model,
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const providerInfo = getLLMProviderConfig()
    
    let errorType = 'unknown_error'
    if (errorMessage.includes('rate_limit') || errorMessage.includes('Rate limit')) {
      errorType = 'rate_limit'
    } else if (errorMessage.includes('quota') || errorMessage.includes('credits') || errorMessage.includes('Insufficient credits')) {
      errorType = 'quota'
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timeout')) {
      errorType = 'timeout'
    } else if (errorMessage.includes('invalid') || errorMessage.includes('not a valid model')) {
      errorType = 'invalid_model'
    } else if (errorMessage.includes('api_key') || errorMessage.includes('API key') || errorMessage.includes('missing')) {
      errorType = 'missing_api_key'
    }
    
    console.error('[whatsapp-orchestrator] Error calling LLM:', { 
      message: errorMessage,
      error_type: errorType,
      provider: providerInfo.provider,
      model: providerInfo.model,
    })
    
    const normalized = userMessage.toLowerCase()
    
    const isVisitRequest = /ver|mirar|visita|este\s+fin|sabado|domingo|coordinar|agendar/i.test(normalized)
    const isHumanContact = /hablar\s+personalmente|hablar\s+con\s+una?\s+persona|hablar\s+con\s+alguien|contactar|telefono|teléfono|horario|hablar\s+con\s+un\s+asesor|reservar\s+una?\s+cita|agendar|cita/i.test(normalized)
    const isBuyRequest = /comprar|compra|adquirir| comprar\b/i.test(normalized)
    const hasRooms = /\b(1|2|3|4|5|más)\s+habitaciones?\b|\bhabitaciones?\s+(1|2|3|4|5)\b/i.test(normalized)
    const hasGarden = /jardín|jardin|terraza|patio|huerto/i.test(normalized)
    const hasZone = /sureste|norte|sur|este|centro|zona\s+(madrid|barcelona|valencia|sevilla|málaga)|madrid\s+(sur|norte|este|oeste|centro)/i.test(normalized)
    const hasPropertyType = /casa|piso|apartamento|vivienda|chalet|villa|ático|duplex|studio/i.test(normalized)
    
    if (isVisitRequest) {
      return {
        response: 'Claro, me encantaría ayudarte a coordinar la visita. ¿Podrías decirme qué día y horario te conviene mejor para ir a ver la propiedad?',
        intent: 'visit_request',
        action: 'coordinate_visit',
        source: 'fallback',
        confidence: 0,
        metadata: { 
          error: errorMessage, 
          error_type: errorType,
          triggered_as: 'visit_fallback',
          provider: providerInfo.provider,
          model: providerInfo.model,
        }
      }
    }
    
    if (isHumanContact) {
      return {
        response: 'Claro, te ayudo a coordinarlo. Si quieres hablar personalmente con un asesor o reservar una cita, dime qué horario te viene mejor y lo gestionamos.',
        intent: 'human_contact',
        action: 'handoff_to_human',
        source: 'fallback',
        confidence: 0,
        metadata: { 
          error: errorMessage, 
          error_type: errorType,
          triggered_as: 'human_contact_fallback',
          provider: providerInfo.provider,
          model: providerInfo.model,
        }
      }
    }
    
    if (isBuyRequest || hasPropertyType || hasRooms || hasZone || hasGarden) {
      const parts = []
      if (isBuyRequest) parts.push('compra')
      if (hasPropertyType) {
        const propMatch = normalized.match(/casa|piso|apartamento|vivienda|chalet|villa|ático|duplex|studio/i)
        if (propMatch) parts.push(propMatch[0])
      }
      if (hasZone) {
        const zoneMatch = normalized.match(/(sureste|norte|sur|este|centro)\s+de\s+madrid|madrid\s+(sur|norte|este|oeste|centro)/i)
        if (zoneMatch) parts.push(`zona ${zoneMatch[0]}`)
        else parts.push('Madrid')
      }
      if (hasRooms) parts.push('con las habitaciones que buscas')
      if (hasGarden) parts.push('y con jardín')
      
      const response = `Perfecto, te ayudo con eso.${parts.length > 0 ? ' Buscas ' + parts.join(', ') + '.' : ''} ¿Tienes algún presupuesto aproximado en mente?`
      
      return {
        response,
        intent: 'property_search',
        action: 'request_more_info',
        source: 'fallback',
        confidence: 0,
        metadata: { 
          error: errorMessage, 
          error_type: errorType,
          triggered_as: 'search_fallback',
          provider: providerInfo.provider,
          model: providerInfo.model,
        }
      }
    }
    
    return {
      response: 'Gracias por contactarnos. ¿En qué puedo ayudarte hoy?',
      intent: 'general_question',
      action: 'request_more_info',
      source: 'fallback',
      confidence: 0,
      metadata: { 
        error: errorMessage, 
        error_type: errorType,
        provider: providerInfo.provider,
        model: providerInfo.model,
      }
    }
  }
}

export function shouldUseOrchestrator(userMessage: string): boolean {
  const firstTimeGreetings = /^(hola|buenos días|buenas|tengo una|pregunta|quiero|me gustaría|hola,|buenas)/i
  return firstTimeGreetings.test(userMessage.trim()) || userMessage.trim().length > 20
}
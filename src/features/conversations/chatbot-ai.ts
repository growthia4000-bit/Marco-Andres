import { generateObject } from 'ai'
import { z } from 'zod'
import { AI_MODELS, getOpenRouterProvider, hasAiProviderConfig } from '@/lib/ai/openrouter'
import { extractChatbotCriteria, type ChatbotSearchCriteria } from './chatbot-engine'
import type { ConcretePropertyRecord, PropertyTurnAct } from './chatbot-property-core'
import type { AppKnowledgeEntry } from './chatbot-app-knowledge'

export type ChatbotModeResolved =
  | 'search'
  | 'concrete_property'
  | 'seller'
  | 'crm_support'
  | 'human_handoff'
  | 'financing_basic'
  | 'legal_complex'

export type ChatbotTurnType =
  | 'greeting'
  | 'new_search'
  | 'search_correction'
  | 'hard_reset'
  | 'search_follow_up'
  | 'concrete_reference'
  | 'concrete_followup'
  | 'seller_intent'
  | 'crm_support'
  | 'human_request'
  | 'financing_question'
  | 'legal_complex_question'
  | 'fallback'

export interface ChatbotResponseContext {
  locale: string
  channel: string
  tenant_slug: string | null
  screen_path?: string | null
  current_user_role?: string | null
  turn_type: ChatbotTurnType
  mode_resolved: ChatbotModeResolved
  active_focus: string | null
  latest_user_message: string
  sanitized_search_context: {
    operation?: string
    property_type?: string
    property_label?: string
    city?: string
    search_area?: string
    location_scope?: string
    subzone?: string
    location_clauses?: Array<{ relation: string; landmark: string }>
    logistics?: string[]
    rooms?: number
    rooms_min?: number
    bathrooms?: number
    bathrooms_min?: number
    budget_max?: number
    budget_min?: number
    currency?: string
    urgency?: string
    attributes?: string[]
  } | null
  selected_property: { id: string; title: string } | null
  selected_property_facts: {
    title: string
    city?: string | null
    address?: string | null
    property_type?: string | null
    deal_type?: string | null
    price?: number | null
    rooms?: number | null
  } | null
  candidate_properties_summary: Array<{ title: string; city?: string | null; price?: number | null; property_type?: string | null; deal_type?: string | null }>
  inventory_context: {
    available_cities: string[]
    same_area_inventory_count: number
    no_match_reason: 'no_inventory_in_area' | 'inventory_in_area_but_no_match' | 'missing_user_data' | 'none'
  }
  seller_context: { requested: boolean } | null
  crm_support_context: { requested: boolean; topic?: string } | null
  human_handoff_context: { requested: boolean } | null
  financing_context: { requested: boolean } | null
  legal_complexity_flag: boolean
  allowed_claims: string[]
  forbidden_assumptions: string[]
  next_best_question: string | null
  tone_style: 'dashboard' | 'whatsapp' | 'email'
  response_goal: string
  matched_properties_count?: number
  semantic_interpretation?: ChatbotSemanticInterpretation | null
  trace?: {
    semantic_interpreter_source?: string | null
    semantic_interpreter_mode?: 'ai' | 'fallback' | null
    semantic_ai_model_used?: string | null
    final_reply_source?: string | null
    final_reply_mode?: 'ai' | 'fallback' | null
    final_ai_model_used?: string | null
    fallback_reason?: string | null
  } | null
  app_knowledge?: Array<Pick<AppKnowledgeEntry, 'route' | 'routePatterns' | 'title' | 'sections' | 'actions' | 'forms' | 'filters' | 'entities' | 'roleScope' | 'relatedFlows' | 'supportFields' | 'minimumContext' | 'guidance'>>
}

export interface ChatbotAiResult {
  text: string
  generation_mode: 'ai' | 'fallback'
  source: string
}

export interface ChatbotSemanticInterpretation {
  intent: 'property_search' | 'property_detail' | 'compare' | 'recommendation' | 'schedule_visit' | 'human_handoff' | 'greeting' | 'thanks' | 'unknown'
  transaction_type: 'rent' | 'sale' | 'unknown'
  location: {
    city: string | null
    zone: string | null
    relationship: 'center' | 'near_center' | 'around' | 'exact' | 'unknown'
  }
  property_type: string | null
  is_followup: boolean
  accepted_previous_suggestion: boolean
  wants_agent: boolean
  wants_list: boolean
  wants_recommendation: boolean
  wants_broaden_search: boolean
  correction: string | null
  confidence: number
  budget: {
    min: number | null
    max: number | null
  }
  bedrooms: {
    min: number | null
    max: number | null
  }
  features: string[]
  is_correction: boolean
  correction_target: 'transaction_type' | 'location' | 'budget' | 'property_type' | 'unknown'
  list_mode: boolean
  selection: {
    type: 'ordinal' | 'name' | 'attribute' | 'none'
    value: string | number | null
  }
  language: 'es' | 'en' | 'it' | 'other'
}

const semanticInterpretationSchema = z.object({
  intent: z.enum(['property_search', 'property_detail', 'compare', 'recommendation', 'schedule_visit', 'human_handoff', 'greeting', 'thanks', 'unknown']),
  transaction_type: z.enum(['rent', 'sale', 'unknown']),
  location: z.object({
    city: z.string().nullable(),
    zone: z.string().nullable(),
    relationship: z.enum(['center', 'near_center', 'around', 'exact', 'unknown']),
  }),
  property_type: z.string().nullable(),
  is_followup: z.boolean(),
  accepted_previous_suggestion: z.boolean(),
  wants_agent: z.boolean(),
  wants_list: z.boolean(),
  wants_recommendation: z.boolean(),
  wants_broaden_search: z.boolean(),
  correction: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  budget: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
  bedrooms: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
  features: z.array(z.string()),
  is_correction: z.boolean(),
  correction_target: z.enum(['transaction_type', 'location', 'budget', 'property_type', 'unknown']),
  list_mode: z.boolean(),
  selection: z.object({
    type: z.enum(['ordinal', 'name', 'attribute', 'none']),
    value: z.union([z.string(), z.number()]).nullable(),
  }),
  language: z.enum(['es', 'en', 'it', 'other']),
})

function fallbackSemanticInterpretation(text: string, locale: string): ChatbotSemanticInterpretation {
  const criteria = extractChatbotCriteria(text, locale)
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const selection = /\b(primer[oa]?|first|primo)\b/.test(normalized)
    ? { type: 'ordinal' as const, value: 1 }
    : /\b(segund[oa]?|second|secondo)\b/.test(normalized)
      ? { type: 'ordinal' as const, value: 2 }
      : /\b(tercer[oa]?|third|terzo)\b/.test(normalized)
        ? { type: 'ordinal' as const, value: 3 }
        : /\b(mas barato|m[aá]s barato|cheapest|meno caro)\b/.test(normalized)
          ? { type: 'attribute' as const, value: 'cheapest' }
          : /\b(mas grande|m[aá]s grande|largest|biggest|piu grande)\b/.test(normalized)
            ? { type: 'attribute' as const, value: 'largest' }
            : { type: 'none' as const, value: null }
  const greeting = /^(hola|hello|hi|ciao|buenas|buenos dias|buenas tardes|buenas noches)$/.test(normalized)
  const thanks = /^(gracias|thanks|thank you|grazie)$/.test(normalized)
  const compare = /(compar|compare|confront)/.test(normalized)
  const human = /(agente|asesor|persona real|human|advisor|consulente)/.test(normalized)
  const detail = selection.type !== 'none' || /(detalles|informacion|información|details|tell me more|direccion|dirección|price|precio)/.test(normalized)
  const acceptedPreviousSuggestion = /^(si|sí|claro|vale|ok|okay|hazlo|por favor|adelante|yes|please|go ahead|va bene|certo)$/.test(normalized)
    || /(revisa por mi|revisa la zona|revisa por mí|hazlo por mi|hazlo por mí|check it for me|review it for me|controlla per me)/.test(normalized)
  const wantsBroadenSearch = /(revisa por mi|revisa la zona|revisar la zona|amplia la busqueda|amplía la búsqueda|amplia la zona|amplía la zona|busca alrededor|zonas cercanas|cerca tambien|around that area|broaden|expand the search|check nearby|allarga la ricerca|zona vicina)/.test(normalized)
  const wantsList = /(cartera|catalogo|catálogo|opciones|listado|muestrame|muéstrame|dame todos|show me|show all|list|catalog|fammi vedere|elenco)/.test(normalized)
  const wantsRecommendation = /(recomiend|recommend|consigli)/.test(normalized)
  const isFollowUp = acceptedPreviousSuggestion || /^(si|sí|ok|vale|claro|hazlo|por favor|yes|please|okay|va bene|certo)$/.test(normalized) || normalized.split(/\s+/).length <= 4

  return {
    intent: greeting ? 'greeting' : thanks ? 'thanks' : human ? 'human_handoff' : compare ? 'compare' : detail ? 'property_detail' : 'property_search',
    transaction_type: criteria.operation || 'unknown',
    location: {
      city: criteria.city || null,
      zone: criteria.subzone || criteria.search_area || null,
      relationship: /centro|center/.test(normalized) ? 'center' : /alrededor|around|cerca/.test(normalized) ? 'around' : 'unknown',
    },
    property_type: criteria.property_type || null,
    is_followup: isFollowUp,
    accepted_previous_suggestion: acceptedPreviousSuggestion,
    wants_agent: human,
    wants_list: wantsList,
    wants_recommendation: wantsRecommendation,
    wants_broaden_search: wantsBroadenSearch,
    correction: /(no .* comprar|no .* alquilar|te estoy diciendo|correccion|corrección|instead|rather|prefiero|mejor)/.test(normalized) ? text : null,
    confidence: 0.45,
    budget: {
      min: criteria.budget_min ?? null,
      max: criteria.budget_max ?? null,
    },
    bedrooms: {
      min: criteria.rooms_min ?? criteria.rooms ?? null,
      max: criteria.rooms_max ?? criteria.rooms ?? null,
    },
    features: [...(criteria.attributes || []), ...(criteria.logistic_attributes || []), ...(criteria.qualitative_attributes || [])],
    is_correction: /\b(no .* comprar|no .* alquilar|te estoy diciendo|correccion|corrección|instead|rather|prefiero|mejor)\b/.test(normalized),
    correction_target: criteria.operation ? 'transaction_type' : 'unknown',
    list_mode: /(todos|todas|opciones|all|tutti|compare|compar)/.test(normalized),
    selection,
    language: locale === 'en' || locale === 'it' || locale === 'es' ? (locale as 'es' | 'en' | 'it') : 'other',
  }
}

function normalizeSemanticInterpretation(raw: unknown, text: string, locale: string): ChatbotSemanticInterpretation {
  const fallback = fallbackSemanticInterpretation(text, locale)
  if (!raw || typeof raw !== 'object') return fallback
  const parsed = raw as Record<string, unknown>
  return {
    intent: typeof parsed.intent === 'string' ? parsed.intent as ChatbotSemanticInterpretation['intent'] : fallback.intent,
    transaction_type: parsed.transaction_type === 'rent' || parsed.transaction_type === 'sale' ? parsed.transaction_type : fallback.transaction_type,
    location: {
      city: typeof (parsed.location as Record<string, unknown> | undefined)?.city === 'string' ? (parsed.location as Record<string, unknown>).city as string : fallback.location.city,
      zone: typeof (parsed.location as Record<string, unknown> | undefined)?.zone === 'string' ? (parsed.location as Record<string, unknown>).zone as string : fallback.location.zone,
      relationship: ['center', 'near_center', 'around', 'exact', 'unknown'].includes(String((parsed.location as Record<string, unknown> | undefined)?.relationship || ''))
        ? (parsed.location as Record<string, unknown>).relationship as ChatbotSemanticInterpretation['location']['relationship']
        : fallback.location.relationship,
    },
    property_type: typeof parsed.property_type === 'string' ? parsed.property_type : fallback.property_type,
    is_followup: typeof parsed.is_followup === 'boolean' ? parsed.is_followup : fallback.is_followup,
    accepted_previous_suggestion: typeof parsed.accepted_previous_suggestion === 'boolean' ? parsed.accepted_previous_suggestion : fallback.accepted_previous_suggestion,
    wants_agent: typeof parsed.wants_agent === 'boolean' ? parsed.wants_agent : fallback.wants_agent,
    wants_list: typeof parsed.wants_list === 'boolean' ? parsed.wants_list : fallback.wants_list,
    wants_recommendation: typeof parsed.wants_recommendation === 'boolean' ? parsed.wants_recommendation : fallback.wants_recommendation,
    wants_broaden_search: typeof parsed.wants_broaden_search === 'boolean' ? parsed.wants_broaden_search : fallback.wants_broaden_search,
    correction: typeof parsed.correction === 'string' ? parsed.correction : fallback.correction,
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : fallback.confidence,
    budget: {
      min: typeof (parsed.budget as Record<string, unknown> | undefined)?.min === 'number' ? (parsed.budget as Record<string, unknown>).min as number : fallback.budget.min,
      max: typeof (parsed.budget as Record<string, unknown> | undefined)?.max === 'number' ? (parsed.budget as Record<string, unknown>).max as number : fallback.budget.max,
    },
    bedrooms: {
      min: typeof (parsed.bedrooms as Record<string, unknown> | undefined)?.min === 'number' ? (parsed.bedrooms as Record<string, unknown>).min as number : fallback.bedrooms.min,
      max: typeof (parsed.bedrooms as Record<string, unknown> | undefined)?.max === 'number' ? (parsed.bedrooms as Record<string, unknown>).max as number : fallback.bedrooms.max,
    },
    features: Array.isArray(parsed.features) ? parsed.features.filter((item): item is string => typeof item === 'string') : fallback.features,
    is_correction: typeof parsed.is_correction === 'boolean' ? parsed.is_correction : fallback.is_correction,
    correction_target: ['transaction_type', 'location', 'budget', 'property_type', 'unknown'].includes(String(parsed.correction_target || ''))
      ? parsed.correction_target as ChatbotSemanticInterpretation['correction_target']
      : fallback.correction_target,
    list_mode: typeof parsed.list_mode === 'boolean' ? parsed.list_mode : fallback.list_mode,
    selection: {
      type: ['ordinal', 'name', 'attribute', 'none'].includes(String((parsed.selection as Record<string, unknown> | undefined)?.type || ''))
        ? (parsed.selection as Record<string, unknown>).type as ChatbotSemanticInterpretation['selection']['type']
        : fallback.selection.type,
      value: typeof (parsed.selection as Record<string, unknown> | undefined)?.value === 'string' || typeof (parsed.selection as Record<string, unknown> | undefined)?.value === 'number'
        ? (parsed.selection as Record<string, unknown>).value as string | number
        : fallback.selection.value,
    },
    language: ['es', 'en', 'it', 'other'].includes(String(parsed.language || ''))
      ? parsed.language as ChatbotSemanticInterpretation['language']
      : fallback.language,
  }
}

function buildSemanticSystemPrompt(locale: string) {
  return [
    'You classify real-estate chat turns into structured JSON.',
    'Return ONLY valid JSON. No markdown. No explanations.',
    'Understand natural language, corrections, frustration, follow-ups, and mixed wording.',
    'Infer transaction_type carefully: rent means alquiler/affitto/lease; sale means compra/venta/buy.',
    'If the user is correcting a previous misunderstanding, set is_correction=true and correction_target accordingly.',
    'Detect if the user is accepting your previous suggestion, asking you to review on their behalf, or asking you to broaden the search.',
    'If the user asks for all options, list, compare, previous results, or a subset, set list_mode=true.',
    'If the user selects one option by ordinal/name/attribute, fill selection.',
    `Output language code using this active locale as hint: ${locale}.`,
  ].join(' ')
}

function buildSemanticUserPrompt(args: {
  text: string
  locale: string
  currentCriteria: ChatbotSearchCriteria | null
  currentActiveFocus: string | null
  currentSelectedProperty: { id: string; title: string } | null
  previousBotMessage: string | null
  currentResults: Array<{ id: string; title: string; city: string | null; deal_type: string | null; price: number | null }>
}) {
  return JSON.stringify({
    task: 'interpret_real_estate_turn',
    required_schema: {
      intent: 'property_search | property_detail | compare | recommendation | schedule_visit | human_handoff | greeting | thanks | unknown',
      transaction_type: 'rent | sale | unknown',
      location: { city: 'string|null', zone: 'string|null', relationship: 'center | near_center | around | exact | unknown' },
      property_type: 'string|null',
      is_followup: 'boolean',
      accepted_previous_suggestion: 'boolean',
      wants_agent: 'boolean',
      wants_list: 'boolean',
      wants_recommendation: 'boolean',
      wants_broaden_search: 'boolean',
      correction: 'string|null',
      confidence: 'number 0..1',
      budget: { min: 'number|null', max: 'number|null' },
      bedrooms: { min: 'number|null', max: 'number|null' },
      features: ['string'],
      is_correction: 'boolean',
      correction_target: 'transaction_type | location | budget | property_type | unknown',
      list_mode: 'boolean',
      selection: { type: 'ordinal | name | attribute | none', value: 'string|number|null' },
      language: 'es | en | it | other',
    },
    active_locale: args.locale,
    current_criteria: args.currentCriteria,
    current_active_focus: args.currentActiveFocus,
    current_selected_property: args.currentSelectedProperty,
    previous_bot_message: args.previousBotMessage,
    current_results: args.currentResults,
    user_message: args.text,
  })
}

export async function generateSemanticInterpretation(args: {
  text: string
  locale: string
  currentCriteria: ChatbotSearchCriteria | null
  currentActiveFocus: string | null
  currentSelectedProperty: { id: string; title: string } | null
  previousBotMessage: string | null
  currentResults: Array<{ id: string; title: string; city: string | null; deal_type: string | null; price: number | null }>
}): Promise<{ result: ChatbotSemanticInterpretation; mode: 'ai' | 'fallback'; source: string }> {
  if (!hasAiProviderConfig()) {
    return { result: fallbackSemanticInterpretation(args.text, args.locale), mode: 'fallback', source: 'semantic_no_provider' }
  }

  try {
    const openrouter = getOpenRouterProvider()
    const { object } = await generateObject({
      model: openrouter(AI_MODELS.fast),
      system: buildSemanticSystemPrompt(args.locale),
      prompt: buildSemanticUserPrompt(args),
      temperature: 0,
      schema: semanticInterpretationSchema,
    })
    return {
      result: normalizeSemanticInterpretation(object, args.text, args.locale),
      mode: 'ai',
      source: 'openrouter_semantic_fast',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_semantic_error'
    return {
      result: fallbackSemanticInterpretation(args.text, args.locale),
      mode: 'fallback',
      source: `semantic_fallback:${message}`,
    }
  }
}

const ADMIN_UNSAFE_REPLY_PATTERNS = [
  /\b\d{3}[- ]?\d{3}[- ]?\d{3,4}\b/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunedi|lunedì|martedi|martedì|mercoledi|mercoledì|giovedi|giovedì|venerdi|venerdì|sabato|domenica)\b[^.!?]*\b\d{1,2}:\d{2}\b/i,
  /\b(?:de\s+\d{1,2}:\d{2}\s*(?:a|to|alle?)\s*\d{1,2}:\d{2})\b/i,
  /soporte@|support@|info@|contact@/i,
  /\bm[oó]dulo\b|\bmodule\b|\bmodulo\b/i,
  /crm support|area crm support|área crm support/i,
  /\bticket\b|\bcase status\b|\bestado del caso\b|\bestado del ticket\b/i,
  /contactos, oportunidades, tareas y seguimientos/i,
  /contacts, opportunities, tasks and follow-ups/i,
  /contatti, opportunita, attivita e follow-up/i,
  /listado de contactos/i,
  /detalle de una oportunidad/i,
  /configuracion de usuarios|configuración de usuarios/i,
  /panel de control/i,
  /resumen general/i,
  /gestion de clientes|gestión de clientes/i,
  /detalle de contrato/i,
  /datos del cliente/i,
  /historial de pagos/i,
  /revisiones/i,
  /barra superior|barra lateral|iconos de notificaciones|banners|recuadros destacados/i,
  /contact list/i,
  /opportunity detail/i,
  /user settings/i,
  /dashboard/i,
  /general overview/i,
  /customer management/i,
  /contract detail/i,
  /customer data/i,
  /payment history/i,
  /reviews/i,
  /top bar|side bar|notification icons|banners|highlighted boxes/i,
  /elenco contatti/i,
  /dettaglio opportunita|dettaglio opportunità/i,
  /configurazione utenti/i,
  /pannello di controllo/i,
  /riepilogo generale/i,
  /gestione clienti/i,
  /dettaglio contratto/i,
  /dati del cliente/i,
  /storico pagamenti/i,
  /revisioni/i,
  /barra superiore|barra laterale|icone notifiche|banner|riquadri evidenziati/i,
]

function hasUnsafeAdminContactClaims(text: string) {
  return ADMIN_UNSAFE_REPLY_PATTERNS.some((pattern) => pattern.test(text))
}

const ADMIN_UI_TERMS = [
  'dashboard', 'resumen general', 'panel de control', 'gestión de clientes', 'detalle de contrato', 'datos del cliente', 'historial de pagos', 'tickets', 'revisiones',
  'general overview', 'control panel', 'customer management', 'contract detail', 'customer data', 'payment history', 'reviews',
  'pannello di controllo', 'riepilogo generale', 'gestione clienti', 'dettaglio contratto', 'dati del cliente', 'storico pagamenti', 'revisioni',
  'barra superior', 'barra lateral', 'iconos de notificaciones', 'banners', 'recuadros destacados',
  'top bar', 'side bar', 'notification icons', 'highlighted boxes',
  'barra superiore', 'barra laterale', 'icone notifiche', 'riquadri evidenziati',
]

function hasInventedAdminUiExamples(replyText: string, userText: string) {
  const reply = replyText.toLowerCase()
  const user = userText.toLowerCase()
  return ADMIN_UI_TERMS.some((term) => reply.includes(term) && !user.includes(term))
}

function hasAdminBrokenMarkdown(text: string) {
  return /(^|\n)\|.+\|/m.test(text) || /```|^#{1,6}\s/m.test(text)
}

function hasFalseCalendarAccessClaim(text: string) {
  return /no tengo acceso al calendario|no puedo acceder al calendario|no dispongo de acceso al calendario|i do not have access to the calendar|i can't access the calendar/i.test(text)
}

function hasMetaReasoningResponse(text: string) {
  return /^(we need to respond|the user said|response context|inventory context|semantic interpretation|we must|let'?s craft|debemos responder|el usuario dijo)/i.test(text.trim())
}

function buildSystemPrompt(context: ChatbotResponseContext) {
  if (context.channel === 'admin') {
    return [
      'Eres un asistente interno de soporte CRM para el panel admin.',
      'Responde solo como soporte operativo interno.',
      'No actúes como buscador inmobiliario público.',
      'No hables de inventario, propiedades disponibles, precios de inmuebles, compra, alquiler o visitas comerciales.',
      'No uses property search, no enumeres inmuebles y no sugieras búsqueda inmobiliaria.',
      'Si el usuario pregunta por una vivienda o una zona, redirígelo con prudencia a gestión interna, revisión por agente o soporte humano.',
      'No inventes nunca teléfonos, emails, horarios, disponibilidad, nombres de agentes ni datos de contacto internos.',
      'No inventes módulos, áreas, botones, rutas, tickets, estados, secciones ni procedimientos internos del CRM.',
      'No afirmes que exista un módulo de soporte, un área CRM Support, un ticket, un estado del caso o un flujo interno concreto si no aparece en el contexto.',
      'Si no existe un dato real confirmado, dilo claramente y deriva al equipo humano o pide al usuario que indique la pantalla o acción visible que tiene delante.',
      'No pongas ejemplos de pantallas, módulos, bloques, botones, secciones, etiquetas ni rutas si no aparecen literalmente en el contexto o en el mensaje del usuario.',
      'No hagas suposiciones visuales como barra superior, barra lateral, iconos, banners, recuadros o bloques destacados si no aparecen en el mensaje o en contexto verificable.',
      'Si app_knowledge trae una sola pantalla conocida, asumela como la pantalla activa del hilo y manten ese contexto en los siguientes turnos.',
      'Si app_knowledge trae la pantalla actual de la app, responde desde esa pantalla y no cambies a otra por inferencia blanda.',
      'Usa screen_path y current_user_role como contexto real. Si la pantalla o el rol limitan una accion, dilo con base en ese contexto y no por suposicion.',
      'Si ya hay una pantalla conocida en app_knowledge, no vuelvas a pedir titulo exacto, etiqueta visible o contexto minimo salvo que el usuario cambie claramente de pantalla o necesites identificar un control puntual.',
      'Usa las labels de app_knowledge de forma literal y en el idioma activo. No mezcles ingles y español si la UI esta en español.',
      'No renombres bloques ni acciones visibles. Si una label real existe, usala tal cual.',
      'Si la pantalla activa anclada es Panel global, no menciones Dashboard ni acciones de Dashboard como abrir cola, abrir propiedades, abrir leads o abrir citas.',
      'Si el usuario pregunta como funciona una pantalla conocida, responde de forma natural con: que es, para que sirve, acciones principales reales y una opcion de seguir paso a paso.',
      'Evita mencionar rutas como /admin salvo que el usuario lo pida.',
      'Evita sonar tecnico o reconstruir nombres raros de secciones; explica la pantalla de forma limpia y natural usando solo conocimiento confirmado.',
      'Si el usuario pregunta qué dato visible mirar primero o cómo empezar a analizar la pantalla, responde en una o dos frases como máximo. Si no hay pantalla conocida, pide el título exacto y la etiqueta visible más cercana. Si ya hay pantalla conocida, pide solo el bloque o control visible implicado.',
      'Si la pregunta es de citas o disponibilidad, prioriza fecha, horas ocupadas/libres y disponibilidad real; no desvíes a zona, direccion ni busqueda de propiedad salvo que el usuario pida crear una cita y falte ese dato imprescindible.',
      'No añadas ejemplos de pantallas, secciones, bloques, barras, iconos o etiquetas si no están literalmente en el mensaje del usuario.',
      'Si app_knowledge incluye una pantalla relevante, puedes apoyarte solo en esa información estructurada para orientar. Si no aparece en app_knowledge, no inventes la estructura y pide el dato visible mínimo necesario.',
      'Evita listas largas y evita repetir la misma instrucción con otras palabras.',
      'No uses tablas markdown, encabezados markdown, bloques de codigo ni formato raro para responder en el widget.',
      'Si te preguntan por contacto u horario, responde con prudencia: no dispongo de un dato confirmado en este momento y lo correcto es derivarlo al equipo interno.',
      'Mantén tono profesional, breve y útil.',
      'Usa solo contexto válido del CRM admin.',
      `Idioma de salida: ${context.locale}. Canal: ${context.channel}.`,
    ].join(' ')
  }

  return [
    'Eres el Asistente Inmobiliario Inteligente de MARCO ANDRES RUIZ ZAMBRANO AGENTE INMOBILIARIO.',
    'Tu trabajo es redactar la respuesta final al cliente usando SOLO los hechos del contexto.',
    'No inventes datos. No adivines. No completes con imaginación.',
    'Responde al ultimo turno del usuario, no a un resumen viejo.',
    'Nunca describas tu razonamiento, nunca expliques el contexto interno y nunca escribas frases meta como “the user said” o “we need to respond”.',
    'Si falta un dato real, dilo claramente y ofrece el siguiente paso util.',
    'Si el modo es concrete_property, responde sobre esa propiedad concreta y no vuelvas a la búsqueda abstracta.',
    'Si el modo es crm_support, responde como soporte operativo del CRM.',
    'Si el modo es human_handoff, confirma derivación humana y no sigas vendiendo.',
    'Si el turn_type es hard_reset, trata la búsqueda anterior como reemplazada por completo.',
    'Si no hay criterios de búsqueda suficientes, no digas que no hay inventario cargado en el sistema; limita la respuesta a saludar o pedir el dato clave que falta.',
    'Si candidate_properties_summary está vacío, no afirmes que hay inmuebles disponibles.',
    'Si no hay resultados, di con claridad que no hay opciones claras ahora mismo y propone el siguiente paso útil.',
    'Diferencia claramente entre: no hay inventario cargado en esa zona, sí hay inventario en esa zona pero no encaja, o todavía faltan datos del usuario.',
    'Si no hay inventario en la zona pedida y sí lo hay en otras ciudades del sistema, dilo de forma clara y breve.',
    'Si sí hay inventario en la ciudad pedida pero no encaja por filtros, explícalo sin inventar propiedades que no cumplen.',
    'Conserva filtros importantes ya entendidos, como habitaciones, baños, presupuesto y cercanía a servicios o transporte.',
    'Cuando inventory_context.no_match_reason sea no_inventory_in_area, menciona explícitamente que no hay propiedades cargadas en esa zona y, si existen, nombra la ciudad donde sí hay stock. Aunque falte un dato, puedes decirlo y luego hacer una sola pregunta útil.',
    'Cuando inventory_context.no_match_reason sea inventory_in_area_but_no_match, explica que sí hay inventario en la zona pero que no encaja con el tipo, presupuesto o filtros ya dados. No lo conviertas en un simple “faltan datos” si el filtro ya explica el problema.',
    'Cuando inventory_context.no_match_reason sea missing_user_data, pide solo un dato clave para avanzar y no repitas una explicación larga.',
    'Si next_best_question existe y inventory_context.no_match_reason no es no_inventory_in_area ni inventory_in_area_but_no_match, no digas que no encaja: limita la respuesta a pedir ese dato clave para afinar.',
    'Si semantic_interpretation.accepted_previous_suggestion o semantic_interpretation.wants_broaden_search son true, actúa sobre esa petición y explica la revisión real del catálogo con naturalidad.',
    'Si matched_properties_count es mayor que 1, presenta opciones reales de forma breve y profesional usando candidate_properties_summary.',
    'Si matched_properties_count es 1, presenta esa opción como asesor, sin repetir fórmulas rígidas.',
    'Nunca llames casa a un apartamento, ático, local o cualquier otro tipo distinto. Respeta property_type y deal_type del catálogo real.',
    'Si la búsqueda se amplió y las alternativas ya no coinciden exactamente con el tipo o la zona pedida, dilo con honestidad y naturalidad.',
    'Evita frases robóticas o pobres como “Entiendo la búsqueda como”, “Tengo un casa”, o repeticiones casi idénticas entre turnos.',
    'Habla como asesor inmobiliario profesional: natural, claro, útil y orientado al siguiente paso.',
    'Si el usuario ya dio varios filtros, no los pierdas ni los reduzcas a una frase vaga.',
    'Evita entrar en bucle con frases como “te ayudo a buscar” o “no tengo resultados claros”; explica qué falta o qué no encaja y propone un siguiente paso concreto.',
    'Mantén tono natural, profesional, breve y útil.',
    'No uses markdown visible, ni negritas, ni listas con viñetas salvo que sea imprescindible.',
    'Prioriza 1 o 2 frases cortas y, como mucho, una pregunta útil al final.',
    'Evita explicar el proceso interno, evita sonar burocrático y evita repetir información ya obvia.',
    'Si el modo es seller, pide solo 1 o 2 datos clave para avanzar.',
    'Si el modo es financing_basic, da orientación breve y práctica.',
    'Si el modo es legal_complex o human_handoff, deja una sola señal clara de derivación y no la repitas.',
    'Para búsquedas básicas, evita expresiones rígidas como “casa de compra” o “apartamento para compra”; usa español natural de asesor inmobiliario.',
    'En propiedad concreta, no repitas dos veces el nombre, ciudad o dirección si ya quedaron claros en la primera frase.',
    'En seller, suena práctico y comercial: pide primero zona o dirección aproximada y un dato útil como metros, precio orientativo o si hay tasación.',
    'En hipoteca, responde en una o dos frases y evita listas largas.',
    'En legal/handoff, mantén una sola señal breve de derivación.',
    `Idioma de salida: ${context.locale}. Canal: ${context.channel}.`,
  ].join(' ')
}

function buildUserPrompt(context: ChatbotResponseContext) {
  return JSON.stringify(context, null, 2)
}

export function buildResponseContext(args: {
  locale: string
  channel: string
  tenantSlug: string | null
  screenPath?: string | null
  currentUserRole?: string | null
  latestUserMessage: string
  turnType: ChatbotTurnType
  modeResolved: ChatbotModeResolved
  activeFocus: string | null
  state: ChatbotSearchCriteria | null
  selectedProperty: ConcretePropertyRecord | null
  candidates: ConcretePropertyRecord[]
  crmSupportRequested?: boolean
  humanRequested?: boolean
  sellerRequested?: boolean
  financingRequested?: boolean
  legalComplexityFlag?: boolean
  nextBestQuestion?: string | null
  matchedPropertiesCount?: number
  semanticInterpretation?: ChatbotSemanticInterpretation | null
  trace?: ChatbotResponseContext['trace']
  inventoryContext?: ChatbotResponseContext['inventory_context']
  responseGoal: string
  app_knowledge?: Array<Pick<AppKnowledgeEntry, 'route' | 'routePatterns' | 'title' | 'sections' | 'actions' | 'forms' | 'filters' | 'entities' | 'roleScope' | 'relatedFlows' | 'supportFields' | 'minimumContext' | 'guidance'>>
}): ChatbotResponseContext {
  const {
    locale,
    channel,
    tenantSlug,
    screenPath = null,
    currentUserRole = null,
    latestUserMessage,
    turnType,
    modeResolved,
    activeFocus,
    state,
    selectedProperty,
    candidates,
    crmSupportRequested = false,
    humanRequested = false,
    sellerRequested = false,
    financingRequested = false,
    legalComplexityFlag = false,
    nextBestQuestion = null,
    matchedPropertiesCount = 0,
    semanticInterpretation = null,
    trace = null,
    inventoryContext = { available_cities: [], same_area_inventory_count: 0, no_match_reason: 'none' },
    responseGoal,
    app_knowledge = [],
  } = args

  return {
    locale,
    channel,
    tenant_slug: tenantSlug,
    screen_path: screenPath,
    current_user_role: currentUserRole,
    turn_type: turnType,
    mode_resolved: modeResolved,
    active_focus: activeFocus,
    latest_user_message: latestUserMessage,
    sanitized_search_context: state
      ? {
          operation: state.operation,
          property_type: state.property_type,
          property_label: state.property_label,
          city: state.city,
          search_area: state.search_area,
          location_scope: state.location_scope,
          subzone: state.subzone,
          location_clauses: state.location_clauses,
          logistics: state.logistic_attributes,
          rooms: state.rooms,
          rooms_min: state.rooms_min,
          bathrooms: state.bathrooms,
          bathrooms_min: state.bathrooms_min,
          budget_max: state.budget_max,
          budget_min: state.budget_min,
          currency: 'EUR',
          urgency: state.urgency,
          attributes: state.attributes,
        }
      : null,
    selected_property: selectedProperty ? { id: selectedProperty.id, title: selectedProperty.title } : null,
    selected_property_facts: selectedProperty
      ? {
          title: selectedProperty.title,
          city: selectedProperty.city,
          address: selectedProperty.address,
          property_type: selectedProperty.property_type,
          deal_type: selectedProperty.deal_type,
          price: selectedProperty.price,
          rooms: selectedProperty.rooms,
        }
      : null,
    candidate_properties_summary: candidates.slice(0, 10).map((property) => ({ title: property.title, city: property.city, price: property.price, property_type: property.property_type, deal_type: property.deal_type })),
    inventory_context: inventoryContext,
    seller_context: sellerRequested ? { requested: true } : null,
    crm_support_context: crmSupportRequested ? { requested: true, topic: 'crm_support' } : null,
    human_handoff_context: humanRequested ? { requested: true } : null,
    financing_context: financingRequested ? { requested: true } : null,
    legal_complexity_flag: legalComplexityFlag,
    matched_properties_count: matchedPropertiesCount,
    semantic_interpretation: semanticInterpretation,
    trace,
    allowed_claims: [
      'selected_property_facts',
      'candidate_properties_summary',
      'sanitized_search_context',
      'crm_support_context',
      'human_handoff_context',
      'financing_context',
    ],
    forbidden_assumptions: [
      'No inventar precio, dirección, disponibilidad, entorno, atributos, zonas exactas ni acciones del CRM.',
      'No suponer compra o alquiler si no está resuelto.',
      'No volver al summary viejo si el último turno pide otra cosa.',
    ],
    next_best_question: nextBestQuestion,
    tone_style: channel === 'whatsapp' ? 'whatsapp' : channel === 'email' ? 'email' : 'dashboard',
    response_goal: responseGoal,
    app_knowledge,
  }
}

export async function generateVisibleReplyWithAi(args: {
  responseContext: ChatbotResponseContext
  fallbackText: string
}): Promise<ChatbotAiResult> {
  const { responseContext, fallbackText } = args

  if (!hasAiProviderConfig()) {
    return {
      text: fallbackText,
      generation_mode: 'fallback',
      source: 'fallback_no_provider_key',
    }
  }

  try {
    const openrouter = getOpenRouterProvider()
    const { object } = await generateObject({
      model: openrouter(AI_MODELS.balanced),
      system: buildSystemPrompt(responseContext),
      prompt: buildUserPrompt(responseContext),
      temperature: 0.1,
      schema: z.object({ reply: z.string().min(1).max(900) }),
    })

    const normalizedText = object.reply.trim()

    if (!normalizedText) {
      return {
        text: fallbackText,
        generation_mode: 'fallback',
        source: 'fallback_ai_empty_response',
      }
    }

    if (hasMetaReasoningResponse(normalizedText)) {
      return {
        text: fallbackText,
        generation_mode: 'fallback',
        source: 'fallback_ai_meta_response',
      }
    }

    if (responseContext.channel === 'admin' && hasUnsafeAdminContactClaims(normalizedText)) {
      return {
        text: fallbackText,
        generation_mode: 'fallback',
        source: 'fallback_admin_guardrail_contact_claims',
      }
    }

    if (responseContext.channel === 'admin' && hasInventedAdminUiExamples(normalizedText, responseContext.latest_user_message)) {
      return {
        text: fallbackText,
        generation_mode: 'fallback',
        source: 'fallback_admin_guardrail_ui_examples',
      }
    }

    if (responseContext.channel === 'admin' && hasAdminBrokenMarkdown(normalizedText)) {
      return {
        text: fallbackText,
        generation_mode: 'fallback',
        source: 'fallback_admin_guardrail_markdown',
      }
    }

    if (responseContext.response_goal.includes('appointment scheduling') && hasFalseCalendarAccessClaim(normalizedText)) {
      return {
        text: fallbackText,
        generation_mode: 'fallback',
        source: 'fallback_appointment_guardrail_false_access',
      }
    }

    const visibleText = normalizedText.replace(/\*\*/g, '').trim()

    return {
      text: visibleText,
      generation_mode: 'ai',
      source: 'openrouter_balanced',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_ai_error'
    return {
      text: fallbackText,
      generation_mode: 'fallback',
      source: `fallback_ai_error:${message}`,
    }
  }
}

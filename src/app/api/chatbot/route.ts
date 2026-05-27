import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveTenantIdWithFallback } from '@/lib/supabase/local-db-fallback'
import { AI_MODELS } from '@/lib/ai/openrouter'
import { classifyMessage as classifyIntent } from '@/features/conversations/intent-engine'
import { generateReply } from '@/features/conversations/reply-engine'
import { findAvailableSlots, findAvailableSlotsForDate, findAlternativeSlots, suggestSlotsMessage, parseExactAppointmentDateTime, parseAppointmentDateReference, buildSlotFromDateAndTime, isSlotAvailable, isAppointmentConfirmation, extractTimeFromNaturalResponse, matchTimeToSlot, findClosestSlotToTime } from '@/features/conversations/scheduling-engine'
import {
  generateSessionId,
  findConversationBySession,
  buildNextDialogueState,
  detectHumanContactIntent,
  detectCrmSupportIntent,
  detectFinancingIntent,
  detectLegalComplexIntent,
  detectSellerIntent,
  buildCrmSupportReply,
  buildAdminSupportReply,
  buildAdminVisibleDataReply,
  detectAdminVisibleDataQuestion,
  detectAdminKnownScreenQuestion,
  detectAdminStepByStepQuestion,
  detectAdminDailyUseQuestion,
  buildAdminKnownScreenReply,
  buildAdminStepByStepReply,
  buildAdminDailyUseReply,
  buildKnownScreenReply,
  buildScreenVisibleDataReply,
  buildScreenStepByStepReply,
  buildScreenSupportReply,
  buildFinancingReply,
  buildSellerHelpReply,
  buildHumanContactReply,
  buildLegalComplexReply,
} from '@/features/conversations/chatbot-engine'
import { buildResponseContext, generateSemanticInterpretation, generateVisibleReplyWithAi } from '@/features/conversations/chatbot-ai'
import { findExplicitAppKnowledgeMatch, findExplicitAppKnowledgeSwitchMatch, findRelevantAppKnowledge, getAppKnowledgeByPath, getAppKnowledgeByRoute } from '@/features/conversations/chatbot-app-knowledge'
import {
  buildConcretePropertyReply,
  buildPropertyReply,
  decidePropertyFlow,
  hasPropertySearchContext,
  interpretPropertyTurn,
  isConcretePropertyFollowUp,
  isResultQuestion,
  mergePropertyState,
  propertyMatchesOperation,
  rankPropertyMatches,
  resolveConcretePropertyReference,
} from '@/features/conversations/chatbot-property-core'
import { upsertChatbotLeadCapture } from '@/features/conversations/chatbot-lead-capture'
import { upsertChatbotCrmAction } from '@/features/conversations/chatbot-crm-actions'
import type { IntentType, DecisionType } from '@/features/conversations/intent-types'
import type { ChatbotMetadata, ChatbotDialogueState, ChatbotSearchCriteria } from '@/features/conversations/chatbot-engine'

function sanitizeAnchoredAdminReply(replyText: string, anchoredRoute: string | null, fallbackText: string) {
  if (anchoredRoute !== '/admin') return replyText

  const forbiddenPatterns = [
    /dashboard/i,
    /abrir cola/i,
    /abrir propiedades/i,
    /abrir leads/i,
    /abrir citas/i,
  ]

  return forbiddenPatterns.some((pattern) => pattern.test(replyText)) ? fallbackText : replyText
}

function buildAdminClarificationReply(locale: string) {
  if (locale === 'en') {
    return 'I do not have the active screen tied down yet. Tell me the exact screen title you see and I will guide you from there.'
  }
  if (locale === 'it') {
    return 'No tengo la pantalla activa confirmada todavia. Dime el titulo exacto que ves y te guio desde ahi.'
  }
  return 'No tengo la pantalla activa confirmada todavia. Dime el titulo exacto que ves y te guio desde ahi.'
}

function shouldBlockDashboardDefault(args: {
  text: string
  anchoredRoute: string | null
  explicitSwitchRoute: string | null
}) {
  if (args.anchoredRoute === '/admin') return true
  if (args.explicitSwitchRoute === '/dashboard') return false

  const normalized = args.text.toLowerCase()
  return /ese panel|esa pantalla|esta pantalla|este panel/.test(normalized)
}

function sanitizeAdminFinalReply(args: {
  replyText: string
  anchoredRoute: string | null
  fallbackText: string
  text: string
  locale: string
  explicitSwitchRoute: string | null
}) {
  const anchoredSafeText = sanitizeAnchoredAdminReply(args.replyText, args.anchoredRoute, args.fallbackText)

  if (!shouldBlockDashboardDefault({
    text: args.text,
    anchoredRoute: args.anchoredRoute,
    explicitSwitchRoute: args.explicitSwitchRoute,
  })) {
    return anchoredSafeText
  }

  const forbiddenPatterns = [
    /dashboard/i,
    /abrir cola/i,
    /abrir propiedades/i,
    /abrir leads/i,
    /abrir citas/i,
  ]

  return forbiddenPatterns.some((pattern) => pattern.test(anchoredSafeText))
    ? (args.anchoredRoute === '/admin' ? args.fallbackText : buildAdminClarificationReply(args.locale))
    : anchoredSafeText
}

function normalizeChatText(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function detectAppointmentAvailabilityIntent(text: string) {
  const normalized = normalizeChatText(text)
  return /(horarios?.*(libres|disponibles)|disponibilidad|que horarios siguen libres|que horas quedan libres|que huecos quedan|que huecos hay|horas libres)/.test(normalized)
}

function detectFirstFreeSlotIntent(text: string) {
  const normalized = normalizeChatText(text)
  return /(primer horario libre|primer hueco libre|primera hora libre|primer turno libre)/.test(normalized)
}

function detectAppointmentBookingIntent(text: string) {
  const normalized = normalizeChatText(text)
  return /(reservar|reservare|reservare|reservaremos|agendar|agendare|agendare|cita|visita|hora)/.test(normalized)
}

function detectBuyerPurchaseIntent(text: string) {
  const normalized = normalizeChatText(text)
  return /(lo quiero comprar|quiero comprar(?: esta propiedad| esta casa| este piso| este inmueble)|quiero comprarlo|me interesa esta propiedad|estoy interesado en esta propiedad|quiero avanzar con la compra|buy this property|buy this house|i want this property|voglio comprare questo immobile|mi interessa questa proprieta)/.test(normalized)
}

function detectHumanHandoffAffirmation(text: string) {
  const normalized = normalizeChatText(text).trim()
  return /^(si|sí|claro|ok|vale|perfecto|de acuerdo|por favor|yes|sure|okay|ok then|of course|va bene|certo|si per favore)$/.test(normalized)
}

function detectSearchAcceptanceIntent(text: string) {
  const normalized = normalizeChatText(text).trim()
  return /^(si|sí|claro|vale|ok|okay|hazlo|por favor|adelante|yes|please|go ahead|va bene|certo)$/.test(normalized)
    || /(revisa por mi|revisa por mí|revisa la zona|busca tu|busca tú|hazlo tu|hazlo tú|amplia la busqueda|amplía la búsqueda|amplia la zona|amplía la zona|muestrame|muéstrame|por favor revisa|please review|check it for me|broaden the search|allarga la ricerca)/.test(normalized)
}

function buildBuyerPurchaseReply(args: {
  locale: 'es' | 'en' | 'it'
  selectedPropertyTitle?: string | null
  needsPropertyContext: boolean
}) {
  if (args.needsPropertyContext) {
    if (args.locale === 'en') return 'Perfect. Which property would you like to move forward with?'
    if (args.locale === 'it') return 'Perfetto, su quale immobile ti piacerebbe andare avanti?'
    return 'Perfecto, ¿sobre qué propiedad te gustaría avanzar?'
  }

  if (args.locale === 'en') {
    return args.selectedPropertyTitle
      ? `Perfect. I can help you move forward with ${args.selectedPropertyTitle}. If you want, I can arrange human follow-up or continue with the next purchase step here.`
      : 'Perfect. I can help you move forward with the purchase. If you want, I can arrange human follow-up or continue with the next step here.'
  }
  if (args.locale === 'it') {
    return args.selectedPropertyTitle
      ? `Perfetto. Posso aiutarti ad avanzare con ${args.selectedPropertyTitle}. Se vuoi, posso lasciarlo in follow-up umano oppure continuare qui con il prossimo passo.`
      : 'Perfetto. Posso aiutarti ad avanzare con l acquisto. Se vuoi, posso lasciarlo in follow-up umano oppure continuare qui con il prossimo passo.'
  }
  return args.selectedPropertyTitle
    ? `Perfecto. Puedo ayudarte a avanzar con ${args.selectedPropertyTitle}. Si quieres, puedo dejarlo en seguimiento humano o continuar por aquí con el siguiente paso de compra.`
    : 'Perfecto. Puedo ayudarte a avanzar con la compra. Si quieres, puedo dejarlo en seguimiento humano o continuar por aquí con el siguiente paso.'
}

type StoredPropertyResult = {
  id: string
  title: string
  city: string | null
  address: string | null
  property_type: string | null
  deal_type: string | null
  price: number | null
  rooms: number | null
}

function isStoredPropertyResult(value: unknown): value is StoredPropertyResult {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.title === 'string'
}

function readStoredPropertyResults(meta: Record<string, unknown>): StoredPropertyResult[] {
  const raw = meta.chatbot_last_property_results
  if (!Array.isArray(raw)) return []
  return raw.filter(isStoredPropertyResult)
}

function detectCatalogBrowseIntent(text: string) {
  const normalized = normalizeChatText(text)
  return /(que propiedades tienes|que inmuebles tienes|que viviendas tienes|que opciones tienes|what properties do you have|what listings do you have|which properties do you have|che immobili hai|che proprieta hai|cosa hai disponibile)/.test(normalized)
}

function detectGreetingIntent(text: string) {
  return /^(hola|buenas|hello|hi|ciao|buen dia|buenos dias|buenas tardes|buenas noches)$/i.test(text.trim())
}

function detectPluralResultsIntent(text: string) {
  const normalized = normalizeChatText(text)
  return /(todos|todas|las opciones|los de antes|los inmuebles|los apartamentos|los pisos|los que dices que tienes|dame informacion de esos|dame información de esos|show me all|all of them|those options|all the properties|tutti|tutte|quelle opzioni|tutti gli immobili)/.test(normalized)
}

function detectComparisonIntent(text: string) {
  const normalized = normalizeChatText(text)
  return /(comparalos|compáralos|comparalas|compáralas|comparar|compare them|compare those|confrontali|mettili a confronto)/.test(normalized)
}

function detectRecommendationIntent(text: string) {
  const normalized = normalizeChatText(text)
  return /(cual me recomiendas|cu[aá]l me recomiendas|cual es mejor|cu[aá]l es mejor|la mejor opcion|la mejor opción|which one do you recommend|which is better|best option|quale mi consigli|qual e meglio|qual e la migliore opzione)/.test(normalized)
}

function detectThanksIntent(text: string) {
  return /^(gracias|muchas gracias|thanks|thank you|grazie)$/i.test(text.trim())
}

function extractResultSubsetCount(text: string): number | null {
  const normalized = normalizeChatText(text)
  const numericMatch = normalized.match(/\b(?:los|las|the|i|gli|le)\s+(\d+)\b/)
  if (numericMatch) return Number(numericMatch[1])

  const map: Array<[RegExp, number]> = [
    [/\b(?:los|las|the|i|gli|le)\s+dos\b/, 2],
    [/\b(?:los|las|the|i|gli|le)\s+tres\b/, 3],
    [/\b(?:los|las|the|i|gli|le)\s+cuatro\b/, 4],
    [/\b(?:the)\s+two\b/, 2],
    [/\b(?:the)\s+three\b/, 3],
    [/\b(?:the)\s+four\b/, 4],
    [/\b(?:i|gli|le)\s+due\b/, 2],
    [/\b(?:i|gli|le)\s+tre\b/, 3],
    [/\b(?:i|gli|le)\s+quattro\b/, 4],
  ]

  for (const [pattern, count] of map) {
    if (pattern.test(normalized)) return count
  }
  return null
}

function selectResultsSubset(results: StoredPropertyResult[], requestedCount: number | null): StoredPropertyResult[] {
  if (!requestedCount || requestedCount <= 0) return results
  return results.slice(0, requestedCount)
}

function resolveSelectionFromResults(text: string, results: StoredPropertyResult[]): StoredPropertyResult | null {
  const normalized = normalizeChatText(text)
  const ordinalPatterns: Array<[RegExp, number]> = [
    [/\b(primer[oa]?|first|primo)\b/, 0],
    [/\b(segund[oa]?|second|secondo)\b/, 1],
    [/\b(tercer[oa]?|third|terzo)\b/, 2],
    [/\b(cuart[oa]?|fourth|quarto)\b/, 3],
    [/\b(quint[oa]?|fifth|quinto)\b/, 4],
  ]

  for (const [pattern, index] of ordinalPatterns) {
    if (pattern.test(normalized)) return results[index] || null
  }

  if (/\b(mas barato|m[aá]s barato|cheapest|meno caro)\b/.test(normalized)) {
    return results.filter((item) => item.price != null).sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER))[0] || null
  }

  if (/\b(mas grande|m[aá]s grande|largest|biggest|piu grande)\b/.test(normalized)) {
    return results.filter((item) => item.rooms != null).sort((a, b) => (b.rooms ?? 0) - (a.rooms ?? 0))[0] || null
  }

  const cueMatch = normalized.match(/(?:la de|el de|the one in|the one at|quella di|quello di)\s+([a-z0-9\s]+)/)
  const cue = cueMatch?.[1]?.trim()
  if (cue) {
    return results.find((item) => normalizeChatText(`${item.title} ${item.address || ''} ${item.city || ''}`).includes(cue)) || null
  }

  return results.find((item) => normalized.includes(normalizeChatText(item.title)) || (!!item.address && normalized.includes(normalizeChatText(item.address)))) || null
}

function formatPropertyLine(property: StoredPropertyResult, locale: 'es' | 'en' | 'it') {
  const pieces = [property.title]
  if (property.city) pieces.push(property.city)
  if (property.property_type) pieces.push(property.property_type)
  if (property.price != null) pieces.push(String(property.price))
  if (property.rooms != null) pieces.push(locale === 'en' ? `${property.rooms} rooms` : locale === 'it' ? `${property.rooms} camere` : `${property.rooms} habitaciones`)
  return pieces.join(' - ')
}

function buildPropertyResultsListReply(args: {
  locale: 'es' | 'en' | 'it'
  results: StoredPropertyResult[]
  summary?: string | null
}) {
  const { locale, results, summary } = args
  const intro = locale === 'en'
    ? summary ? `I found these options ${summary}:` : 'I found these properties:'
    : locale === 'it'
      ? summary ? `Ho trovato queste opzioni ${summary}:` : 'Ho trovato questi immobili:'
      : summary ? `Encontré estas opciones ${summary}:` : 'Encontré estos inmuebles:'
  const lines = results.map((item, index) => `${index + 1}. ${formatPropertyLine(item, locale)}`).join('\n')
  const closing = locale === 'en'
    ? 'If you want, I can show the details of one, compare them, arrange a visit, or mark the conversation for an agent.'
    : locale === 'it'
      ? 'Se vuoi, posso darti i dettagli di uno, confrontarli, organizzare una visita o lasciare la conversazione a un consulente.'
      : 'Si quieres, puedo darte los detalles de uno, compararlos, organizar una visita o dejar la conversación para un asesor.'
  return `${intro}\n${lines}\n${closing}`
}

function buildPropertyComparisonReply(args: {
  locale: 'es' | 'en' | 'it'
  results: StoredPropertyResult[]
}) {
  const { locale, results } = args
  const intro = locale === 'en'
    ? 'Here is a quick comparison of the options we were looking at:'
    : locale === 'it'
      ? 'Ti faccio un confronto rapido delle opzioni che stavamo guardando:'
      : 'Te hago una comparativa rápida de las opciones que estábamos viendo:'
  const lines = results.map((item, index) => `${index + 1}. ${formatPropertyLine(item, locale)}`).join('\n')
  const closing = locale === 'en'
    ? 'Tell me which one you want to review in detail, or if you prefer I can recommend one based on your criteria.'
    : locale === 'it'
      ? 'Dimmi quale vuoi rivedere in dettaglio, o se preferisci te ne consiglio una in base ai tuoi criteri.'
      : 'Dime cuál quieres revisar en detalle, o si prefieres te recomiendo una según tus criterios.'
  return `${intro}\n${lines}\n${closing}`
}

function buildRecommendationReply(args: {
  locale: 'es' | 'en' | 'it'
  property: StoredPropertyResult
}) {
  const { locale, property } = args
  if (locale === 'en') {
    return `Of the options we have been reviewing, I would start with ${property.title} because it fits the current search best. If you want, I can explain why or compare it against another one.`
  }
  if (locale === 'it') {
    return `Tra le opzioni che stavamo rivedendo, io partirei da ${property.title} perché è quella che encaja meglio con la ricerca attuale. Se vuoi, ti spiego il motivo o la confronto con un altra.`
  }
  return `De las opciones que veníamos viendo, yo empezaría por ${property.title} porque es la que mejor encaja con la búsqueda actual. Si quieres, te explico por qué o la comparo con otra.`
}

function buildBrowseCatalogReply(args: {
  locale: 'es' | 'en' | 'it'
  results: StoredPropertyResult[]
}) {
  const { locale, results } = args
  if (results.length === 0) {
    if (locale === 'en') return 'Right now I do not see active properties in the catalogue. If you want, tell me city, budget, operation, or property type and I will guide the search from there.'
    if (locale === 'it') return 'In questo momento non vedo immobili attivi nel catalogo. Se vuoi, dimmi città, budget, operazione o tipologia e ti guido da lì.'
    return 'Ahora mismo no veo inmuebles activos en el catálogo. Si quieres, dime ciudad, presupuesto, operación o tipo de inmueble y te guío desde ahí.'
  }
  return buildPropertyResultsListReply({ locale, results: results.slice(0, 5), summary: null })
}

function buildContextlessPluralReply(locale: 'es' | 'en' | 'it') {
  if (locale === 'en') return 'I do not have an active property list to expand yet. Tell me city, budget, operation, or type of property and I will prepare options for you.'
  if (locale === 'it') return 'Non ho ancora una lista attiva di immobili da ampliar. Dimmi città, budget, operazione o tipologia e ti preparo opzioni.'
  return 'Todavía no tengo una lista activa de inmuebles para ampliarte. Dime ciudad, presupuesto, operación o tipo de inmueble y te preparo opciones.'
}

function buildBroadenedResultsReply(args: {
  locale: 'es' | 'en' | 'it'
  originalCriteria: ChatbotSearchCriteria
  broadenedCriteria: ChatbotSearchCriteria
  results: StoredPropertyResult[]
}) {
  const { locale, originalCriteria, broadenedCriteria, results } = args
  const target = buildSearchSummary(originalCriteria, locale) || (locale === 'en' ? 'your search' : locale === 'it' ? 'la tua ricerca' : 'tu búsqueda')
  const broadened = buildSearchSummary(broadenedCriteria, locale) || (locale === 'en' ? 'a broader search' : locale === 'it' ? 'una ricerca più ampia' : 'una búsqueda más amplia')
  const list = results.map((item, index) => `${index + 1}. ${formatPropertyLine(item, locale)}`).join('\n')

  if (locale === 'en') {
    return `I did not find an exact match for ${target}, so I broadened the search to ${broadened}. These are the closest real options I can confirm now:\n${list}\nIf you want, I can help you compare them, show one in detail, or keep widening the search.`
  }
  if (locale === 'it') {
    return `Non ho trovato una corrispondenza esatta per ${target}, quindi ho ampliato la ricerca a ${broadened}. Queste sono le opzioni reali più vicine che posso confermare adesso:\n${list}\nSe vuoi, posso confrontarle, mostrarti i dettagli di una o continuare ad ampliare la ricerca.`
  }
  return `No encontré una coincidencia exacta para ${target}, así que amplié la búsqueda a ${broadened}. Estas son las opciones reales más cercanas que puedo confirmarte ahora mismo:\n${list}\nSi quieres, puedo compararlas, enseñarte una en detalle o seguir ampliando la búsqueda.`
}

function buildSearchSummary(criteria: ChatbotSearchCriteria, locale: 'es' | 'en' | 'it') {
  const parts: string[] = []
  const operation = criteria.operation === 'rent'
    ? (locale === 'en' ? 'for rent' : locale === 'it' ? 'in affitto' : 'en alquiler')
    : criteria.operation === 'sale'
      ? (locale === 'en' ? 'for sale' : locale === 'it' ? 'in vendita' : 'en venta')
      : null

  if (criteria.property_type) parts.push(criteria.property_type)
  if (operation) parts.push(operation)

  if (criteria.subzone && criteria.city) {
    parts.push(locale === 'en' ? `in ${criteria.subzone}, ${criteria.city}` : locale === 'it' ? `a ${criteria.subzone}, ${criteria.city}` : `en ${criteria.subzone}, ${criteria.city}`)
  } else if (criteria.city) {
    parts.push(locale === 'en' ? `in ${criteria.city}` : locale === 'it' ? `a ${criteria.city}` : `en ${criteria.city}`)
  } else if (criteria.search_area) {
    parts.push(locale === 'en' ? `around ${criteria.search_area}` : locale === 'it' ? `intorno a ${criteria.search_area}` : `por ${criteria.search_area}`)
  }

  return parts.join(' ').trim() || null
}

function isUsableLocationFragment(value: string | null | undefined) {
  if (!value) return false
  const normalized = normalizeChatText(value)
  if (normalized.length < 2) return false
  return !/(quiero|urge|urgent|urgente|comprar|buy|alquilar|rent|revisa|review|hazlo|please|por favor|mi|my|per me)/.test(normalized)
}

function buildSemanticCriteriaPatch(args: {
  semantic: Awaited<ReturnType<typeof generateSemanticInterpretation>>['result']
  currentCriteria: ChatbotSearchCriteria
  currentTextPatch: ChatbotSearchCriteria
}) {
  const patch: ChatbotSearchCriteria = { ...args.currentTextPatch }

  if (args.semantic.accepted_previous_suggestion || args.semantic.wants_broaden_search) {
    if (!isUsableLocationFragment(args.semantic.location.city)) patch.city = args.currentCriteria.city
    if (!isUsableLocationFragment(args.semantic.location.zone)) {
      patch.search_area = undefined
      patch.subzone = undefined
    }
  }

  if (!patch.operation && args.semantic.transaction_type !== 'unknown') {
    patch.operation = args.semantic.transaction_type
  }

  if (!patch.city && isUsableLocationFragment(args.semantic.location.city)) {
    patch.city = args.semantic.location.city || undefined
  }

  if (!patch.subzone && args.semantic.location.relationship === 'center') {
    patch.subzone = args.semantic.language === 'en' ? 'the center' : args.semantic.language === 'it' ? 'il centro' : 'el centro'
  }

  if (!patch.search_area && isUsableLocationFragment(args.semantic.location.zone)) {
    patch.search_area = args.semantic.location.zone || undefined
  }

  if (patch.search_area && !patch.city && args.currentCriteria.city) {
    patch.city = args.currentCriteria.city
  }

  if (patch.budget_min === undefined && args.semantic.budget.min != null) {
    patch.budget_min = args.semantic.budget.min
  }

  if (patch.budget_max === undefined && args.semantic.budget.max != null) {
    patch.budget_max = args.semantic.budget.max
  }

  if (patch.rooms_min === undefined && args.semantic.bedrooms.min != null) {
    patch.rooms_min = args.semantic.bedrooms.min
    patch.rooms = patch.rooms ?? args.semantic.bedrooms.min
    patch.rooms_comparator = patch.rooms_comparator ?? 'min'
  }

  return patch
}

function propertyMatchesSearchCriteria(
  property: StoredPropertyResult,
  criteria: ChatbotSearchCriteria
) {
  if (criteria.operation && !propertyMatchesOperation(property.deal_type, criteria.operation)) return false
  if (criteria.property_type && property.property_type !== criteria.property_type) return false
  if (criteria.city && property.city !== criteria.city) return false
  if (criteria.search_area) {
    const haystack = normalizeChatText(`${property.city || ''} ${property.address || ''} ${property.title || ''}`)
    if (!haystack.includes(normalizeChatText(criteria.search_area))) return false
  }
  if (criteria.budget_max && property.price && property.price > criteria.budget_max) return false
  if (criteria.rooms && (property.rooms || 0) < criteria.rooms) return false
  return true
}

function buildBroadenedSearchCriteria(criteria: ChatbotSearchCriteria, mode: 'location' | 'property_type'): ChatbotSearchCriteria {
  if (mode === 'location') {
    return {
      ...criteria,
      search_area: undefined,
      subzone: undefined,
      location_scope: criteria.city ? 'exact' : criteria.location_scope,
      landmark: undefined,
      landmarks: undefined,
      spatial_relation: undefined,
      spatial_relations: undefined,
      location_clauses: undefined,
    }
  }

  return {
    ...criteria,
    property_type: undefined,
    property_label: undefined,
  }
}

function filterPropertiesForCriteria(
  properties: Array<{ id: string; title: string; city: string | null; address: string | null; property_type: string | null; deal_type: string | null; price: number | null; rooms: number | null; status: string | null }>,
  criteria: ChatbotSearchCriteria
) {
  return rankPropertyMatches(criteria, properties).filter((property) => {
    if (criteria.operation && !propertyMatchesOperation(property.deal_type, criteria.operation)) return false
    if (criteria.city && property.city !== criteria.city) return false
    if (criteria.search_area) {
      const haystack = normalizeChatText(`${property.city || ''} ${property.address || ''} ${property.title || ''}`)
      if (!haystack.includes(normalizeChatText(criteria.search_area))) return false
    }
    if (criteria.property_type && property.property_type !== criteria.property_type) return false
    if (criteria.budget_max && property.price && property.price > criteria.budget_max) return false
    if (criteria.rooms && (property.rooms || 0) < criteria.rooms) return false
    return true
  })
}

function resolveSelectionFromSemantic(
  selection: Awaited<ReturnType<typeof generateSemanticInterpretation>>['result']['selection'],
  results: StoredPropertyResult[]
) {
  if (selection.type === 'ordinal' && typeof selection.value === 'number') {
    return results[selection.value - 1] || null
  }

  if (selection.type === 'attribute' && selection.value === 'cheapest') {
    return results.filter((item) => item.price != null).sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER))[0] || null
  }

  if (selection.type === 'attribute' && selection.value === 'largest') {
    return results.filter((item) => item.rooms != null).sort((a, b) => (b.rooms ?? 0) - (a.rooms ?? 0))[0] || null
  }

  if (selection.type === 'name' && typeof selection.value === 'string') {
    const normalizedValue = normalizeChatText(selection.value)
    return results.find((item) => normalizeChatText(`${item.title} ${item.address || ''} ${item.city || ''}`).includes(normalizedValue)) || null
  }

  return null
}

function formatSlotTimes(slots: Array<{ time: string }>) {
  return slots.map((slot) => slot.time).join(', ')
}

function formatDateForReply(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

type RelativeSchedulePreference = 'before_noon' | 'after_noon' | 'later' | 'earlier' | null

function detectRelativeSchedulePreference(text: string): RelativeSchedulePreference {
  const normalized = normalizeChatText(text)
  if (/antes del medio dia|antes de mediodia|antes del mediodia|mas temprano|más temprano|un poco mas temprano|un poco más temprano/.test(normalized)) {
    return 'before_noon'
  }
  if (/despues del medio dia|después del medio día|despues de mediodia|después de mediodía/.test(normalized)) {
    return 'after_noon'
  }
  if (/un poco mas tarde|un poco más tarde|mas tarde|más tarde/.test(normalized)) {
    return 'later'
  }
  if (/un poco mas temprano|un poco más temprano|mas temprano|más temprano/.test(normalized)) {
    return 'earlier'
  }
  return null
}

function getSlotMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function getReferenceMinutesFromSlots(slots: Array<{ time: string }>) {
  if (!slots.length) return null
  const minutes = slots.map((slot) => getSlotMinutes(slot.time)).sort((a, b) => a - b)
  return minutes[Math.floor((minutes.length - 1) / 2)]
}

function filterSlotsByRelativePreference(
  slots: Array<{ start: string; end: string; label: string; date: string; time: string }>,
  preference: RelativeSchedulePreference
) {
  if (!preference) return slots

  if (preference === 'before_noon') {
    return slots.filter((slot) => getSlotMinutes(slot.time) < 12 * 60)
  }
  if (preference === 'after_noon') {
    return slots.filter((slot) => getSlotMinutes(slot.time) >= 12 * 60)
  }

  const referenceMinutes = getReferenceMinutesFromSlots(slots)
  if (referenceMinutes === null) return slots

  if (preference === 'later') {
    return slots.filter((slot) => getSlotMinutes(slot.time) > referenceMinutes)
  }

  return slots.filter((slot) => getSlotMinutes(slot.time) < referenceMinutes)
}

function buildSchedulingFailureReply(locale: string, requestedDate?: Date | null) {
  const dateLabel = requestedDate ? formatDateForReply(requestedDate) : null
  if (locale === 'en') {
    return dateLabel
      ? `I could not read the calendar availability for ${dateLabel} right now. Try again in a moment and I will check that day again.`
      : 'I could not read calendar availability right now. Try again in a moment and I will check it for you.'
  }
  if (locale === 'it') {
    return dateLabel
      ? `No pude leer ahora mismo la disponibilidad del calendario para el ${dateLabel}. Vuelve a intentarlo en un momento y lo reviso otra vez.`
      : 'No pude leer ahora mismo la disponibilidad del calendario. Vuelve a intentarlo en un momento y lo reviso otra vez.'
  }
  return dateLabel
    ? `No pude leer ahora mismo la disponibilidad del calendario para el ${dateLabel}. Vuelve a intentarlo en un momento y lo reviso otra vez.`
    : 'No pude leer ahora mismo la disponibilidad del calendario. Vuelve a intentarlo en un momento y lo reviso otra vez.'
}

function buildAnchoredAdminSafeReply(args: {
  text: string
  locale: string
  anchoredRoute: string | null
}) {
  if (args.anchoredRoute !== '/admin') return null

  const anchoredEntry = getAppKnowledgeByRoute('/admin')
  if (!anchoredEntry) return null

  if (detectAdminStepByStepQuestion(args.text)) {
    return buildAdminStepByStepReply(anchoredEntry, args.locale).text
  }

  if (detectAdminDailyUseQuestion(args.text)) {
    return buildAdminDailyUseReply(anchoredEntry, args.locale).text
  }

  if (detectAdminVisibleDataQuestion(args.text)) {
    return buildAdminVisibleDataReply(args.locale, anchoredEntry).text
  }

  if (detectAdminKnownScreenQuestion(args.text)) {
    return buildAdminKnownScreenReply(anchoredEntry, args.locale).text
  }

  return buildAdminSupportReply(args.locale, anchoredEntry).text
}

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  let requestText = ''
  let requestLocale: 'es' | 'en' | 'it' = 'es'
  let requestScreenPath: string | null = null
  let requestUserRole: string | null = null

  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const body = await req.json()
    const { text, session_id, conversation_id: requestConversationId, visitor_name, visitor_email, tenant_slug: rawTenantSlug, slug, locale: userLocale, channel: rawChannel, screen_path, user_role } = body
    requestText = typeof text === 'string' ? text : ''
    requestScreenPath = typeof screen_path === 'string' ? screen_path : null
    requestUserRole = typeof user_role === 'string' ? user_role : null
    const tenant_slug = rawTenantSlug || slug || null
    const activeLocale = userLocale === 'en' ? 'en' : userLocale === 'it' ? 'it' : 'es'
    requestLocale = activeLocale
    const activeChannel = rawChannel === 'whatsapp' ? 'whatsapp' : rawChannel === 'email' ? 'email' : rawChannel === 'admin' ? 'admin' : 'dashboard'
    const isAdminChannel = activeChannel === 'admin'
    const currentScreenKnowledge = getAppKnowledgeByPath(requestScreenPath)

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    // Find tenant
    let tenantId: string | null = null
    if (tenant_slug) {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenant_slug)
        .single()
      if (tenant) tenantId = tenant.id
      if (!tenantId && tenantError) {
        tenantId = await resolveTenantIdWithFallback(tenant_slug)
      }
    }

    if (!tenantId && !session_id) {
      return NextResponse.json({ error: 'tenant_slug is required for new chatbot sessions' }, { status: 400 })
    }

    // Find or create session
    const sessionId = session_id || generateSessionId()
    let conversationId: string | null = typeof requestConversationId === 'string' ? requestConversationId : null

    if (!conversationId && session_id) {
      let existingConversationQuery = supabase
        .from('conversations')
        .select('id, metadata')
        .eq('channel', 'chatbot')

      existingConversationQuery = tenantId
        ? existingConversationQuery.eq('tenant_id', tenantId)
        : existingConversationQuery.is('tenant_id', null)

      const { data: existingConvs } = await existingConversationQuery

      conversationId = findConversationBySession(sessionId, existingConvs || [])
    }

    let isNewConversation = false
    if (!conversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          subject: visitor_name ? `Chat: ${visitor_name}` : 'Chatbot conversation',
          channel: 'chatbot',
          status: 'open',
          metadata: {
            chatbot_session_id: sessionId,
            chatbot_source: 'web_widget',
            chatbot_visitor_name: visitor_name || null,
            chatbot_visitor_email: visitor_email || null,
          },
        })
        .select()
        .single()

      if (convError) {
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }

      conversationId = newConv.id
      isNewConversation = true
    }

    if (requestConversationId) {
      const { data: requestedConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', requestConversationId)
        .eq('tenant_id', tenantId)
        .eq('channel', 'chatbot')
        .single()

      if (!requestedConversation) {
        return NextResponse.json({ error: 'conversation_id is invalid for chatbot' }, { status: 400 })
      }
    }

    const { data: existingConversation } = await supabase
        .from('conversations')
        .select('lead_id, metadata')
        .eq('id', conversationId)
        .single()

    const existingMeta = (existingConversation?.metadata || {}) as Record<string, unknown>
    const currentCriteria = (existingMeta.chatbot_context || {}) as Record<string, unknown>
    const currentDialogueState = ((existingMeta.chatbot_dialogue_state || {}) as ChatbotDialogueState)
    const currentLastBotMessage = typeof currentDialogueState.last_bot_text === 'string' ? currentDialogueState.last_bot_text : null
    const currentActiveFocus = (existingMeta.chatbot_active_focus || null) as string | null
    const currentEscalationState = existingMeta.escalation as { status?: string } | undefined
    const currentPropertyResults = readStoredPropertyResults(existingMeta)
    const currentAdminKnownRoute = typeof existingMeta.chatbot_admin_known_route === 'string'
      ? existingMeta.chatbot_admin_known_route
      : null
    const currentSelectedProperty = (existingMeta.chatbot_selected_property || null) as { id: string; title: string; city: string | null; address: string | null; property_type: string | null; deal_type: string | null; price: number | null; rooms: number | null } | null
    const { data: activeProperties } = await supabase
      .from('properties')
      .select('id, title, city, address, property_type, deal_type, price, rooms, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .limit(200)

    const normalizedActiveProperties = (activeProperties || []).map((property) => ({
      id: property.id,
      title: property.title,
      city: property.city,
      address: property.address,
      property_type: property.property_type,
      deal_type: property.deal_type,
      price: property.price,
      rooms: property.rooms,
      status: property.status,
    }))
    const semanticTurn = isAdminChannel
      ? null
      : await generateSemanticInterpretation({
          text,
          locale: activeLocale,
          currentCriteria: currentCriteria as ChatbotSearchCriteria,
          currentActiveFocus,
          currentSelectedProperty: currentSelectedProperty ? { id: currentSelectedProperty.id, title: currentSelectedProperty.title } : null,
          previousBotMessage: currentLastBotMessage,
          currentResults: currentPropertyResults.map((property) => ({
            id: property.id,
            title: property.title,
            city: property.city,
            deal_type: property.deal_type,
            price: property.price,
          })),
        })
    const propertyReference = isAdminChannel ? { requested: false, match: null, candidate: null } : resolveConcretePropertyReference(text, activeProperties || [])
    const concreteFollowUp = !isAdminChannel && !propertyReference.requested && currentActiveFocus === 'property_reference' && !!currentSelectedProperty && isConcretePropertyFollowUp(text)
    const propertyTurn = concreteFollowUp
      ? { act: 'FOLLOW_UP' as const, patch: {}, missing: null as null }
      : interpretPropertyTurn(text, activeLocale, currentCriteria as never, currentDialogueState)
    const semanticCriteriaPatch = semanticTurn
      ? buildSemanticCriteriaPatch({
          semantic: semanticTurn.result,
          currentCriteria: (currentCriteria || {}) as ChatbotSearchCriteria,
          currentTextPatch: propertyTurn.patch,
        })
      : propertyTurn.patch
    const incomingCriteria = (propertyReference.requested || concreteFollowUp) ? {} : semanticCriteriaPatch
    const mergedCriteria = (propertyReference.requested || concreteFollowUp) ? (currentCriteria as never) : mergePropertyState(currentCriteria as never, incomingCriteria, propertyTurn.act)
    const compatibleStoredResults = currentPropertyResults.filter((property) => propertyMatchesSearchCriteria(property, mergedCriteria))
    const semanticResult = semanticTurn?.result || null
    const catalogBrowseIntent = detectCatalogBrowseIntent(text) || semanticTurn?.result.intent === 'property_search'
    const pluralResultsIntent = detectPluralResultsIntent(text)
      || Boolean(semanticTurn?.result.list_mode && semanticTurn.result.selection.type === 'none' && semanticTurn.result.intent !== 'property_detail')
      || Boolean(semanticResult?.wants_list)
    const comparisonIntent = detectComparisonIntent(text) || semanticTurn?.result.intent === 'compare'
    const recommendationIntent = detectRecommendationIntent(text) || semanticTurn?.result.intent === 'recommendation' || Boolean(semanticResult?.wants_recommendation)
    const resultSubsetCount = extractResultSubsetCount(text)
    const requestedResultSet = selectResultsSubset(compatibleStoredResults, resultSubsetCount)
    const selectedFromStoredResults = resolveSelectionFromSemantic(semanticTurn?.result.selection || { type: 'none', value: null }, compatibleStoredResults)
      || resolveSelectionFromResults(text, compatibleStoredResults)
    const currentSelectedPropertyCompatible = currentSelectedProperty && propertyMatchesSearchCriteria(currentSelectedProperty, mergedCriteria)
      ? currentSelectedProperty
      : null
    const selectedPropertyForTurn = isAdminChannel
      ? null
      : (propertyReference.match
        || selectedFromStoredResults
        || ((!pluralResultsIntent && !comparisonIntent && !resultSubsetCount && currentSelectedPropertyCompatible && (isResultQuestion(text) || concreteFollowUp)) ? currentSelectedPropertyCompatible : null))
    const buyerPurchaseIntent = !isAdminChannel && detectBuyerPurchaseIntent(text)
    const contextualAcceptance = detectSearchAcceptanceIntent(text)
      && Boolean(currentLastBotMessage || currentPropertyResults.length || currentSelectedProperty)
    const userAcceptedReview = Boolean(contextualAcceptance || (semanticResult?.accepted_previous_suggestion && semanticResult?.is_followup) || semanticResult?.wants_broaden_search)
    const matchedFromLastResults = Boolean(selectedFromStoredResults || (compatibleStoredResults.length > 0 && currentPropertyResults.length > 0 && (pluralResultsIntent || comparisonIntent || recommendationIntent)))
    const humanHandoffAccepted = detectHumanHandoffAffirmation(text)
      && (currentActiveFocus === 'human_handoff' || currentDialogueState.active_flow === 'human_handoff' || currentEscalationState?.status === 'pending')
    const humanHandoffRequested = detectHumanContactIntent(text) || humanHandoffAccepted || semanticTurn?.result.intent === 'human_handoff'
    const turnInterpretation = {
      raw_text: text,
      locale: activeLocale,
      normalized_text: text,
      conversation_act: propertyTurn.act,
      signal_classes: [],
      entity_mentions: [],
      extracted_criteria: incomingCriteria,
    }
    const dialogueAct = propertyTurn.act === 'SEARCH_REQUEST' ? 'new_search'
      : propertyTurn.act === 'CORRECTION' ? 'correction'
      : propertyTurn.act === 'ADD_CONSTRAINT' ? 'add_constraint'
      : propertyTurn.act === 'REFORMULATION' ? 'reformulation'
      : propertyTurn.act === 'HARD_RESET' ? 'restart'
      : propertyTurn.act === 'ANSWER_TO_PENDING_QUESTION' ? 'answer_pending'
      : propertyTurn.act === 'FOLLOW_UP' ? 'short_follow_up'
      : propertyTurn.act === 'RESTART' ? 'restart'
      : 'fallback'
    const conversationMetaState: Record<string, unknown> = {
      ...existingMeta,
      chatbot_context: mergedCriteria,
      chatbot_dialogue_state: currentDialogueState,
      chatbot_last_property_results: compatibleStoredResults,
      chatbot_semantic_interpretation: semanticTurn?.result || null,
      chatbot_semantic_mode: semanticTurn?.mode || null,
      chatbot_semantic_source: semanticTurn?.source || null,
    }

    // Save inbound message
    const chatbotMeta: ChatbotMetadata = {
      chatbot_session_id: sessionId,
      chatbot_source: 'web_widget',
      chatbot_context: mergedCriteria,
      chatbot_dialogue_state: currentDialogueState,
      chatbot_turn_interpretation: turnInterpretation,
      reply_type: 'auto',
    }

    await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      direction: 'inbound',
      channel: 'chatbot',
      status: 'delivered',
      content: text,
      is_automated: false,
      metadata: chatbotMeta,
    })

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'chatbot.message.received',
      entity_type: 'conversation',
      entity_id: conversationId,
      payload: { session_id: sessionId, text_length: text.length },
    })

    if (isNewConversation) {
      await supabase.from('automation_events').insert({
        tenant_id: tenantId,
        event_type: 'chatbot.session.started',
        entity_type: 'conversation',
        entity_id: conversationId,
        payload: { session_id: sessionId, visitor_name: visitor_name || null },
      })
    }

    if (isAdminChannel) {
      const persistedAdminScreen = getAppKnowledgeByRoute(currentAdminKnownRoute)
      const pathAdminScreen = currentScreenKnowledge?.route === '/admin' ? currentScreenKnowledge : null
      const explicitAdminScreenSwitch = findExplicitAppKnowledgeSwitchMatch(text)
      const explicitAdminScreen = (persistedAdminScreen || pathAdminScreen)
        ? explicitAdminScreenSwitch
        : findExplicitAppKnowledgeMatch(text)
      const resolvedAdminScreen = persistedAdminScreen || pathAdminScreen
        ? (explicitAdminScreenSwitch || persistedAdminScreen || pathAdminScreen)
        : (explicitAdminScreen || null)
      const adminReply = humanHandoffRequested
        ? buildHumanContactReply(activeLocale)
        : detectLegalComplexIntent(text)
          ? buildLegalComplexReply(activeLocale)
          : resolvedAdminScreen && detectAdminStepByStepQuestion(text)
            ? buildAdminStepByStepReply(resolvedAdminScreen, activeLocale)
            : resolvedAdminScreen && detectAdminDailyUseQuestion(text)
              ? buildAdminDailyUseReply(resolvedAdminScreen, activeLocale)
          : detectAdminVisibleDataQuestion(text)
            ? buildAdminVisibleDataReply(activeLocale, resolvedAdminScreen)
            : resolvedAdminScreen && detectAdminKnownScreenQuestion(text)
              ? buildAdminKnownScreenReply(resolvedAdminScreen, activeLocale)
              : buildAdminSupportReply(activeLocale, resolvedAdminScreen)

      const appKnowledge = resolvedAdminScreen
        ? [resolvedAdminScreen]
        : currentScreenKnowledge
          ? [currentScreenKnowledge]
          : findRelevantAppKnowledge(text)

      const responseContext = buildResponseContext({
        locale: activeLocale,
        channel: activeChannel,
        tenantSlug: tenant_slug || null,
        screenPath: requestScreenPath,
        currentUserRole: requestUserRole,
        latestUserMessage: text,
        turnType: 'crm_support',
        modeResolved: humanHandoffRequested ? 'human_handoff' : 'crm_support',
        activeFocus: 'crm_support',
        state: null,
        selectedProperty: null,
        candidates: [],
        crmSupportRequested: true,
        humanRequested: humanHandoffRequested,
        sellerRequested: false,
        financingRequested: false,
        legalComplexityFlag: detectLegalComplexIntent(text),
        nextBestQuestion: null,
        inventoryContext: { available_cities: [], same_area_inventory_count: 0, no_match_reason: 'none' },
        responseGoal: humanHandoffRequested
          ? 'Confirm human handoff and keep the answer inside CRM admin support.'
          : resolvedAdminScreen && detectAdminKnownScreenQuestion(text)
            ? 'Explain the known admin screen naturally: what it is, what it is for, the main real actions, and offer to continue step by step.'
          : 'Resolve the admin CRM support question clearly, safely, and without property-search behavior.',
        app_knowledge: appKnowledge,
      })

      const shouldSkipAiForAnchoredScreen = !!resolvedAdminScreen
      const aiReply = shouldSkipAiForAnchoredScreen
        ? { text: adminReply.text, generation_mode: 'fallback' as const, source: 'anchored_admin_screen' }
        : await generateVisibleReplyWithAi({
            responseContext,
            fallbackText: adminReply.text,
          })
      const anchoredRoute = currentAdminKnownRoute || resolvedAdminScreen?.route || null
      const safeAnchoredReply = buildAnchoredAdminSafeReply({
        text,
        locale: activeLocale,
        anchoredRoute,
      })
      const replyText = sanitizeAnchoredAdminReply(
        sanitizeAdminFinalReply({
          replyText: aiReply.text,
          anchoredRoute,
          fallbackText: safeAnchoredReply || adminReply.text,
          text,
          locale: activeLocale,
          explicitSwitchRoute: explicitAdminScreenSwitch?.route || null,
        }),
        anchoredRoute,
        safeAnchoredReply || adminReply.text,
      )
      const replyType = adminReply.replyType
      const replySource = aiReply.generation_mode === 'ai' ? `ai:${aiReply.source}` : `admin_support:${aiReply.source}`
      const adminDialogueState = buildNextDialogueState({
        previousState: currentDialogueState,
        mergedCriteria: {},
        activeFlow: humanHandoffRequested ? 'human_handoff' : 'unknown',
        lastUserAct: 'fallback',
        replyType,
        replyText,
        matchesCount: 0,
        nextMissingField: null,
        userText: text,
      })

      const adminConversationMeta = {
        ...existingMeta,
        chatbot_context: {},
        chatbot_selected_property: null,
        chatbot_active_focus: 'crm_support',
        chatbot_admin_known_route: anchoredRoute,
        chatbot_dialogue_state: adminDialogueState,
        chatbot_generation_mode: aiReply.generation_mode,
        chatbot_response_context: responseContext,
      }

      await supabase
        .from('conversations')
        .update({ metadata: adminConversationMeta })
        .eq('id', conversationId)

      await supabase.from('conversation_messages').insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        direction: 'outbound',
        channel: 'chatbot',
        status: 'sent',
        content: replyText,
        is_automated: true,
        metadata: {
          chatbot_session_id: sessionId,
          chatbot_reply_type: replyType,
          chatbot_reply_source: replySource,
          chatbot_dialogue_state: adminDialogueState,
          chatbot_response_context: responseContext,
          chatbot_generation_mode: aiReply.generation_mode,
           chatbot_admin_known_route: anchoredRoute,
          chatbot_context: {},
          reply_type: 'auto',
          intent: 'general_question',
          decision: 'suggest_auto_reply',
          confidence: 1,
        },
      })

      await supabase.from('automation_events').insert({
        tenant_id: tenantId,
        event_type: 'chatbot.reply.generated',
        entity_type: 'conversation',
        entity_id: conversationId,
        payload: { session_id: sessionId, reply_type: replyType, source: replySource, mode: 'admin_support' },
      })

      await supabase.from('automation_events').insert({
        tenant_id: tenantId,
        event_type: 'chatbot.reply.sent',
        entity_type: 'conversation',
        entity_id: conversationId,
        payload: { session_id: sessionId, reply_type: replyType, mode: 'admin_support' },
      })

      return NextResponse.json({
        session_id: sessionId,
        conversation_id: conversationId,
        reply: replyText,
        reply_type: replyType,
        reply_source: replySource,
        intent: 'general_question',
        decision: 'suggest_auto_reply',
        confidence: 1,
      })
    }

    // Classify intent and decide
    const baseClassification = classifyIntent(text)
    let intent = baseClassification.intent.intent as IntentType
    let decision = baseClassification.decision.decision as DecisionType
    let confidence = baseClassification.intent.confidence

    if (isAdminChannel) {
      intent = 'general_question'
      decision = 'suggest_auto_reply'
      confidence = Math.max(confidence, 0.95)
    }

    // Read conversation metadata early for context detection
    const conversationMetaEarly = (existingMeta || {}) as Record<string, unknown>
    const hasAppointmentContext = !!(conversationMetaEarly.chatbot_pending_slot || (conversationMetaEarly.chatbot_suggested_slots as Array<unknown> | undefined)?.length)
    const storedAppointmentDate = typeof conversationMetaEarly.chatbot_active_appointment_date === 'string'
      ? conversationMetaEarly.chatbot_active_appointment_date
      : null
    const exactRequestedAppointmentSlot = parseExactAppointmentDateTime(text)
    const explicitRequestedAppointmentDate = parseAppointmentDateReference(text)
    const requestedAppointmentDate = explicitRequestedAppointmentDate || (storedAppointmentDate ? new Date(`${storedAppointmentDate}T12:00:00.000Z`) : null)
    const naturalRequestedTime = extractTimeFromNaturalResponse(text)
    const derivedRequestedAppointmentSlot = !exactRequestedAppointmentSlot && requestedAppointmentDate && naturalRequestedTime
      ? buildSlotFromDateAndTime(requestedAppointmentDate, naturalRequestedTime)
      : null
    const resolvedRequestedAppointmentSlot = exactRequestedAppointmentSlot || derivedRequestedAppointmentSlot
    const appointmentAvailabilityIntent = detectAppointmentAvailabilityIntent(text)
    const firstFreeSlotIntent = detectFirstFreeSlotIntent(text)
    const appointmentBookingIntent = detectAppointmentBookingIntent(text)
    const relativeSchedulePreference = detectRelativeSchedulePreference(text)
    const strongAppointmentIntent = baseClassification.intent.intent === 'appointment_request'
      || hasAppointmentContext
      || currentActiveFocus === 'appointment'
      || !!resolvedRequestedAppointmentSlot
      || !!relativeSchedulePreference
      || semanticTurn?.result.intent === 'schedule_visit'
      || (!!requestedAppointmentDate && (appointmentAvailabilityIntent || firstFreeSlotIntent || appointmentBookingIntent))

    // Chatbot-specific context-aware override for property search conversations
    if (strongAppointmentIntent) {
      intent = 'appointment_request'
      confidence = Math.max(confidence, 0.93)
      decision = 'suggest_appointment'
    } else if (!hasAppointmentContext && (propertyReference.requested || concreteFollowUp)) {
      intent = 'property_interest'
      confidence = Math.max(confidence, 0.95)
      decision = 'suggest_auto_reply'
    } else if (!hasAppointmentContext && selectedFromStoredResults) {
      intent = 'property_interest'
      confidence = Math.max(confidence, 0.94)
      decision = 'suggest_auto_reply'
    } else if (!hasAppointmentContext && humanHandoffRequested) {
      intent = 'human_help'
      confidence = Math.max(confidence, 0.92)
      decision = 'require_human'
    } else if (!hasAppointmentContext && buyerPurchaseIntent) {
      intent = 'property_interest'
      confidence = Math.max(confidence, 0.9)
      decision = selectedPropertyForTurn || hasPropertySearchContext(mergedCriteria) ? 'suggest_auto_reply' : 'request_more_info'
    } else if (!hasAppointmentContext && (semanticTurn?.result.intent === 'compare' || semanticTurn?.result.intent === 'recommendation' || semanticTurn?.result.intent === 'property_detail')) {
      intent = 'property_interest'
      confidence = Math.max(confidence, 0.9)
      decision = 'suggest_auto_reply'
    } else if (!hasAppointmentContext && detectLegalComplexIntent(text)) {
      intent = 'general_question'
      confidence = Math.max(confidence, 0.88)
      decision = 'require_human'
    } else if (!hasAppointmentContext && detectFinancingIntent(text)) {
      intent = 'general_question'
      confidence = Math.max(confidence, 0.86)
      decision = 'suggest_auto_reply'
    } else if (!hasAppointmentContext && detectCrmSupportIntent(text)) {
      intent = 'general_question'
      confidence = Math.max(confidence, 0.9)
      decision = 'suggest_auto_reply'
    } else if (!hasAppointmentContext && detectSellerIntent(text)) {
      intent = 'general_question'
      confidence = Math.max(confidence, 0.9)
      decision = 'suggest_auto_reply'
    } else if (!hasAppointmentContext && hasPropertySearchContext(mergedCriteria)) {
      intent = 'property_interest'
      confidence = Math.max(confidence, 0.72)
      decision = decidePropertyFlow(mergedCriteria).missing ? 'request_more_info' : 'suggest_auto_reply'
    }

    // Generate reply based on decision
    let replyText = ''
    let replyType = 'fallback'
    let replySource = 'bot'
    let propertyMatchCount = 0
    let selectedPropertyFacts = selectedPropertyForTurn
    let candidatePropertiesSummary: Array<{ id: string; title: string; city: string | null; address: string | null; property_type: string | null; deal_type: string | null; price: number | null; rooms: number | null; status?: string | null }> = []
    let inventoryContext: { available_cities: string[]; same_area_inventory_count: number; no_match_reason: 'no_inventory_in_area' | 'inventory_in_area_but_no_match' | 'missing_user_data' | 'none' } = { available_cities: [], same_area_inventory_count: 0, no_match_reason: 'none' }

      if (!isAdminChannel && compatibleStoredResults.length > 0 && (pluralResultsIntent || comparisonIntent || recommendationIntent || (!!resultSubsetCount && !selectedFromStoredResults)) && !propertyReference.requested && !buyerPurchaseIntent) {
      candidatePropertiesSummary = requestedResultSet
      propertyMatchCount = requestedResultSet.length
      if (comparisonIntent) {
        replyText = buildPropertyComparisonReply({ locale: activeLocale, results: requestedResultSet })
        replyType = 'auto_reply'
        replySource = 'property_results_comparison'
      } else if (recommendationIntent && requestedResultSet.length > 0) {
        replyText = buildRecommendationReply({ locale: activeLocale, property: requestedResultSet[0] })
        replyType = 'auto_reply'
        replySource = 'property_results_recommendation'
        selectedPropertyFacts = requestedResultSet[0]
      } else {
        replyText = buildPropertyResultsListReply({ locale: activeLocale, results: requestedResultSet, summary: null })
        replyType = 'auto_reply'
        replySource = 'property_results_plural_followup'
      }
    } else if (intent === 'property_interest' && (propertyReference.requested || concreteFollowUp || selectedPropertyForTurn || hasPropertySearchContext(mergedCriteria))) {
      const baseProperties = normalizedActiveProperties
      inventoryContext.available_cities = [...new Set(baseProperties.map((property) => property.city).filter(Boolean) as string[])]
      if (propertyReference.requested || concreteFollowUp || selectedPropertyForTurn) {
        replyText = buildConcretePropertyReply({
          property: selectedPropertyForTurn,
          candidate: propertyReference.candidate,
          locale: activeLocale,
          text,
        })
        replyType = 'auto_reply'
        replySource = selectedPropertyForTurn ? 'chatbot_property_reference' : 'chatbot_property_reference_not_found'
        candidatePropertiesSummary = compatibleStoredResults
        propertyMatchCount = compatibleStoredResults.length
      } else {
        const sameAreaInventory = mergedCriteria.city
          ? baseProperties.filter((property) => property.city === mergedCriteria.city)
          : mergedCriteria.search_area
          ? baseProperties.filter((property) => property.city && property.city.toLowerCase().includes((mergedCriteria.search_area || '').toLowerCase()))
          : baseProperties
        inventoryContext.same_area_inventory_count = sameAreaInventory.length
        const filteredMatches = filterPropertiesForCriteria(baseProperties, mergedCriteria)
        const locationBroadenedCriteria = buildBroadenedSearchCriteria(mergedCriteria, 'location')
        const propertyTypeBroadenedCriteria = buildBroadenedSearchCriteria(locationBroadenedCriteria, 'property_type')
        const locationBroadenedMatches = filterPropertiesForCriteria(baseProperties, locationBroadenedCriteria)
        const propertyTypeBroadenedMatches = filterPropertiesForCriteria(baseProperties, propertyTypeBroadenedCriteria)
        const broaderMatches = filteredMatches.length > 0
          ? filteredMatches
          : locationBroadenedMatches.length > 0
            ? locationBroadenedMatches
            : propertyTypeBroadenedMatches
        const canBroadenWithRealAction = filteredMatches.length === 0 && (userAcceptedReview || Boolean(semanticResult?.is_followup))
        candidatePropertiesSummary = filteredMatches
        propertyMatchCount = filteredMatches.length
        const flow = decidePropertyFlow(mergedCriteria)
        const hasStrongConstraints = Boolean(
          mergedCriteria.property_type ||
          mergedCriteria.rooms ||
          mergedCriteria.rooms_min ||
          mergedCriteria.bathrooms ||
          mergedCriteria.bathrooms_min ||
          mergedCriteria.budget_max ||
          mergedCriteria.logistic_attributes?.length ||
          mergedCriteria.attributes?.length ||
          mergedCriteria.subzone ||
          mergedCriteria.location_clauses?.length
        )
        if (sameAreaInventory.length === 0 && (mergedCriteria.city || mergedCriteria.search_area)) inventoryContext.no_match_reason = 'no_inventory_in_area'
        else if (flow.missing && !hasStrongConstraints) inventoryContext.no_match_reason = 'missing_user_data'
        else if (filteredMatches.length === 0 && sameAreaInventory.length > 0) inventoryContext.no_match_reason = 'inventory_in_area_but_no_match'
        else if (flow.missing) inventoryContext.no_match_reason = 'missing_user_data'

        if (flow.missing) {
          candidatePropertiesSummary = []
          propertyMatchCount = 0
          replyText = buildPropertyReply({
            state: mergedCriteria,
            previous: currentCriteria as never,
            act: propertyTurn.act,
            missing: flow.missing,
            matches: filteredMatches.map((property) => ({ title: property.title, address: property.address, price: property.price, city: property.city })),
            locale: activeLocale,
            text,
          })
          replyType = 'auto_reply'
          replySource = 'chatbot_property_context_missing'
        } else if (canBroadenWithRealAction && broaderMatches.length > 0) {
          candidatePropertiesSummary = broaderMatches
          propertyMatchCount = broaderMatches.length
          const broadenedCriteriaForReply = locationBroadenedMatches.length > 0 ? locationBroadenedCriteria : propertyTypeBroadenedCriteria
          replyText = buildBroadenedResultsReply({
            locale: activeLocale,
            originalCriteria: mergedCriteria,
            broadenedCriteria: broadenedCriteriaForReply,
            results: broaderMatches.slice(0, 10),
          })
          replyType = 'auto_reply'
          replySource = locationBroadenedMatches.length > 0
            ? 'chatbot_property_broadened_location_results'
            : 'chatbot_property_broadened_property_results'
        } else if (filteredMatches.length > 1) {
          replyText = buildPropertyResultsListReply({
            locale: activeLocale,
            results: filteredMatches.slice(0, 10),
            summary: buildSearchSummary(mergedCriteria, activeLocale),
          })
          replyType = 'auto_reply'
          replySource = 'chatbot_property_results_list'
        } else if (filteredMatches.length === 1) {
          const singleProperty = filteredMatches[0]
          selectedPropertyFacts = singleProperty
          replyText = buildConcretePropertyReply({
            property: singleProperty,
            candidate: singleProperty.title,
            locale: activeLocale,
            text: `${text} detalles`,
          })
          replyType = 'auto_reply'
          replySource = 'chatbot_property_single_match'
        } else {
          candidatePropertiesSummary = broaderMatches
          propertyMatchCount = broaderMatches.length
          replyText = buildPropertyReply({
            state: mergedCriteria,
            previous: currentCriteria as never,
            act: propertyTurn.act,
            missing: flow.missing,
            matches: broaderMatches.map((property) => ({ title: property.title, address: property.address, price: property.price, city: property.city })),
            locale: activeLocale,
            text,
          })
          replyType = 'auto_reply'
          replySource = 'chatbot_property_no_match'
        }
      }
    } else if (decision === 'suggest_auto_reply' || decision === 'request_more_info') {
      if (!hasPropertySearchContext(mergedCriteria) && catalogBrowseIntent) {
        candidatePropertiesSummary = normalizedActiveProperties.slice(0, 10)
        propertyMatchCount = normalizedActiveProperties.length
        replyText = buildBrowseCatalogReply({ locale: activeLocale, results: normalizedActiveProperties.slice(0, 10) })
        replyType = 'auto_reply'
        replySource = 'property_catalog_browse'
      } else if (!hasPropertySearchContext(mergedCriteria) && (pluralResultsIntent || comparisonIntent || recommendationIntent || !!resultSubsetCount)) {
        replyText = buildContextlessPluralReply(activeLocale)
        replyType = 'auto_reply'
        replySource = 'property_plural_without_context'
      } else if (isAdminChannel || detectCrmSupportIntent(text)) {
        const crmReply = buildCrmSupportReply(activeLocale)
        replyText = crmReply.text
        replyType = crmReply.replyType
        replySource = 'crm_support'
      } else if (detectFinancingIntent(text)) {
        const financingReply = buildFinancingReply(activeLocale)
        replyText = financingReply.text
        replyType = financingReply.replyType
        replySource = 'financing_support'
      } else if (detectSellerIntent(text)) {
        const sellerReply = buildSellerHelpReply()
        replyText = sellerReply.text
        replyType = sellerReply.replyType
        replySource = 'seller_help'
      } else if (buyerPurchaseIntent) {
        replyText = buildBuyerPurchaseReply({
          locale: activeLocale,
          selectedPropertyTitle: selectedPropertyForTurn?.title || currentSelectedPropertyCompatible?.title || null,
          needsPropertyContext: !selectedPropertyForTurn && !currentSelectedPropertyCompatible,
        })
        replyType = 'auto_reply'
        replySource = !selectedPropertyForTurn && !currentSelectedPropertyCompatible
          ? 'buyer_purchase_missing_property'
          : 'buyer_purchase_next_step'
      } else {
      const autoReply = generateReply({ intent, decision, confidence, channel: 'chatbot' })
      if (autoReply) {
        replyText = autoReply.reply_text
        replyType = 'auto_reply'
        replySource = autoReply.template_id
      }
      }
    }

    if (decision === 'require_human') {
      const humanReply = detectLegalComplexIntent(text)
        ? buildLegalComplexReply(activeLocale)
        : humanHandoffRequested
        ? buildHumanContactReply(activeLocale)
        : { replyType: 'escalation' as const, text: 'Un agente de nuestro equipo te atenderá en breve. Gracias por tu paciencia.' }
      replyText = humanReply.text
      replyType = humanReply.replyType
      replySource = 'human_handoff'

      // Update conversation status
      await supabase
        .from('conversations')
        .update({
          status: 'waiting',
          metadata: {
            ...conversationMetaState,
            escalation: {
              status: 'pending',
              requested_at: new Date().toISOString(),
              requested_by: null,
              assigned_to: null,
              assigned_at: null,
              resolved_at: null,
              resolved_by: null,
              reason: 'Escalado desde chatbot',
            },
          },
        })
        .eq('id', conversationId)
      conversationMetaState.escalation = {
        status: 'pending',
        requested_at: new Date().toISOString(),
        requested_by: null,
        assigned_to: null,
        assigned_at: null,
        resolved_at: null,
        resolved_by: null,
        reason: 'Escalado desde chatbot',
      }

      await supabase.from('automation_events').insert({
        tenant_id: tenantId,
        event_type: 'chatbot.escalated',
        entity_type: 'conversation',
        entity_id: conversationId,
        payload: { session_id: sessionId, intent, decision },
      })
    }

    // Early check: natural confirmation of previously offered appointment alternatives
    // This must run BEFORE intent-based blocks because natural responses like "Vale a las 14:30"
    // may be classified as unknown/no_action but still be valid appointment confirmations
    if (hasAppointmentContext && isAppointmentConfirmation(text)) {
      const { data: tenantUsers } = await supabase
        .from('users')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1)

      const { data: existingAppointments } = await supabase
        .from('appointments')
        .select('start_time, end_time, status')
        .eq('tenant_id', tenantId)
        .gte('start_time', new Date().toISOString())

      const pendingSlot = conversationMetaEarly.chatbot_pending_slot as { start?: string; end?: string; label?: string } | undefined
      const suggestedSlots = conversationMetaEarly.chatbot_suggested_slots as Array<{ start: string; end: string; label: string; date: string; time: string }> | undefined
      const exactRequestedSlot = parseExactAppointmentDateTime(text)
      const naturalTime = extractTimeFromNaturalResponse(text)

      // Try to match against suggested slots first
      let matchedSlot = null
      let closestSuggestedSlot = null
      if (naturalTime && suggestedSlots?.length) {
        matchedSlot = matchTimeToSlot(naturalTime, suggestedSlots)
        if (!matchedSlot) {
          closestSuggestedSlot = findClosestSlotToTime(naturalTime, suggestedSlots)
        }
      }

      // Fall back to exact parsing or pending slot
      const requestedSlot = matchedSlot || exactRequestedSlot || (pendingSlot?.start && pendingSlot?.end && pendingSlot?.label
        ? {
            start: pendingSlot.start,
            end: pendingSlot.end,
            label: pendingSlot.label,
            date: pendingSlot.start.split('T')[0],
            time: pendingSlot.label.split('·')[1]?.trim() || '',
          }
        : null)

      if (requestedSlot) {
        const start = new Date(requestedSlot.start)
        const end = new Date(requestedSlot.end)
        const available = isSlotAvailable(existingAppointments || [], start, end)

        if (available) {
          const { data: appointment, error: appointmentError } = await supabase
            .from('appointments')
            .insert({
              tenant_id: tenantId,
              user_id: tenantUsers?.[0]?.id,
              title: 'Cita desde chatbot',
              appointment_type: 'visit',
              status: 'scheduled',
              start_time: requestedSlot.start,
              end_time: requestedSlot.end,
              notes: `Creada desde conversación ${conversationId}`,
            })
            .select()
            .single()

          if (!appointmentError && appointment) {
            await supabase
              .from('conversations')
              .update({
              metadata: {
                  ...conversationMetaState,
                  appointment_id: appointment.id,
                  appointment_created_at: new Date().toISOString(),
                  chatbot_pending_slot: null,
                  chatbot_suggested_slots: null,
                },
              })
              .eq('id', conversationId)
            conversationMetaState.appointment_id = appointment.id
            conversationMetaState.appointment_created_at = new Date().toISOString()
            conversationMetaState.chatbot_pending_slot = null
            conversationMetaState.chatbot_suggested_slots = null

            await supabase.from('automation_events').insert([
              {
                tenant_id: tenantId,
                event_type: 'appointment.created.from_conversation',
                entity_type: 'appointment',
                entity_id: appointment.id,
                payload: { session_id: sessionId, start_time: requestedSlot.start, source: 'chatbot_natural' },
              },
              {
                tenant_id: tenantId,
                event_type: 'appointment.reminder_scheduled',
                entity_type: 'appointment',
                entity_id: appointment.id,
                payload: { session_id: sessionId, reminder_for: requestedSlot.start },
              },
            ])

            replyText = `Perfecto, ya he dejado reservada tu cita para ${requestedSlot.label}. Si necesitas cambiarla, dímelo y te propongo otra hora.`
            replyType = 'appointment_suggestion'
            replySource = 'appointment_confirmed_natural'
          }
        } else {
          const alternatives = findAlternativeSlots(existingAppointments || [], start, { tenantId: tenantId!, date: start, daysAhead: 2, businessHourStart: 8, businessHourEnd: 21 })
          const sameDayAlternatives = alternatives.filter((slot) => slot.date === requestedSlot.date)
          replyText = sameDayAlternatives.length > 0
            ? `A las ${requestedSlot.time} ya no tengo disponibilidad. El mismo ${requestedSlot.date.split('-').reverse().join('/')} todavía tengo libres ${sameDayAlternatives.slice(0, 3).map((slot) => slot.time).join(', ')}. Si quieres, puedo reservarte una de esas opciones.`
            : `Justo esa hora no está disponible. ${suggestSlotsMessage(alternatives)}`
          replyType = 'appointment_suggestion'
          replySource = 'appointment_conflict_natural'

          // Save alternatives so next message can confirm naturally
          await supabase
            .from('conversations')
            .update({
              metadata: {
                ...conversationMetaState,
                chatbot_suggested_slots: alternatives,
              },
            })
            .eq('id', conversationId)
          conversationMetaState.chatbot_suggested_slots = alternatives
        }
      } else if (naturalTime && closestSuggestedSlot && suggestedSlots?.length) {
        replyText = `No tengo ${naturalTime} entre las opciones que te propuse. La mas cercana del mismo tramo es ${closestSuggestedSlot.time}. Si quieres, te la reservo.`
        replyType = 'appointment_suggestion'
        replySource = 'appointment_closest_suggested_early'

        await supabase
          .from('conversations')
          .update({
            metadata: {
              ...conversationMetaState,
              chatbot_pending_slot: {
                start: closestSuggestedSlot.start,
                end: closestSuggestedSlot.end,
                label: closestSuggestedSlot.label,
              },
              chatbot_suggested_slots: suggestedSlots,
              chatbot_active_appointment_date: closestSuggestedSlot.date,
            },
          })
          .eq('id', conversationId)
        conversationMetaState.chatbot_pending_slot = {
          start: closestSuggestedSlot.start,
          end: closestSuggestedSlot.end,
          label: closestSuggestedSlot.label,
        }
        conversationMetaState.chatbot_suggested_slots = suggestedSlots
        conversationMetaState.chatbot_active_appointment_date = closestSuggestedSlot.date
      }
    }

    if (!replyText && detectSellerIntent(text)) {
      const sellerReply = buildSellerHelpReply()
      replyText = sellerReply.text
      replyType = sellerReply.replyType
      replySource = 'seller_assistant'
    } else if (!replyText && decision === 'suggest_appointment') {
      try {
        const { data: tenantUsers } = await supabase
          .from('users')
          .select('id')
          .eq('tenant_id', tenantId)
          .limit(1)

        const { data: existingAppointments } = await supabase
          .from('appointments')
          .select('start_time, end_time, status')
          .eq('tenant_id', tenantId)
          .gte('start_time', new Date().toISOString())

        const conversationMeta = (existingMeta || {}) as Record<string, unknown>
        const pendingSlot = conversationMeta.chatbot_pending_slot as { start?: string; end?: string; label?: string } | undefined
        const suggestedSlots = conversationMeta.chatbot_suggested_slots as Array<{ start: string; end: string; label: string; date: string; time: string }> | undefined
        const requestedSlot = resolvedRequestedAppointmentSlot || (pendingSlot?.start && pendingSlot?.end && pendingSlot?.label
          ? {
              start: pendingSlot.start,
              end: pendingSlot.end,
              label: pendingSlot.label,
              date: pendingSlot.start.split('T')[0],
              time: pendingSlot.label.split('·')[1]?.trim() || '',
            }
          : null)

        const rawSameDaySlots = requestedAppointmentDate
          ? findAvailableSlotsForDate(existingAppointments || [], requestedAppointmentDate, {
            tenantId: tenantId!,
            date: requestedAppointmentDate,
            businessHourStart: 8,
            businessHourEnd: 21,
          })
          : []
        const contextualSlots = relativeSchedulePreference
          ? filterSlotsByRelativePreference(
              (suggestedSlots?.filter((slot) => !requestedAppointmentDate || slot.date === rawSameDaySlots[0]?.date || slot.date === storedAppointmentDate) || rawSameDaySlots),
              relativeSchedulePreference,
            )
          : rawSameDaySlots

        if (requestedAppointmentDate && (appointmentAvailabilityIntent || relativeSchedulePreference) && !requestedSlot) {
          const sameDaySlots = contextualSlots.length > 0 ? contextualSlots : rawSameDaySlots

         await supabase
           .from('conversations')
          .update({ metadata: { ...conversationMetaState, chatbot_suggested_slots: sameDaySlots, chatbot_active_appointment_date: sameDaySlots[0]?.date || storedAppointmentDate || rawSameDaySlots[0]?.date || null } })
          .eq('id', conversationId)
        conversationMetaState.chatbot_suggested_slots = sameDaySlots
        conversationMetaState.chatbot_active_appointment_date = sameDaySlots[0]?.date || storedAppointmentDate || rawSameDaySlots[0]?.date || null

          replyText = sameDaySlots.length > 0
          ? relativeSchedulePreference
            ? `Para el ${formatDateForReply(requestedAppointmentDate)} te puedo ofrecer ${formatSlotTimes(sameDaySlots.slice(0, 6))}. Si quieres, te reservo una de esas horas.`
            : `El ${formatDateForReply(requestedAppointmentDate)} siguen libres ${formatSlotTimes(sameDaySlots.slice(0, 8))}. Si quieres, te reservo una de esas horas.`
          : relativeSchedulePreference
            ? `Para el ${formatDateForReply(requestedAppointmentDate)} no me quedan opciones en ese rango. Si quieres, te propongo horas cercanas del mismo dia.`
            : `El ${formatDateForReply(requestedAppointmentDate)} ya no veo huecos libres.`
          replyType = 'appointment_suggestion'
          replySource = relativeSchedulePreference ? 'appointment_day_availability_relative' : 'appointment_day_availability'
      } else if (requestedAppointmentDate && firstFreeSlotIntent) {
        const sameDaySlots = rawSameDaySlots
        const firstFreeSlot = sameDaySlots[0] || null

        if (firstFreeSlot) {
          const { data: appointment, error: appointmentError } = await supabase
            .from('appointments')
            .insert({
              tenant_id: tenantId,
              user_id: tenantUsers?.[0]?.id,
              title: 'Cita desde chatbot',
              appointment_type: 'visit',
              status: 'scheduled',
              start_time: firstFreeSlot.start,
              end_time: firstFreeSlot.end,
              notes: `Creada desde conversación ${conversationId}`,
            })
            .select()
            .single()

          if (!appointmentError && appointment) {
            await supabase
              .from('conversations')
              .update({
                metadata: {
                  ...conversationMetaState,
                  appointment_id: appointment.id,
                    appointment_created_at: new Date().toISOString(),
                    chatbot_pending_slot: null,
                    chatbot_suggested_slots: null,
                    chatbot_active_appointment_date: firstFreeSlot.date,
                  },
                })
              .eq('id', conversationId)
            conversationMetaState.appointment_id = appointment.id
            conversationMetaState.appointment_created_at = new Date().toISOString()
            conversationMetaState.chatbot_pending_slot = null
            conversationMetaState.chatbot_suggested_slots = null
            conversationMetaState.chatbot_active_appointment_date = firstFreeSlot.date

            replyText = `Listo, te he reservado la cita en el primer hueco libre del ${formatDateForReply(requestedAppointmentDate)}: ${firstFreeSlot.label}.`
            replyType = 'appointment_suggestion'
            replySource = 'appointment_first_free_booked'
          }
        } else {
          replyText = `El ${formatDateForReply(requestedAppointmentDate)} ya no veo huecos libres para reservar.`
          replyType = 'appointment_suggestion'
          replySource = 'appointment_first_free_unavailable'
        }
        } else if (requestedAppointmentDate && !requestedSlot) {
          const sameDaySlots = contextualSlots.length > 0 ? contextualSlots : rawSameDaySlots

          await supabase
            .from('conversations')
            .update({ metadata: { ...conversationMetaState, chatbot_suggested_slots: sameDaySlots, chatbot_active_appointment_date: sameDaySlots[0]?.date || storedAppointmentDate || rawSameDaySlots[0]?.date || null } })
            .eq('id', conversationId)
          conversationMetaState.chatbot_suggested_slots = sameDaySlots
          conversationMetaState.chatbot_active_appointment_date = sameDaySlots[0]?.date || storedAppointmentDate || rawSameDaySlots[0]?.date || null

          replyText = sameDaySlots.length > 0
            ? `Para el ${formatDateForReply(requestedAppointmentDate)} tengo libres ${formatSlotTimes(sameDaySlots.slice(0, 6))}. Dime la hora exacta que prefieres y te la reservo.`
            : `El ${formatDateForReply(requestedAppointmentDate)} ya no veo huecos libres para reservar.`
          replyType = 'appointment_suggestion'
          replySource = 'appointment_missing_time'
        }

        if (!replyText && requestedSlot && isAppointmentConfirmation(text)) {
        const start = new Date(requestedSlot.start)
        const end = new Date(requestedSlot.end)
        const available = isSlotAvailable(existingAppointments || [], start, end)

        if (available) {
          const { data: appointment, error: appointmentError } = await supabase
            .from('appointments')
            .insert({
              tenant_id: tenantId,
              user_id: tenantUsers?.[0]?.id,
              title: 'Cita desde chatbot',
              appointment_type: 'visit',
              status: 'scheduled',
              start_time: requestedSlot.start,
              end_time: requestedSlot.end,
              notes: `Creada desde conversación ${conversationId}`,
            })
            .select()
            .single()

          if (!appointmentError && appointment) {
            await supabase
              .from('conversations')
              .update({
                metadata: {
                  ...conversationMetaState,
                  appointment_id: appointment.id,
                  appointment_created_at: new Date().toISOString(),
                  chatbot_pending_slot: null,
                  chatbot_active_appointment_date: requestedSlot.date,
                },
              })
              .eq('id', conversationId)
            conversationMetaState.appointment_id = appointment.id
            conversationMetaState.appointment_created_at = new Date().toISOString()
            conversationMetaState.chatbot_pending_slot = null
            conversationMetaState.chatbot_active_appointment_date = requestedSlot.date

            await supabase.from('automation_events').insert([
              {
                tenant_id: tenantId,
                event_type: 'appointment.created.from_conversation',
                entity_type: 'appointment',
                entity_id: appointment.id,
                payload: { session_id: sessionId, start_time: requestedSlot.start, source: 'chatbot' },
              },
              {
                tenant_id: tenantId,
                event_type: 'appointment.reminder_scheduled',
                entity_type: 'appointment',
                entity_id: appointment.id,
                payload: { session_id: sessionId, reminder_for: requestedSlot.start },
              },
            ])

            replyText = `Perfecto, ya he dejado reservada tu cita para ${requestedSlot.label}. Si necesitas cambiarla, dímelo y te propongo otra hora.`
            replyType = 'appointment_suggestion'
            replySource = 'appointment_confirmed'
          }
        } else {
          const alternatives = findAlternativeSlots(existingAppointments || [], start, { tenantId: tenantId!, date: start, daysAhead: 2, businessHourStart: 8, businessHourEnd: 21 })
          const sameDayAlternatives = alternatives.filter((slot) => slot.date === requestedSlot.date)
          const displaySlots = sameDayAlternatives.length > 0 ? sameDayAlternatives : alternatives
          replyText = sameDayAlternatives.length > 0
            ? `A las ${requestedSlot.time} ya no tengo disponibilidad. El mismo ${requestedSlot.date.split('-').reverse().join('/')} todavía tengo libres ${displaySlots.slice(0, 3).map((slot) => slot.time).join(', ')}. Si quieres, puedo reservarte una de esas opciones.`
            : `Justo esa hora no está disponible. ${suggestSlotsMessage(alternatives)}`
          replyType = 'appointment_suggestion'
          replySource = 'appointment_conflict'

          // Save alternatives so next message can confirm naturally
          await supabase
            .from('conversations')
            .update({
                metadata: {
                  ...conversationMetaState,
                  chatbot_suggested_slots: displaySlots,
                  chatbot_active_appointment_date: requestedSlot.date,
                },
              })
              .eq('id', conversationId)
          conversationMetaState.chatbot_suggested_slots = displaySlots
          conversationMetaState.chatbot_active_appointment_date = requestedSlot.date
        }
        } else if (!replyText && requestedSlot) {
        const start = new Date(requestedSlot.start)
        const end = new Date(requestedSlot.end)
        const available = isSlotAvailable(existingAppointments || [], start, end)

        if (available) {
          await supabase
            .from('conversations')
            .update({
                metadata: {
                  ...conversationMetaState,
                  chatbot_pending_slot: {
                    start: requestedSlot.start,
                    end: requestedSlot.end,
                  label: requestedSlot.label,
                  chatbot_active_appointment_date: requestedSlot.date,
                },
              },
              })
              .eq('id', conversationId)
          conversationMetaState.chatbot_pending_slot = {
            start: requestedSlot.start,
            end: requestedSlot.end,
            label: requestedSlot.label,
          }
          conversationMetaState.chatbot_active_appointment_date = requestedSlot.date

          replyText = `Sí, ${requestedSlot.label} está disponible. ¿Deseas que confirme la cita?`
          replyType = 'appointment_suggestion'
          replySource = 'appointment_exact_available'
        } else {
          const alternatives = findAlternativeSlots(existingAppointments || [], start, { tenantId: tenantId!, date: start, daysAhead: 2, businessHourStart: 8, businessHourEnd: 21 })
          const sameDayAlternatives = alternatives.filter((slot) => slot.date === requestedSlot.date)
          const displaySlots = sameDayAlternatives.length > 0 ? sameDayAlternatives : alternatives
          replyText = sameDayAlternatives.length > 0
            ? `A las ${requestedSlot.time} ya no tengo disponibilidad. El mismo ${requestedSlot.date.split('-').reverse().join('/')} todavía tengo libres ${displaySlots.slice(0, 3).map((slot) => slot.time).join(', ')}. Si quieres, puedo reservarte una de esas opciones.`
            : `Justo esa hora no está disponible. ${suggestSlotsMessage(alternatives)}`
          replyType = 'appointment_suggestion'
          replySource = 'appointment_exact_unavailable'

          // Save alternatives so next message can confirm naturally
          await supabase
            .from('conversations')
            .update({
                metadata: {
                  ...conversationMetaState,
                  chatbot_suggested_slots: displaySlots,
                  chatbot_active_appointment_date: requestedSlot.date,
                },
              })
              .eq('id', conversationId)
          conversationMetaState.chatbot_suggested_slots = displaySlots
          conversationMetaState.chatbot_active_appointment_date = requestedSlot.date
        }
        } else if (!replyText) {
        const conversationMeta2 = (existingMeta || {}) as Record<string, unknown>
        const suggestedSlots = conversationMeta2.chatbot_suggested_slots as Array<{ start: string; end: string; label: string; date: string; time: string }> | undefined
        const naturalTime = extractTimeFromNaturalResponse(text)
        const matchedSlot = naturalTime && suggestedSlots?.length ? matchTimeToSlot(naturalTime, suggestedSlots) : null
        const closestSuggestedSlot = naturalTime && suggestedSlots?.length && !matchedSlot
          ? findClosestSlotToTime(naturalTime, suggestedSlots)
          : null

        if (matchedSlot && isAppointmentConfirmation(text)) {
          const start = new Date(matchedSlot.start)
          const end = new Date(matchedSlot.end)
          const available = isSlotAvailable(existingAppointments || [], start, end)

          if (available) {
              const { data: appointment, error: appointmentError } = await supabase
              .from('appointments')
              .insert({
                tenant_id: tenantId,
                user_id: tenantUsers?.[0]?.id,
                title: 'Cita desde chatbot',
                appointment_type: 'visit',
                status: 'scheduled',
                start_time: matchedSlot.start,
                end_time: matchedSlot.end,
                notes: `Creada desde conversación ${conversationId}`,
              })
              .select()
              .single()

            if (!appointmentError && appointment) {
              await supabase
                .from('conversations')
                .update({
                    metadata: {
                      ...conversationMetaState,
                      appointment_id: appointment.id,
                      appointment_created_at: new Date().toISOString(),
                      chatbot_pending_slot: null,
                    chatbot_suggested_slots: null,
                    chatbot_active_appointment_date: matchedSlot.date,
                  },
                  })
                  .eq('id', conversationId)
                conversationMetaState.appointment_id = appointment.id
                conversationMetaState.appointment_created_at = new Date().toISOString()
                conversationMetaState.chatbot_pending_slot = null
                conversationMetaState.chatbot_suggested_slots = null
                conversationMetaState.chatbot_active_appointment_date = matchedSlot.date

              await supabase.from('automation_events').insert([
                {
                  tenant_id: tenantId,
                  event_type: 'appointment.created.from_conversation',
                  entity_type: 'appointment',
                  entity_id: appointment.id,
                  payload: { session_id: sessionId, start_time: matchedSlot.start, source: 'chatbot_natural' },
                },
                {
                  tenant_id: tenantId,
                  event_type: 'appointment.reminder_scheduled',
                  entity_type: 'appointment',
                  entity_id: appointment.id,
                  payload: { session_id: sessionId, reminder_for: matchedSlot.start },
                },
              ])

              replyText = `Perfecto, ya he dejado reservada tu cita para ${matchedSlot.label}. Si necesitas cambiarla, dímelo y te propongo otra hora.`
              replyType = 'appointment_suggestion'
              replySource = 'appointment_confirmed_natural'
            }
          } else {
            replyText = `Esa hora acaba de ocuparse. ¿Quieres que te proponga otras opciones?`
            replyType = 'appointment_suggestion'
            replySource = 'appointment_conflict_natural'
          }
        } else if (naturalTime && closestSuggestedSlot && suggestedSlots?.length) {
          replyText = `No tengo ${naturalTime} entre las opciones activas del ${closestSuggestedSlot.date.split('-').reverse().join('/')}. La mas cercana de esa misma franja es ${closestSuggestedSlot.time}. Si quieres, te la reservo.`
          replyType = 'appointment_suggestion'
          replySource = 'appointment_closest_suggested'

          await supabase
            .from('conversations')
            .update({
              metadata: {
                ...conversationMetaState,
                chatbot_pending_slot: {
                  start: closestSuggestedSlot.start,
                  end: closestSuggestedSlot.end,
                  label: closestSuggestedSlot.label,
                },
                chatbot_suggested_slots: suggestedSlots,
                chatbot_active_appointment_date: closestSuggestedSlot.date,
              },
            })
            .eq('id', conversationId)
          conversationMetaState.chatbot_pending_slot = {
            start: closestSuggestedSlot.start,
            end: closestSuggestedSlot.end,
            label: closestSuggestedSlot.label,
          }
          conversationMetaState.chatbot_suggested_slots = suggestedSlots
          conversationMetaState.chatbot_active_appointment_date = closestSuggestedSlot.date
        } else {
          const slots = requestedAppointmentDate
            ? findAvailableSlotsForDate(existingAppointments || [], requestedAppointmentDate, { tenantId: tenantId!, date: requestedAppointmentDate, businessHourStart: 8, businessHourEnd: 21 })
            : findAvailableSlots(existingAppointments || [], { tenantId: tenantId!, businessHourStart: 8, businessHourEnd: 21 })
          await supabase
            .from('conversations')
            .update({ metadata: { ...conversationMetaState, chatbot_suggested_slots: slots, chatbot_active_appointment_date: slots[0]?.date || storedAppointmentDate || null } })
            .eq('id', conversationId)
          conversationMetaState.chatbot_suggested_slots = slots
          conversationMetaState.chatbot_active_appointment_date = slots[0]?.date || storedAppointmentDate || null

          replyText = requestedAppointmentDate
            ? `Para el ${formatDateForReply(requestedAppointmentDate)} te puedo ofrecer ${formatSlotTimes(slots.slice(0, 6))}. Dime cual te encaja mejor.`
            : suggestSlotsMessage(slots)
          replyType = 'appointment_suggestion'
          replySource = requestedAppointmentDate ? 'scheduling_engine_same_day' : 'scheduling_engine'

          await supabase.from('automation_events').insert({
            tenant_id: tenantId,
            event_type: 'appointment.slots_suggested',
            entity_type: 'conversation',
            entity_id: conversationId,
            payload: { session_id: sessionId, slots_count: slots.length, slots: slots.slice(0, 3) },
          })
        }
        }
      } catch (error) {
        replyText = buildSchedulingFailureReply(activeLocale, requestedAppointmentDate)
        replyType = 'appointment_suggestion'
        replySource = `appointment_error:${error instanceof Error ? error.message : 'unknown'}`
      }
    }

    if (!replyText && currentScreenKnowledge && !selectedPropertyForTurn && !hasPropertySearchContext(mergedCriteria)) {
      if (detectAdminStepByStepQuestion(text)) {
        const screenReply = buildScreenStepByStepReply(currentScreenKnowledge, activeLocale)
        replyText = screenReply.text
        replyType = screenReply.replyType
        replySource = 'screen_knowledge_step'
      } else if (detectAdminVisibleDataQuestion(text)) {
        const screenReply = buildScreenVisibleDataReply(currentScreenKnowledge, activeLocale)
        replyText = screenReply.text
        replyType = screenReply.replyType
        replySource = 'screen_knowledge_visible'
      } else if (detectAdminKnownScreenQuestion(text) || detectAdminDailyUseQuestion(text)) {
        const screenReply = detectAdminDailyUseQuestion(text)
          ? buildScreenSupportReply(currentScreenKnowledge, activeLocale)
          : buildKnownScreenReply(currentScreenKnowledge, activeLocale)
        replyText = screenReply.text
        replyType = screenReply.replyType
        replySource = 'screen_knowledge_known'
      }
    }

    if (!replyText) {
      if (!isAdminChannel && hasPropertySearchContext(mergedCriteria)) {
        if (propertyMatchCount > 1 && candidatePropertiesSummary.length > 1) {
          replyText = buildPropertyResultsListReply({ locale: activeLocale, results: candidatePropertiesSummary.slice(0, 10), summary: null })
          replyType = 'auto_reply'
          replySource = 'property_deterministic_multi_fallback'
        } else if (candidatePropertiesSummary.length === 1) {
          const singleProperty = candidatePropertiesSummary[0]
          selectedPropertyFacts = singleProperty
          replyText = buildConcretePropertyReply({
            property: singleProperty,
            candidate: singleProperty.title,
            locale: activeLocale,
            text: 'detalles',
          })
          replyType = 'auto_reply'
          replySource = 'property_deterministic_single_fallback'
        } else {
          replyText = buildPropertyReply({
            state: mergedCriteria,
            previous: currentCriteria as never,
            act: propertyTurn.act,
            missing: decidePropertyFlow(mergedCriteria).missing,
            matches: [],
            locale: activeLocale,
            text,
          })
          replyType = 'auto_reply'
          replySource = 'property_deterministic_no_match_fallback'
        }
      } else if (detectGreetingIntent(text) || semanticTurn?.result.intent === 'greeting') {
        replyText = activeLocale === 'en'
          ? 'Hi. Tell me city, budget, operation, or property type and I will help you find options from the current catalogue.'
          : activeLocale === 'it'
            ? 'Ciao. Dimmi città, budget, operazione o tipologia e ti aiuto a trovare opzioni nel catalogo attuale.'
            : 'Hola. Dime ciudad, presupuesto, operación o tipo de inmueble y te ayudo a encontrar opciones del catálogo actual.'
        replyType = 'auto_reply'
        replySource = 'greeting_real_estate'
      } else if (detectThanksIntent(text) || semanticTurn?.result.intent === 'thanks') {
        replyText = activeLocale === 'en'
          ? 'You are welcome. If you want, I can keep refining the search, show more details, or leave the conversation ready for an advisor.'
          : activeLocale === 'it'
            ? 'Di nulla. Se vuoi, posso continuare a raffinare la ricerca, mostrarti più dettagli o lasciare la conversazione pronta per un consulente.'
            : 'De nada. Si quieres, puedo seguir afinando la búsqueda, mostrarte más detalles o dejar la conversación preparada para un asesor.'
        replyType = 'auto_reply'
        replySource = 'thanks_real_estate'
      } else {
        replyText = 'Gracias por tu mensaje. Nuestro equipo te responderá lo antes posible.'
        replyType = 'fallback'
        replySource = 'bot_default'
      }
    }

    const isFinancingNow = detectFinancingIntent(text)
    const shouldStayFinancing = currentActiveFocus === 'financing' || isFinancingNow
    const resolvedMode = propertyReference.requested || concreteFollowUp || selectedPropertyForTurn
      ? 'concrete_property'
      : humanHandoffRequested
      ? 'human_handoff'
      : detectCrmSupportIntent(text)
      ? 'crm_support'
      : detectSellerIntent(text)
      ? 'seller'
      : shouldStayFinancing
      ? 'financing_basic'
      : detectLegalComplexIntent(text)
      ? 'legal_complex'
      : 'search'

    const turnType = propertyReference.requested
      ? 'concrete_reference'
      : concreteFollowUp
      ? 'concrete_followup'
      : humanHandoffRequested
      ? 'human_request'
      : detectCrmSupportIntent(text)
      ? 'crm_support'
      : detectSellerIntent(text)
      ? 'seller_intent'
      : detectFinancingIntent(text)
      ? 'financing_question'
      : detectLegalComplexIntent(text)
      ? 'legal_complex_question'
      : propertyTurn.act === 'HARD_RESET'
      ? 'hard_reset'
      : propertyTurn.act === 'SEARCH_REQUEST'
      ? 'new_search'
      : propertyTurn.act === 'CORRECTION' || propertyTurn.act === 'REFORMULATION'
      ? 'search_correction'
      : propertyTurn.act === 'FOLLOW_UP' || propertyTurn.act === 'ADD_CONSTRAINT' || propertyTurn.act === 'ANSWER_TO_PENDING_QUESTION'
      ? 'search_follow_up'
      : 'fallback'

    const responseContext = buildResponseContext({
      locale: activeLocale,
      channel: activeChannel,
      tenantSlug: tenant_slug || null,
      screenPath: requestScreenPath,
      currentUserRole: requestUserRole,
      latestUserMessage: text,
      turnType,
      modeResolved: resolvedMode,
      activeFocus: isAdminChannel ? 'crm_support' : propertyReference.requested || concreteFollowUp ? 'property_reference' : currentActiveFocus,
      state: isAdminChannel ? null : (resolvedMode === 'search' ? mergedCriteria : hasPropertySearchContext(mergedCriteria) ? mergedCriteria : null),
      selectedProperty: isAdminChannel ? null : selectedPropertyFacts,
      candidates: isAdminChannel ? [] : candidatePropertiesSummary,
      crmSupportRequested: isAdminChannel || detectCrmSupportIntent(text),
        humanRequested: humanHandoffRequested,
      sellerRequested: detectSellerIntent(text),
      financingRequested: shouldStayFinancing,
      legalComplexityFlag: detectLegalComplexIntent(text),
      matchedPropertiesCount: propertyMatchCount,
      semanticInterpretation: semanticResult,
      trace: {
        semantic_interpreter_source: semanticTurn?.source || null,
        semantic_interpreter_mode: semanticTurn?.mode || null,
        semantic_ai_model_used: semanticTurn?.mode === 'ai' ? AI_MODELS.fast : null,
        final_reply_source: replySource,
        final_reply_mode: null,
        final_ai_model_used: null,
        fallback_reason: null,
      },
      nextBestQuestion: resolvedMode === 'financing_basic'
        ? null
        : intent === 'property_interest' && hasPropertySearchContext(mergedCriteria)
        ? decidePropertyFlow(mergedCriteria).missing
        : null,
      inventoryContext: isAdminChannel ? { available_cities: [], same_area_inventory_count: 0, no_match_reason: 'none' } : inventoryContext,
      responseGoal: resolvedMode === 'concrete_property'
        ? 'Answer about the active property using only confirmed facts.'
        : replyType === 'appointment_suggestion'
        ? 'Resolve appointment scheduling using real availability, real conflicts, and controlled messaging without asking unrelated property questions.'
        : resolvedMode === 'crm_support'
        ? 'Resolve the CRM support question clearly and operationally.'
        : resolvedMode === 'human_handoff'
        ? 'Confirm human handoff and stop sales guidance.'
        : resolvedMode === 'seller'
        ? 'Qualify a seller lead and move to the next useful step.'
        : resolvedMode === 'financing_basic'
        ? 'Offer basic financing guidance without inventing bank facts.'
        : resolvedMode === 'legal_complex'
        ? 'Avoid legal improvisation and route to expert support.'
        : 'Answer the real-estate turn naturally using only valid session context and CRM facts.',
      app_knowledge: currentScreenKnowledge ? [currentScreenKnowledge] : [],
    })

    const shouldSkipAiRewrite = replyType === 'appointment_suggestion'
    const aiReply = shouldSkipAiRewrite
      ? { text: replyText, generation_mode: 'fallback' as const, source: 'appointment_deterministic_reply' }
      : await generateVisibleReplyWithAi({
          responseContext,
          fallbackText: replyText,
        })
    replyText = aiReply.text
    replySource = aiReply.generation_mode === 'ai' ? `ai:${aiReply.source}` : `${replySource}:${aiReply.source}`
    responseContext.trace = {
      semantic_interpreter_source: semanticTurn?.source || null,
      semantic_interpreter_mode: semanticTurn?.mode || null,
      semantic_ai_model_used: semanticTurn?.mode === 'ai' ? AI_MODELS.fast : null,
      final_reply_source: replySource,
      final_reply_mode: aiReply.generation_mode,
      final_ai_model_used: aiReply.generation_mode === 'ai' ? AI_MODELS.balanced : null,
      fallback_reason: aiReply.generation_mode === 'fallback' ? aiReply.source : null,
    }
    conversationMetaState.chatbot_response_context = responseContext
    conversationMetaState.chatbot_generation_mode = aiReply.generation_mode
    conversationMetaState.chatbot_final_reply_source = replySource
    conversationMetaState.chatbot_final_reply_mode = aiReply.generation_mode
    conversationMetaState.chatbot_final_ai_model_used = aiReply.generation_mode === 'ai' ? AI_MODELS.balanced : null
    conversationMetaState.chatbot_fallback_reason = aiReply.generation_mode === 'fallback' ? aiReply.source : null

    const nextMissingField = resolvedMode === 'financing_basic'
      ? null
      : intent === 'property_interest' && hasPropertySearchContext(mergedCriteria)
      ? decidePropertyFlow(mergedCriteria).missing
      : null
    const activeFlow: ChatbotDialogueState['active_flow'] = replyType === 'appointment_suggestion'
      ? 'appointment'
      : replyType === 'escalation'
      ? 'human_handoff'
      : shouldStayFinancing
      ? 'financing'
      : intent === 'property_interest'
      ? 'property_search'
      : detectSellerIntent(text)
      ? 'seller_help'
      : currentDialogueState.active_flow || 'unknown'
    const nextDialogueState = buildNextDialogueState({
      previousState: currentDialogueState,
      mergedCriteria,
      activeFlow,
      lastUserAct: dialogueAct,
      replyType: replyType as 'auto_reply' | 'appointment_suggestion' | 'escalation' | 'fallback',
      replyText,
      matchesCount: propertyMatchCount,
      nextMissingField,
      userText: text,
    })
    const actionDecided = strongAppointmentIntent
      ? 'schedule_appointment'
      : humanHandoffRequested
      ? 'handoff_human'
      : selectedPropertyForTurn
      ? 'show_property_details'
      : userAcceptedReview
      ? 'broaden_search'
      : comparisonIntent
      ? 'compare_results'
      : recommendationIntent
      ? 'recommend_result'
      : pluralResultsIntent
      ? 'list_results'
      : hasPropertySearchContext(mergedCriteria)
      ? 'search_catalog'
      : catalogBrowseIntent
      ? 'browse_catalog'
      : 'clarify'
    conversationMetaState.chatbot_context = mergedCriteria
    conversationMetaState.chatbot_dialogue_state = nextDialogueState
    conversationMetaState.chatbot_turn_interpretation = turnInterpretation
    conversationMetaState.chatbot_last_property_results = candidatePropertiesSummary.slice(0, 10)
    conversationMetaState.chatbot_last_intent = intent
    conversationMetaState.chatbot_last_action_decided = actionDecided
    conversationMetaState.chatbot_last_operation = mergedCriteria.operation || null
    conversationMetaState.chatbot_last_location = [mergedCriteria.subzone, mergedCriteria.search_area, mergedCriteria.city].find((value) => isUsableLocationFragment(value)) || null
    conversationMetaState.chatbot_last_bot_question = nextDialogueState.pending_field || null
    conversationMetaState.chatbot_last_suggested_action = actionDecided
    conversationMetaState.chatbot_accepted_previous_suggestion = userAcceptedReview
    
    if (shouldStayFinancing) {
      conversationMetaState.chatbot_selected_property = null
      conversationMetaState.chatbot_active_focus = 'financing'
    } else if (decision === 'suggest_appointment' || currentActiveFocus === 'appointment') {
      conversationMetaState.chatbot_selected_property = null
      conversationMetaState.chatbot_active_focus = 'appointment'
    } else if (propertyReference.requested || concreteFollowUp || (selectedPropertyForTurn && isResultQuestion(text))) {
      conversationMetaState.chatbot_selected_property = selectedPropertyForTurn
      conversationMetaState.chatbot_active_focus = 'property_reference'
    } else if (isAdminChannel || detectCrmSupportIntent(text)) {
      conversationMetaState.chatbot_selected_property = null
      conversationMetaState.chatbot_active_focus = 'crm_support'
    } else if (humanHandoffRequested) {
      conversationMetaState.chatbot_selected_property = null
      conversationMetaState.chatbot_active_focus = 'human_handoff'
    } else if (pluralResultsIntent || comparisonIntent || recommendationIntent || (!!resultSubsetCount && !selectedFromStoredResults) || (candidatePropertiesSummary.length > 1 && intent === 'property_interest')) {
      conversationMetaState.chatbot_selected_property = recommendationIntent && selectedPropertyFacts ? selectedPropertyFacts : null
      conversationMetaState.chatbot_active_focus = 'property_search'
    } else if (hasPropertySearchContext(incomingCriteria)) {
      conversationMetaState.chatbot_selected_property = null
      conversationMetaState.chatbot_active_focus = 'property_search'
    }

    if (tenantId) {
      try {
        const leadCapture = await upsertChatbotLeadCapture({
          supabase,
          tenantId,
          conversationId: conversationId!,
          conversationLeadId: existingConversation?.lead_id || null,
          conversationMetadata: conversationMetaState,
          messageText: text,
          visitorName: visitor_name || null,
          visitorEmail: visitor_email || null,
          criteria: mergedCriteria,
          intent,
          decision,
          confidence,
          selectedProperty: selectedPropertyFacts
            ? {
                id: selectedPropertyFacts.id,
                title: selectedPropertyFacts.title,
                city: selectedPropertyFacts.city,
              }
            : null,
          replyType,
        })
        Object.assign(conversationMetaState, leadCapture.metadataPatch)

        const crmAction = await upsertChatbotCrmAction({
          supabase,
          tenantId,
          conversationId: conversationId!,
          leadId: leadCapture.leadId,
          leadCaptureDecision: leadCapture.decision,
          leadCaptureReason: leadCapture.reason,
          contactData: leadCapture.contactData,
          commercialContext: leadCapture.commercialContext,
          activeFocus: currentActiveFocus,
        })
        Object.assign(conversationMetaState, crmAction.metadataPatch)

        await supabase
          .from('conversations')
          .update({
            lead_id: leadCapture.leadId || existingConversation?.lead_id || null,
            metadata: conversationMetaState,
          })
          .eq('id', conversationId)
      } catch (error) {
        await supabase.from('automation_events').insert({
          tenant_id: tenantId,
          event_type: 'chatbot.post_processing_failed',
          entity_type: 'conversation',
          entity_id: conversationId,
          payload: { error: error instanceof Error ? error.message : 'Unknown error' },
        })

        await supabase
          .from('conversations')
          .update({ metadata: conversationMetaState })
          .eq('id', conversationId)
      }
    } else {
      await supabase
        .from('conversations')
        .update({ metadata: conversationMetaState })
        .eq('id', conversationId)
    }

    // Save bot reply
    await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      direction: 'outbound',
      channel: 'chatbot',
      status: 'sent',
      content: replyText,
      is_automated: true,
      metadata: {
        chatbot_session_id: sessionId,
        chatbot_reply_type: replyType,
        chatbot_reply_source: replySource,
        chatbot_dialogue_state: nextDialogueState,
        chatbot_turn_interpretation: turnInterpretation,
        chatbot_response_context: responseContext,
        chatbot_generation_mode: aiReply.generation_mode,
        chatbot_semantic_source: semanticTurn?.source || null,
        chatbot_semantic_mode: semanticTurn?.mode || null,
        chatbot_semantic_ai_model_used: semanticTurn?.mode === 'ai' ? AI_MODELS.fast : null,
        chatbot_final_reply_source: replySource,
        chatbot_final_reply_mode: aiReply.generation_mode,
        chatbot_final_ai_model_used: aiReply.generation_mode === 'ai' ? AI_MODELS.balanced : null,
        chatbot_fallback_reason: aiReply.generation_mode === 'fallback' ? aiReply.source : null,
        chatbot_matched_properties_count: propertyMatchCount,
        chatbot_action_decided: actionDecided,
        chatbot_is_followup: semanticResult?.is_followup || false,
        chatbot_accepted_previous_suggestion: userAcceptedReview,
        chatbot_selected_property_id: selectedPropertyFacts?.id || null,
        chatbot_matched_from_last_results: matchedFromLastResults,
        chatbot_context: mergedCriteria,
        reply_type: 'auto',
        intent,
        decision,
        confidence: confidence,
      },
    })

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'chatbot.reply.generated',
      entity_type: 'conversation',
      entity_id: conversationId,
      payload: { session_id: sessionId, reply_type: replyType, source: replySource, intent, decision },
    })

    await supabase.from('automation_events').insert({
      tenant_id: tenantId,
      event_type: 'chatbot.reply.sent',
      entity_type: 'conversation',
      entity_id: conversationId,
      payload: { session_id: sessionId, reply_type: replyType },
    })

    const responseLocation = [mergedCriteria.subzone, mergedCriteria.search_area, mergedCriteria.city].find((value) => isUsableLocationFragment(value)) || null

    return NextResponse.json({
      session_id: sessionId,
      conversation_id: conversationId,
      reply: replyText,
      reply_type: replyType,
      reply_source: replySource,
      final_reply_source: replySource,
      semantic_interpreter_source: semanticTurn?.source || null,
      semantic_interpreter_mode: semanticTurn?.mode || null,
      semantic_ai_model_used: semanticTurn?.mode === 'ai' ? AI_MODELS.fast : null,
      final_reply_mode: aiReply.generation_mode,
      ai_model_used: aiReply.generation_mode === 'ai' ? AI_MODELS.balanced : null,
      fallback_reason: aiReply.generation_mode === 'fallback' ? aiReply.source : null,
      matched_properties_count: propertyMatchCount,
      operation: mergedCriteria.operation || null,
      location: responseLocation,
      action_decided: actionDecided,
      is_followup: semanticResult?.is_followup || false,
      accepted_previous_suggestion: userAcceptedReview,
      selected_property_id: selectedPropertyFacts?.id || null,
      matched_from_last_results: matchedFromLastResults,
      intent,
      decision,
      confidence: confidence,
    })
  } catch (error) {
    await supabase.from('automation_events').insert({
      tenant_id: null,
      event_type: 'chatbot.failed',
      entity_type: 'chatbot',
      entity_id: null,
      payload: { error: error instanceof Error ? error.message : 'Unknown error' },
    })

    const likelyAppointmentRequest = detectAppointmentAvailabilityIntent(requestText)
      || detectFirstFreeSlotIntent(requestText)
      || /\b(cita|agendar|reservar|horario libre|horarios libres|disponibilidad)\b/i.test(requestText)

    if (likelyAppointmentRequest) {
      return NextResponse.json({
        reply: buildSchedulingFailureReply(requestLocale, parseAppointmentDateReference(requestText)),
        reply_type: 'appointment_suggestion',
        reply_source: 'appointment_error_top_level',
        intent: 'appointment_request',
        decision: 'suggest_appointment',
        confidence: 0.8,
      })
    }

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

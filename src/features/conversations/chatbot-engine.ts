import type { IntentType } from './intent-types'
import type { AppKnowledgeEntry } from './chatbot-app-knowledge'

export interface ChatbotSession {
  session_id: string
  tenant_id: string
  conversation_id: string | null
  visitor_name: string | null
  visitor_email: string | null
  started_at: string
  last_message_at: string | null
  status: 'active' | 'escalated' | 'closed'
  metadata: Record<string, unknown>
}

export interface ChatbotMessage {
  text: string
  session_id: string
  sender: 'visitor' | 'bot' | 'human'
  timestamp: string
}

export interface ChatbotReply {
  text: string
  type: 'auto_reply' | 'appointment_suggestion' | 'escalation' | 'fallback'
  source: string
  metadata?: Record<string, unknown>
}

export interface ChatbotMetadata {
  chatbot_session_id?: string
  chatbot_source?: string
  chatbot_visitor_name?: string
  chatbot_visitor_email?: string
  chatbot_reply_type?: string
  chatbot_reply_source?: string
  chatbot_context?: ChatbotSearchCriteria
  chatbot_dialogue_state?: ChatbotDialogueState
  chatbot_turn_interpretation?: ChatbotTurnInterpretation
  chatbot_response_context?: unknown
  chatbot_generation_mode?: 'ai' | 'fallback'
  reply_type?: 'auto' | 'human' | 'prepared' | 'escalated'
}

export type ChatbotDialogueAct =
  | 'new_search'
  | 'correction'
  | 'clarification'
  | 'add_constraint'
  | 'reformulation'
  | 'answer_pending'
  | 'short_follow_up'
  | 'restart'
  | 'fallback'

export interface ChatbotDialogueState {
  active_flow?: 'property_search' | 'appointment' | 'human_handoff' | 'seller_help' | 'financing' | 'unknown'
  last_user_act?: ChatbotDialogueAct
  last_bot_act?: 'ask_missing_field' | 'summarize_search' | 'show_matches' | 'appointment' | 'escalation' | 'fallback'
  pending_field?: 'operation' | 'city' | 'budget_max' | null
  turn_count?: number
  reply_variant?: number
  last_user_text?: string
  last_bot_text?: string
}

export type ChatbotConversationAct =
  | 'SEARCH_REQUEST'
  | 'CORRECTION'
  | 'CLARIFICATION'
  | 'ADD_CONSTRAINT'
  | 'REFORMULATION'
  | 'HARD_RESET'
  | 'ANSWER_TO_PENDING_QUESTION'
  | 'FOLLOW_UP'
  | 'NEGATION'
  | 'RESTART'
  | 'OUT_OF_SCOPE'
  | 'FALLBACK'

export type ChatbotDomainEntityKind =
  | 'OPERATION'
  | 'PROPERTY_TYPE'
  | 'LOCATION'
  | 'MICRO_LOCATION'
  | 'LANDMARK'
  | 'SPATIAL_RELATION'
  | 'ROOMS'
  | 'BATHROOMS'
  | 'BUDGET'
  | 'BUDGET_MODE'
  | 'ATTRIBUTE'
  | 'LOGISTIC_REQUIREMENT'
  | 'QUALITATIVE_REQUIREMENT'
  | 'URGENCY'
  | 'FLEXIBILITY'

export type ChatbotSignalClass =
  | 'USER_REQUEST_OPENING'
  | 'SEARCH_INTENT_SIGNAL'
  | 'OPERATION_SIGNAL'
  | 'LOCATION_SIGNAL'
  | 'LOCATION_CORRECTION_SIGNAL'
  | 'QUANTITY_SIGNAL'
  | 'RANGE_SIGNAL'
  | 'MINIMUM_SIGNAL'
  | 'BUDGET_SIGNAL'
  | 'MONTHLY_BUDGET_SIGNAL'
  | 'FEATURE_SIGNAL'
  | 'LOGISTICS_SIGNAL'
  | 'CORRECTION_SIGNAL'
  | 'NEGATION_SIGNAL'
  | 'REFORMULATION_SIGNAL'
  | 'PREFERENCE_SIGNAL'
  | 'URGENCY_SIGNAL'

export interface ChatbotEntityMention {
  kind: ChatbotDomainEntityKind
  mode: 'set' | 'add' | 'replace'
  value: unknown
}

export interface ChatbotTurnInterpretation {
  raw_text: string
  locale: string
  normalized_text: string
  conversation_act: ChatbotConversationAct
  signal_classes: ChatbotSignalClass[]
  entity_mentions: ChatbotEntityMention[]
  extracted_criteria: ChatbotSearchCriteria
}


export interface ChatbotSearchCriteria {
  operation?: 'sale' | 'rent'
  property_type?: 'apartment' | 'house' | 'penthouse' | 'commercial' | 'land' | 'other'
  property_label?: string
  rooms?: number
  rooms_min?: number
  rooms_max?: number
  rooms_comparator?: 'exact' | 'min' | 'range'
  bathrooms?: number
  bathrooms_min?: number
  bathrooms_max?: number
  bathrooms_comparator?: 'exact' | 'min' | 'range'
  city?: string
  search_area?: string
  location_scope?: 'exact' | 'broad' | 'surroundings'
  region?: string
  country?: string
  subzone?: string
  landmark?: string
  landmarks?: string[]
  spatial_relation?: string
  spatial_relations?: string[]
  location_clauses?: Array<{ relation: string; landmark: string }>
  budget_max?: number
  budget_min?: number
  budget_approx?: boolean
  is_location_flexible?: boolean
  urgency?: 'high' | 'medium' | 'low'
  attributes?: string[]
  logistic_attributes?: string[]
  qualitative_attributes?: string[]
  raw_context?: string
  is_monthly_budget?: boolean
}

export function generateSessionId(): string {
  return `cb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function findConversationBySession(
  sessionId: string,
  existingConversations: Array<{ id: string; metadata: Record<string, unknown> }>
): string | null {
  for (const conv of existingConversations) {
    const meta = conv.metadata
    if (meta.chatbot_session_id === sessionId) return conv.id
  }
  return null
}

function normalizeText(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function mergeUniqueStrings(...lists: Array<string[] | undefined>): string[] | undefined {
  const merged = lists.flatMap((list) => list || []).filter(Boolean)
  if (merged.length === 0) return undefined
  return [...new Set(merged)]
}

function mergeLocationClauses(
  ...lists: Array<Array<{ relation: string; landmark: string }> | undefined>
): Array<{ relation: string; landmark: string }> | undefined {
  const merged = lists.flatMap((list) => list || [])
  if (merged.length === 0) return undefined
  const seen = new Set<string>()
  const result: Array<{ relation: string; landmark: string }> = []
  for (const item of merged) {
    const key = `${item.relation}::${item.landmark}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function isSemanticLocationStopword(token: string): boolean {
  return /^(alquiler|alquilar|rent|venta|sale|compra|comprar|buy|affitto|affittare|comprare|piso|apartamento|apartment|appartamento|casa|house|flat|property|place|city|area|zone|zona|barrio|calle|avenida|plaza|park|street|avenue|square|block|transporte|transport|trasporti|colegios|schools|scuole|conexion|connection|connessione|supermercados|supermarkets|servicios|services|tranquila|quiet|luminosa|bright|necesito|need|serve|quiero|want|mejor|better|bagni|banos|bathrooms|habitaciones|bedrooms|camere|metro|train|tren|bus|hospital|clinic|clinica|universidad|university|aeropuerto|airport|playa|beach|parque|park|centro|historic|historico|historica|old|town|afueras|outskirts|periferia)$/.test(token)
}

const NUMBER_WORDS: Record<string, number> = {
  cero: 0, zero: 0,
  un: 1, una: 1, uno: 1, one: 1, uno_it: 1,
  dos: 2, due: 2, two: 2,
  tres: 3, tre: 3, three: 3,
  cuatro: 4, quattro: 4, four: 4,
  cinco: 5, cinque: 5, five: 5,
  seis: 6, sei: 6, six: 6,
  siete: 7, sette: 7, seven: 7,
  ocho: 8, otto: 8, eight: 8,
  nueve: 9, nove: 9, nine: 9,
  diez: 10, dieci: 10, ten: 10,
}

function parseLocalizedNumberToken(token: string | undefined): number | undefined {
  if (!token) return undefined
  const normalized = normalizeText(token).trim()
  if (/^\d+$/.test(normalized)) return Number(normalized)
  return NUMBER_WORDS[normalized]
}

function numberWordPattern(locale: string): string {
  if (locale === 'en') return 'one|two|three|four|five|six|seven|eight|nine|ten'
  if (locale === 'it') return 'una|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci'
  return 'un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|due|tre|quattro|cinque'
}

function quantityPattern(locale: string): string {
  return `(\\d+|${numberWordPattern(locale)})`
}

function extractLogisticAttributes(normalized: string, locale: string): string[] {
  const logistic = new Set<string>()
  for (const lt of LOGISTIC_TOKENS) {
    if (lt.pattern.test(normalized)) logistic.add(logisticLabel(lt.token, locale))
  }

  const serviceSignals = [
    { pattern: /\b(supermercados?|supermarkets?|supermercati)\b/, label: logisticLabel('near_supermarkets', locale) },
    { pattern: /\b(colegios?|escuelas?|schools?|scuole)\b/, label: logisticLabel('near_schools', locale) },
    { pattern: /\b(servicios?(?: basicos?)?|basic services|services|servizi(?: di base)?|farmacia|hospital|hospitals?|clinica|clinic)\b/, label: logisticLabel('near_services', locale) },
    { pattern: /\b(tren|train|stazione)\b/, label: logisticLabel('near_train_station', locale) },
    { pattern: /\b(bus|autobus|autobus)\b/, label: logisticLabel('near_bus', locale) },
    { pattern: /\b(metro|transport|transporte|trasporti|metropolitana)\b/, label: logisticLabel('near_transport', locale) },
    { pattern: /\b(conexion|conexión|connection|connessione)\b/, label: logisticLabel('good_connection', locale) },
  ]

  const nearContext = locale === 'en'
    ? /\b(near|close to|well connected|good connection)\b/
    : locale === 'it'
    ? /\b(vicino|collegato|buona connessione)\b/
    : /\b(cerca de|bien conectado|buena conexion|buena conexión)\b/

  if (nearContext.test(normalized)) {
    for (const signal of serviceSignals) {
      if (signal.pattern.test(normalized)) logistic.add(signal.label)
    }
  }

  return [...logistic]
}

function hasCoreSearchSignal(criteria: ChatbotSearchCriteria | undefined): boolean {
  if (!criteria) return false
  return Boolean(
    criteria.operation ||
    criteria.property_type ||
    criteria.city ||
    criteria.rooms !== undefined ||
    criteria.rooms_min !== undefined ||
    criteria.bathrooms !== undefined ||
    criteria.bathrooms_min !== undefined ||
    criteria.budget_max !== undefined
  )
}

function countSupplementarySignals(criteria: ChatbotSearchCriteria | undefined): number {
  if (!criteria) return 0
  return [
    criteria.subzone,
    criteria.landmark,
    criteria.landmarks?.length,
    criteria.spatial_relations?.length,
    criteria.attributes?.length,
    criteria.logistic_attributes?.length,
    criteria.qualitative_attributes?.length,
    criteria.urgency,
  ].filter(Boolean).length
}

function criteriaChangesCoreField(current: ChatbotSearchCriteria | undefined, incoming: ChatbotSearchCriteria): boolean {
  return Boolean(
    (incoming.operation !== undefined && incoming.operation !== current?.operation) ||
    (incoming.property_type !== undefined && incoming.property_type !== current?.property_type) ||
    (incoming.city !== undefined && incoming.city !== current?.city) ||
    (incoming.rooms !== undefined && incoming.rooms !== current?.rooms) ||
    (incoming.rooms_min !== undefined && incoming.rooms_min !== current?.rooms_min) ||
    (incoming.rooms_max !== undefined && incoming.rooms_max !== current?.rooms_max) ||
    (incoming.bathrooms !== undefined && incoming.bathrooms !== current?.bathrooms) ||
    (incoming.bathrooms_min !== undefined && incoming.bathrooms_min !== current?.bathrooms_min) ||
    (incoming.bathrooms_max !== undefined && incoming.bathrooms_max !== current?.bathrooms_max) ||
    (incoming.budget_max !== undefined && incoming.budget_max !== current?.budget_max)
  )
}

function criteriaReplacesExistingCoreField(current: ChatbotSearchCriteria | undefined, incoming: ChatbotSearchCriteria): boolean {
  return Boolean(
    (current?.operation !== undefined && incoming.operation !== undefined && incoming.operation !== current.operation) ||
    (current?.property_type !== undefined && incoming.property_type !== undefined && incoming.property_type !== current.property_type) ||
    (current?.city !== undefined && incoming.city !== undefined && incoming.city !== current.city) ||
    (current?.rooms !== undefined && incoming.rooms !== undefined && incoming.rooms !== current.rooms) ||
    (current?.rooms_min !== undefined && incoming.rooms_min !== undefined && incoming.rooms_min !== current.rooms_min) ||
    (current?.rooms_max !== undefined && incoming.rooms_max !== undefined && incoming.rooms_max !== current.rooms_max) ||
    (current?.bathrooms !== undefined && incoming.bathrooms !== undefined && incoming.bathrooms !== current.bathrooms) ||
    (current?.bathrooms_min !== undefined && incoming.bathrooms_min !== undefined && incoming.bathrooms_min !== current.bathrooms_min) ||
    (current?.bathrooms_max !== undefined && incoming.bathrooms_max !== undefined && incoming.bathrooms_max !== current.bathrooms_max) ||
    (current?.budget_max !== undefined && incoming.budget_max !== undefined && incoming.budget_max !== current.budget_max)
  )
}

function satisfiesPendingField(
  pendingField: ChatbotDialogueState['pending_field'],
  incoming: ChatbotSearchCriteria
): boolean {
  if (!pendingField) return false
  if (pendingField === 'operation') return incoming.operation !== undefined
  if (pendingField === 'city') return incoming.city !== undefined || incoming.is_location_flexible === true
  if (pendingField === 'budget_max') return incoming.budget_max !== undefined
  return false
}

function detectExplicitRestart(text: string): boolean {
  const normalized = normalizeText(text)
  return /\b(empezar de nuevo|nueva busqueda|otra busqueda|busqueda distinta|desde cero|olvida lo anterior|start over|new search|different search|from scratch|forget the previous|ripartiamo|nuova ricerca|da zero|lascia stare quello di prima)\b/.test(normalized)
}

function detectSignalClasses(text: string, locale = 'es'): ChatbotSignalClass[] {
  const normalized = normalizeText(text)
  const signals = new Set<ChatbotSignalClass>()

  if (/\b(busco|quiero|quisiera|me interesa|cerco|vorrei|looking for|want|need)/.test(normalized)) {
    signals.add('USER_REQUEST_OPENING')
    signals.add('SEARCH_INTENT_SIGNAL')
  }
  if (/\b(compra|comprar|buy|purchase|venta|sale|rent|rental|alquiler|alquilar|affitto|affittare|comprare)/.test(normalized)) signals.add('OPERATION_SIGNAL')
  if (/\b(en|de|del|della|di|a|in|near|around|vicino|cerca|alrededor)\b/.test(normalized)) signals.add('LOCATION_SIGNAL')
  if (/\b(no|mejor|instead|rather|actually|wait|invece|meglio|prefiero|change|switch|cambia|corrige)/.test(normalized)) {
    signals.add('CORRECTION_SIGNAL')
    signals.add('LOCATION_CORRECTION_SIGNAL')
  }
  if (/\b(no|not|non|sin)/.test(normalized)) signals.add('NEGATION_SIGNAL')
  if (/\b(es decir|o sea|me refiero|i mean|cioe|intendo)/.test(normalized)) signals.add('REFORMULATION_SIGNAL')
  if (/\b(urgente|cuanto antes|asap|urgent|subito|prima possibile)/.test(normalized)) signals.add('URGENCY_SIGNAL')
  if (/\b(presupuesto|budget|maximo|maximum|hasta|massimo|monthly|mensual|al mes|al mese|per month)\b/.test(normalized)) signals.add('BUDGET_SIGNAL')
  if (/\b(monthly|mensual|al mes|al mese|per month)\b/.test(normalized)) signals.add('MONTHLY_BUDGET_SIGNAL')
  if (/\b(al menos|minimo|min|at least|or more|o mas|o piu)\b/.test(normalized)) signals.add('MINIMUM_SIGNAL')
  if (/\b(to|-|a)\b/.test(normalized) && /\d/.test(normalized)) signals.add('RANGE_SIGNAL')
  if (/\d/.test(normalized)) signals.add('QUANTITY_SIGNAL')
  if (ATTRIBUTE_TOKENS.some(token => token.pattern.test(normalized))) signals.add('FEATURE_SIGNAL')
  if (LOGISTIC_TOKENS.some(token => token.pattern.test(normalized))) signals.add('LOGISTICS_SIGNAL')
  if (/\b(preferiblemente|preferably|preferisco|prefiero|idealmente)/.test(normalized)) signals.add('PREFERENCE_SIGNAL')

  return [...signals]
}

function buildEntityMentions(criteria: ChatbotSearchCriteria): ChatbotEntityMention[] {
  const mentions: ChatbotEntityMention[] = []
  if (criteria.operation !== undefined) mentions.push({ kind: 'OPERATION', mode: 'set', value: criteria.operation })
  if (criteria.property_type !== undefined) mentions.push({ kind: 'PROPERTY_TYPE', mode: 'set', value: criteria.property_type })
  if (criteria.city !== undefined) mentions.push({ kind: 'LOCATION', mode: 'replace', value: criteria.city })
  if (criteria.subzone !== undefined) mentions.push({ kind: 'MICRO_LOCATION', mode: 'set', value: criteria.subzone })
  if (criteria.landmarks?.length || criteria.landmark) mentions.push({ kind: 'LANDMARK', mode: 'add', value: criteria.landmarks || [criteria.landmark] })
  if (criteria.spatial_relations?.length || criteria.spatial_relation) mentions.push({ kind: 'SPATIAL_RELATION', mode: 'add', value: criteria.spatial_relations || [criteria.spatial_relation] })
  if (criteria.rooms !== undefined || criteria.rooms_min !== undefined || criteria.rooms_max !== undefined) mentions.push({ kind: 'ROOMS', mode: 'set', value: { rooms: criteria.rooms, rooms_min: criteria.rooms_min, rooms_max: criteria.rooms_max, rooms_comparator: criteria.rooms_comparator } })
  if (criteria.bathrooms !== undefined || criteria.bathrooms_min !== undefined || criteria.bathrooms_max !== undefined) mentions.push({ kind: 'BATHROOMS', mode: 'set', value: { bathrooms: criteria.bathrooms, bathrooms_min: criteria.bathrooms_min, bathrooms_max: criteria.bathrooms_max, bathrooms_comparator: criteria.bathrooms_comparator } })
  if (criteria.budget_max !== undefined || criteria.budget_min !== undefined) mentions.push({ kind: 'BUDGET', mode: 'set', value: { budget_max: criteria.budget_max, budget_min: criteria.budget_min, budget_approx: criteria.budget_approx } })
  if (criteria.is_monthly_budget !== undefined) mentions.push({ kind: 'BUDGET_MODE', mode: 'set', value: { is_monthly_budget: criteria.is_monthly_budget } })
  if (criteria.attributes?.length) mentions.push({ kind: 'ATTRIBUTE', mode: 'add', value: criteria.attributes })
  if (criteria.logistic_attributes?.length) mentions.push({ kind: 'LOGISTIC_REQUIREMENT', mode: 'add', value: criteria.logistic_attributes })
  if (criteria.qualitative_attributes?.length) mentions.push({ kind: 'QUALITATIVE_REQUIREMENT', mode: 'add', value: criteria.qualitative_attributes })
  if (criteria.urgency !== undefined) mentions.push({ kind: 'URGENCY', mode: 'set', value: criteria.urgency })
  if (criteria.is_location_flexible !== undefined) mentions.push({ kind: 'FLEXIBILITY', mode: 'set', value: criteria.is_location_flexible })
  return mentions
}

function applyEntityMentionUpdate(
  draft: ChatbotSearchCriteria,
  current: ChatbotSearchCriteria | undefined,
  mention: ChatbotEntityMention,
  preserveExisting: boolean,
  resetMicroLocation: boolean
) {
  switch (mention.kind) {
    case 'OPERATION':
      draft.operation = mention.value as ChatbotSearchCriteria['operation']
      break
    case 'PROPERTY_TYPE':
      draft.property_type = mention.value as ChatbotSearchCriteria['property_type']
      break
    case 'LOCATION':
      draft.city = mention.value as string
      if (resetMicroLocation) {
        draft.subzone = undefined
        draft.landmark = undefined
        draft.landmarks = undefined
        draft.spatial_relation = undefined
        draft.spatial_relations = undefined
      }
      break
    case 'MICRO_LOCATION':
      draft.subzone = mention.value as string
      break
    case 'LANDMARK':
      draft.landmarks = mergeUniqueStrings(draft.landmarks, mention.value as string[])
      draft.landmark = draft.landmarks?.[0]
      break
    case 'SPATIAL_RELATION':
      draft.spatial_relations = mergeUniqueStrings(draft.spatial_relations, mention.value as string[])
      draft.spatial_relation = draft.spatial_relations?.[0]
      break
    case 'ROOMS': {
      const value = mention.value as Pick<ChatbotSearchCriteria, 'rooms' | 'rooms_min' | 'rooms_max' | 'rooms_comparator'>
      draft.rooms = value.rooms
      draft.rooms_min = value.rooms_min
      draft.rooms_max = value.rooms_max
      draft.rooms_comparator = value.rooms_comparator
      break
    }
    case 'BATHROOMS': {
      const value = mention.value as Pick<ChatbotSearchCriteria, 'bathrooms' | 'bathrooms_min' | 'bathrooms_max' | 'bathrooms_comparator'>
      draft.bathrooms = value.bathrooms
      draft.bathrooms_min = value.bathrooms_min
      draft.bathrooms_max = value.bathrooms_max
      draft.bathrooms_comparator = value.bathrooms_comparator
      break
    }
    case 'BUDGET': {
      const value = mention.value as Pick<ChatbotSearchCriteria, 'budget_max' | 'budget_min' | 'budget_approx'>
      draft.budget_max = value.budget_max
      draft.budget_min = value.budget_min
      draft.budget_approx = value.budget_approx
      break
    }
    case 'BUDGET_MODE': {
      const value = mention.value as Pick<ChatbotSearchCriteria, 'is_monthly_budget'>
      draft.is_monthly_budget = value.is_monthly_budget
      break
    }
    case 'ATTRIBUTE':
      draft.attributes = mergeUniqueStrings(draft.attributes, mention.value as string[])
      break
    case 'LOGISTIC_REQUIREMENT':
      draft.logistic_attributes = mergeUniqueStrings(draft.logistic_attributes, mention.value as string[])
      break
    case 'QUALITATIVE_REQUIREMENT':
      draft.qualitative_attributes = mergeUniqueStrings(draft.qualitative_attributes, mention.value as string[])
      break
    case 'URGENCY':
      draft.urgency = mention.value as ChatbotSearchCriteria['urgency']
      break
    case 'FLEXIBILITY':
      draft.is_location_flexible = mention.value as boolean
      break
  }

  if (!preserveExisting && current && mention.kind === 'LOCATION' && resetMicroLocation) {
    draft.subzone = undefined
    draft.landmark = undefined
    draft.landmarks = undefined
    draft.spatial_relation = undefined
    draft.spatial_relations = undefined
  }
}

// === GLOBAL TOKEN DICTIONARIES ===
const LANDMARK_TOKENS: Array<{ pattern: RegExp; token: string }> = [
  { pattern: /\b(playa|beach|spiaggia|mare|sea|mar)\b/, token: 'beach' },
  { pattern: /\b(centro historico|centro storico|old town|casco antiguo|casco historico|zona historica|zona storica)\b/, token: 'historic_center' },
  { pattern: /\b(estacion|station|stazione|terminal)\b/, token: 'station' },
  { pattern: /\b(parque publico|public park|parco pubblico|cerca del parque|near the park|vicino al parco|cerca del parque publico|near the public park)\b/, token: 'park' },
  { pattern: /\b(centro comercial|mall)\b/, token: 'mall' },
  { pattern: /\b(hospital|clinica|clinic)\b/, token: 'hospital' },
  { pattern: /\b(universidad|university|universita)\b/, token: 'university' },
  { pattern: /\b(aeropuerto|airport|aeroporto)\b/, token: 'airport' },
  { pattern: /\b(metro|subway|metropolitana)\b/, token: 'metro' },
]

const SPATIAL_TOKENS: Array<{ pattern: RegExp; token: string }> = [
  { pattern: /\b(cerca de|cerca a|cerca del|cerca al|close to|near|vicino a|vicino al|vicino alla|vicino allo|a pocos minutos de|a few minutes from|a pochi minuti da)\b/, token: 'near' },
  { pattern: /\b(junto a|junto al|next to|beside|accanto a|accanto al|accanto alla|accanto allo)\b/, token: 'next_to' },
  { pattern: /\b(al norte de|al sur de|al este de|al oeste de|to the north of|to the south of|a nord di|a sud di)\b/, token: 'directional' },
  { pattern: /\b(alrededores?|surroundings|dintorni|intorni|cercan[ií]as|proximidades|afueras|outskirts|periferia|periferie)\b/, token: 'surroundings' },
]

const ATTRIBUTE_TOKENS: Array<{ pattern: RegExp; token: string }> = [
  // Each attribute gets its own token — no grouping/substitution
  { pattern: /\b(jardin|garden|giardino)\b/, token: 'garden' },
  { pattern: /\b(terraza|terrace|terrazza)\b/, token: 'terrace' },
  { pattern: /\b(balcon|balcony|balcone)\b/, token: 'balcony' },
  { pattern: /\b(patio)\b/, token: 'patio' },
  { pattern: /\b(piscina|pool)\b/, token: 'pool' },
  { pattern: /\b(garage|garaje|parking|parcheggio|aparcamiento)\b/, token: 'parking' },
  { pattern: /\b(amueblado|furnished|arredato|amoblado)\b/, token: 'furnished' },
  { pattern: /\b(ascensor|elevator|ascensore)\b/, token: 'elevator' },
  { pattern: /\b(trastero|storage|ripostiglio)\b/, token: 'storage' },
]

const LOGISTIC_TOKENS: Array<{ pattern: RegExp; token: string }> = [
  { pattern: /\b(cerca de supermercados|near supermarkets|vicino a supermercati|cerca de supermercado|cerca de tienda|cerca de tiendas)\b/, token: 'near_supermarkets' },
  { pattern: /\b(cerca de estaci[oó]n de tren|cerca de tren|cerca de la estaci[oó]n|near train station|near train|vicino a stazione|vicino a tren)\b/, token: 'near_train_station' },
  { pattern: /\b(cerca de bus|cerca de autob[uú]s|near bus|vicino a bus|vicino a autobus)\b/, token: 'near_bus' },
  { pattern: /\b(buena conexi[oó]n|good connection|buona connessione)\b/, token: 'good_connection' },
  { pattern: /\b(cerca de servicios b[aá]sicos|near basic services|vicino a servizi di base|cerca de hospitales|cerca de farmacia|cerca de colegio)\b/, token: 'near_services' },
  { pattern: /\b(cerca de colegios|near schools|vicino a scuole|cerca de escuelas)\b/, token: 'near_schools' },
  { pattern: /\b(cerca de transporte|near transport|vicino ai trasporti|cerca del transporte|cerca de transporte p[uú]blico|cerca de metro|cerca de la metro|cerca de la estaci[oó]n de metro|near metro|vicino alla metro|vicino alla metropolitana)\b/, token: 'near_transport' },
]

const QUALITATIVE_TOKENS: Array<{ pattern: RegExp; token: string }> = [
  { pattern: /\b(espacio para ninos|space for children|spazio per bambini|buena para familia|good for family|buona per familia)\b/, token: 'family_friendly' },
  { pattern: /\b(zona tranquila|quiet area|zona tranquilla|tranquilo|peaceful|tranquillo|silencioso|quiet|silenzioso)\b/, token: 'quiet_area' },
  { pattern: /\b(luminosa|luminous|bright|luminoso|soleada|sunny|soleggiato)\b/, token: 'bright' },
  { pattern: /\b(buena vista|good view|bella vista|vistas|views|vista)\b/, token: 'good_view' },
]

const KNOWN_CITIES = [
  'madrid', 'barcelona', 'valencia', 'sevilla', 'malaga', 'bilbao', 'badajoz', 'alicante', 'zaragoza', 'murcia',
  'barcellona', 'siviglia', 'seville',
  'paris', 'london', 'rome', 'milan', 'naples', 'florence',
  'roma', 'milano', 'napoli', 'firenze',
]

function landmarkLabel(token: string, locale: string): string {
  const labels: Record<string, Record<string, string>> = {
    beach: { es: 'la playa', en: 'the beach', it: 'la spiaggia' },
    historic_center: { es: 'el centro histórico', en: 'the historic center', it: 'il centro storico' },
    station: { es: 'la estación', en: 'the station', it: 'la stazione' },
    park: { es: 'el parque', en: 'the park', it: 'il parco' },
    mall: { es: 'el centro comercial', en: 'the mall', it: 'il centro commerciale' },
    hospital: { es: 'el hospital', en: 'the hospital', it: "l'ospedale" },
    university: { es: 'la universidad', en: 'the university', it: "l'università" },
    airport: { es: 'el aeropuerto', en: 'the airport', it: "l'aeroporto" },
    metro: { es: 'el metro', en: 'the metro', it: 'la metropolitana' },
  }
  return labels[token]?.[locale] || token
}

function spatialLabel(token: string, locale: string): string {
  const labels: Record<string, Record<string, string>> = {
    near: { es: 'cerca de', en: 'near', it: 'vicino a' },
    next_to: { es: 'junto a', en: 'next to', it: 'accanto a' },
    directional: { es: 'en la zona', en: 'in the area', it: 'nella zona' },
    surroundings: { es: 'afueras', en: 'outskirts', it: 'periferia' },
  }
  return labels[token]?.[locale] || token
}

function attributeLabel(token: string, locale: string): string {
  const labels: Record<string, Record<string, string>> = {
    garden: { es: 'jardín', en: 'garden', it: 'giardino' },
    terrace: { es: 'terraza', en: 'terrace', it: 'terrazza' },
    balcony: { es: 'balcón', en: 'balcony', it: 'balcone' },
    patio: { es: 'patio', en: 'patio', it: 'patio' },
    pool: { es: 'piscina', en: 'pool', it: 'piscina' },
    parking: { es: 'garaje', en: 'parking', it: 'parcheggio' },
    furnished: { es: 'amueblado', en: 'furnished', it: 'arredato' },
    elevator: { es: 'ascensor', en: 'elevator', it: 'ascensore' },
    storage: { es: 'trastero', en: 'storage', it: 'ripostiglio' },
  }
  return labels[token]?.[locale] || token
}

function logisticLabel(token: string, locale: string): string {
  const labels: Record<string, Record<string, string>> = {
    near_supermarkets: { es: 'cerca de supermercados', en: 'near supermarkets', it: 'vicino a supermercati' },
    near_train_station: { es: 'cerca de la estación de tren', en: 'near the train station', it: 'vicino alla stazione' },
    near_bus: { es: 'cerca de la parada de autobús', en: 'near the bus stop', it: 'vicino alla fermata del bus' },
    good_connection: { es: 'buena conexión', en: 'good connection', it: 'buona connessione' },
    near_services: { es: 'cerca de servicios básicos', en: 'near basic services', it: 'vicino a servizi di base' },
    near_schools: { es: 'cerca de colegios', en: 'near schools', it: 'vicino a scuole' },
    near_transport: { es: 'cerca de transporte', en: 'near transport', it: 'vicino ai trasporti' },
  }
  return labels[token]?.[locale] || token
}

function qualitativeLabel(token: string, locale: string): string {
  const labels: Record<string, Record<string, string>> = {
    family_friendly: { es: 'espacio para niños', en: 'space for children', it: 'spazio per bambini' },
    quiet_area: { es: 'zona tranquila', en: 'quiet area', it: 'zona tranquilla' },
    bright: { es: 'luminosa', en: 'bright', it: 'luminosa' },
    good_view: { es: 'buena vista', en: 'good view', it: 'bella vista' },
    near_schools: { es: 'cerca de colegios', en: 'near schools', it: 'vicino a scuole' },
    near_transport: { es: 'cerca de transporte', en: 'near transport', it: 'vicino ai trasporti' },
  }
  return labels[token]?.[locale] || token
}

export function extractChatbotCriteria(text: string, locale = 'es'): ChatbotSearchCriteria {
  const normalized = normalizeText(text)
  const criteria: ChatbotSearchCriteria = {}

  // === OPERATION (explicit + implicit) ===
  const saleSignals = locale === 'en'
    ? /\b(buy|purchase|buying|comprar|compra|vendita|vendere|adquirir|adquir|me interesa (?:comprar|adquirir)|busco (?:comprar|compra)|quisiera comprar|quiero comprar)\b/
    : locale === 'it'
    ? /\b(compra|comprare|vendita|vendere|in vendita|acquisire|mi interessa comprare|cerco di comprare)\b/
    : /\b(compra|comprar|venta|vender|compro|en venta|adquirir|adquir|me interesa (?:comprar|adquirir)|busco (?:comprar|compra)|quisiera comprar|quiero comprar)\b/
  const rentSignals = locale === 'en'
    ? /\b(rent|rental|lease|letting|to rent|alquilar|alquiler|affittare|affitto)\b/
    : locale === 'it'
    ? /\b(affitto|affittare|locazione|in affitto|noleggio)\b/
    : /\b(alquiler|alquilar|renta|arriendo|arrendar|rentar|en alquiler|en arriendo|affitto|affittare)\b/

  if (saleSignals.test(normalized)) criteria.operation = 'sale'
  if (rentSignals.test(normalized)) criteria.operation = 'rent'

  // === PROPERTY TYPE ===
  if (locale === 'en') {
    if (/\b(apartment|flat|condo|condominium|depto|departamento)\b/.test(normalized)) criteria.property_type = 'apartment'
    else if (/\b(penthouse|attic)\b/.test(normalized)) criteria.property_type = 'penthouse'
    else if (/\b(house|home|villa|chalet|detached)\b/.test(normalized)) criteria.property_type = 'house'
    else if (/\b(office|commercial|loft|shop|retail)\b/.test(normalized)) criteria.property_type = 'commercial'
    else if (/\b(land|plot|lot)\b/.test(normalized)) criteria.property_type = 'land'
  } else if (locale === 'it') {
    if (/\b(appartamento)\b/.test(normalized)) criteria.property_type = 'apartment'
    else if (/\b(attico|penthouse)\b/.test(normalized)) criteria.property_type = 'penthouse'
    else if (/\b(casa|villa|chalet|villetta)\b/.test(normalized)) criteria.property_type = 'house'
    else if (/\b(ufficio|commerciale|loft|negozio)\b/.test(normalized)) criteria.property_type = 'commercial'
    else if (/\b(terreno|lotto)\b/.test(normalized)) criteria.property_type = 'land'
  } else {
    if (/\b(apartamento|piso|departamento|depto)\b/.test(normalized)) criteria.property_type = 'apartment'
    else if (/\b(atico|penthouse)\b/.test(normalized)) criteria.property_type = 'penthouse'
    else if (/\b(casa|chalet|villa|vivienda)\b/.test(normalized)) criteria.property_type = 'house'
    else if (/\b(local|oficina|comercial|loft)\b/.test(normalized)) criteria.property_type = 'commercial'
    else if (/\b(terreno|solar|parcela)\b/.test(normalized)) criteria.property_type = 'land'
  }

  // === ROOMS (supports ranges and minimums) ===
  // Detect "X o más", "at least X", "al menos X", "minimo X", "no menos de X"
  const qtyPattern = quantityPattern(locale)
  const roomsMinPattern = locale === 'en'
    ? new RegExp(`(?:at least|minimum|min|no less than)\\s*${qtyPattern}\\s*(?:bedrooms?|beds?|bedroom|rooms?)`)
    : locale === 'it'
    ? new RegExp(`(?:almeno|minimo|min)\\s*${qtyPattern}\\s*(?:camere? da letto|camere?|stanze?)`)
    : new RegExp(`(?:al menos|minimo|min|no menos de)\\s*${qtyPattern}\\s*(?:habitaciones?|habitacion|dormitorios?|dormitorio|camas?|camere?)`)
  // Detect "X o más", "X or more", "X o piu"
  const roomsOrMorePattern = locale === 'en'
    ? new RegExp(`${qtyPattern}\\s*(?:or more)\\s*(?:bedrooms?|beds?|bedroom|rooms?)`)
    : locale === 'it'
    ? new RegExp(`${qtyPattern}\\s*(?:o piu)\\s*(?:camere? da letto|camere?|stanze?)`)
    : new RegExp(`${qtyPattern}\\s*(?:o mas)\\s*(?:habitaciones?|habitacion|dormitorios?|dormitorio|camas?|camere?)`)
  // Detect range "X to Y", "X a Y"
  const roomsRangePattern = locale === 'en'
    ? new RegExp(`${qtyPattern}\\s*(?:to|-)\\s*${qtyPattern}\\s*(?:bedrooms?|beds?|bedroom|rooms?)`)
    : locale === 'it'
    ? new RegExp(`${qtyPattern}\\s*(?:a|-|to)\\s*${qtyPattern}\\s*(?:camere? da letto|camere?|stanze?)`)
    : new RegExp(`${qtyPattern}\\s*(?:a|-|to)\\s*${qtyPattern}\\s*(?:habitaciones?|habitacion|dormitorios?|dormitorio|camas?|camere?)`)

  const roomsRangeMatch = normalized.match(roomsRangePattern)
  const roomsMinMatch = normalized.match(roomsMinPattern)
  const roomsOrMoreMatch = normalized.match(roomsOrMorePattern)

  if (roomsRangeMatch) {
    criteria.rooms_min = parseLocalizedNumberToken(roomsRangeMatch[1])
    criteria.rooms_max = parseLocalizedNumberToken(roomsRangeMatch[2])
    criteria.rooms = criteria.rooms_max
    criteria.rooms_comparator = 'range'
  } else if (roomsMinMatch) {
    criteria.rooms_min = parseLocalizedNumberToken(roomsMinMatch[1])
    criteria.rooms = criteria.rooms_min
    criteria.rooms_comparator = 'min'
  } else if (roomsOrMoreMatch) {
    criteria.rooms_min = parseLocalizedNumberToken(roomsOrMoreMatch[1])
    criteria.rooms = criteria.rooms_min
    criteria.rooms_comparator = 'min'
  } else {
    const roomsPatterns = locale === 'en'
      ? new RegExp(`${qtyPattern}[\\s-]*(?:bedrooms?|beds?|bedroom|rooms?)`)
      : locale === 'it'
      ? new RegExp(`${qtyPattern}\\s*(?:camere? da letto|camere?|stanze?)`)
      : new RegExp(`${qtyPattern}\\s*(?:habitaciones?|habitacion|dormitorios?|dormitorio|camas?|camere?)`)
    const roomsMatch = normalized.match(roomsPatterns)
    if (roomsMatch) {
      criteria.rooms = parseLocalizedNumberToken(roomsMatch[1])
      if (criteria.rooms) criteria.rooms_comparator = 'exact'
    }
  }

  // === BATHROOMS (supports ranges and minimums) ===
  const bathMinPattern = new RegExp(`(?:at least|al menos|minimo|min|almeno|no less than)\\s*${qtyPattern}\\s*(?:bathrooms?|baths?|banos?|bagni)`) 
  const bathOrMorePattern = new RegExp(`${qtyPattern}\\s*(?:or more|o mas|o piu)\\s*(?:bathrooms?|baths?|banos?|bagni)`) 
  const bathRangePattern = new RegExp(`${qtyPattern}\\s*(?:a|-|to)\\s*${qtyPattern}\\s*(?:bathrooms?|baths?|banos?|bagni)`) 

  const bathRangeMatch = normalized.match(bathRangePattern)
  const bathMinMatch = normalized.match(bathMinPattern)
  const bathOrMoreMatch = normalized.match(bathOrMorePattern)

  if (bathRangeMatch) {
    criteria.bathrooms_min = parseLocalizedNumberToken(bathRangeMatch[1])
    criteria.bathrooms_max = parseLocalizedNumberToken(bathRangeMatch[2])
    criteria.bathrooms = criteria.bathrooms_max
    criteria.bathrooms_comparator = 'range'
  } else if (bathMinMatch) {
    criteria.bathrooms_min = parseLocalizedNumberToken(bathMinMatch[1])
    criteria.bathrooms = criteria.bathrooms_min
    criteria.bathrooms_comparator = 'min'
  } else if (bathOrMoreMatch) {
    criteria.bathrooms_min = parseLocalizedNumberToken(bathOrMoreMatch[1])
    criteria.bathrooms = criteria.bathrooms_min
    criteria.bathrooms_comparator = 'min'
  } else {
    const bathMatch = normalized.match(new RegExp(`${qtyPattern}\\s*(?:bathrooms?|baths?|banos?|bagni)`))
    if (bathMatch) {
      criteria.bathrooms = parseLocalizedNumberToken(bathMatch[1])
      criteria.bathrooms_comparator = 'exact'
    }
  }

  // === BUDGET ===
  const budgetPatterns = locale === 'en'
    ? /(?:budget|max|maximum|up to)\s*(?:of\s*)?(\d[\d.,]*)/
    : locale === 'it'
    ? /(?:budget|massimo|fino a)\s*(?:di\s*)?(\d[\d.]*)/
    : /(?:presupuesto(?: maximo)?|maximo|hasta)\s*(?:de\s*)?(\d[\d.]*)/
  let budgetMatch = normalized.match(budgetPatterns)
  if (!budgetMatch) {
    const budgetMatch2 = locale === 'it'
      ? normalized.match(/budget\s+(?:e\s+)?(\d[\d.]*)/)
      : locale === 'en'
      ? normalized.match(/budget\s+(?:of\s+)?(\d[\d.,]*)/)
      : normalized.match(/presupuesto\s+(?:es\s+)?(?:de\s+)?(\d[\d.]*)/)
    if (budgetMatch2) budgetMatch = budgetMatch2
  }
  if (!budgetMatch) {
    const standaloneBudget = normalized.match(/(\d{5,7})\s*(?:euros?|eur|€)?/)
    if (standaloneBudget) budgetMatch = standaloneBudget
  }
  if (budgetMatch) {
    const raw = budgetMatch[1].replace(/[.,]/g, '')
    const parsed = Number(raw)
    if (!isNaN(parsed) && parsed > 0 && raw.length >= 3) criteria.budget_max = parsed
  }

  // Approximate budget: "alrededor de", "around", "circa"
  if (!criteria.budget_max) {
    const approxBudget = normalized.match(/(?:alrededor de|around|circa|unos?|aproximadamente)\s*(\d[\d.]*)/)
    if (approxBudget) {
      const raw = approxBudget[1].replace(/[.,]/g, '')
      const parsed = Number(raw)
      if (!isNaN(parsed) && parsed > 0 && raw.length >= 3) {
        criteria.budget_max = parsed
        criteria.budget_approx = true
      }
    }
  }

  // === PROPERTY ATTRIBUTES (exact, no substitution) ===
  const attributes: string[] = []
  for (const attr of ATTRIBUTE_TOKENS) {
    if (attr.pattern.test(normalized)) attributes.push(attributeLabel(attr.token, locale))
  }
  if (attributes.length > 0) criteria.attributes = attributes

  // === LOGISTIC/CONTEXTUAL ATTRIBUTES ===
  const logistic = extractLogisticAttributes(normalized, locale)
  if (logistic.length > 0) criteria.logistic_attributes = logistic

  // === QUALITATIVE ATTRIBUTES ===
  const qualitative: string[] = []
  for (const qa of QUALITATIVE_TOKENS) {
    if (qa.pattern.test(normalized)) qualitative.push(qualitativeLabel(qa.token, locale))
  }
  if (qualitative.length > 0) criteria.qualitative_attributes = qualitative

  // === MONTHLY BUDGET DETECTION (rental) ===
  const monthlyPatterns = locale === 'en'
    ? /(?:(?:monthly rent|rent per month|per month|monthly|month)\s*(?:of\s*)?(\d[\d.,]*)|(\d[\d.,]*)\s*(?:per month|monthly|a month|month))/
    : locale === 'it'
    ? /(?:(?:affitto mensile|al mese|mensile)\s*(?:di\s*)?(\d[\d.]*)|(\d[\d.]*)\s*(?:al mese|mensile))/
    : /(?:(?:alquiler mensual|al mes|mensual|por mes|renta mensual)\s*(?:de\s*)?(\d[\d.]*)|(\d[\d.]*)\s*(?:al mes|mensual|por mes))/
  const monthlyMatch = normalized.match(monthlyPatterns)
  if (monthlyMatch) {
    const raw = (monthlyMatch[1] || monthlyMatch[2]).replace(/[.,]/g, '')
    const parsed = Number(raw)
    if (!isNaN(parsed) && parsed > 0) {
      criteria.budget_max = parsed
      criteria.is_monthly_budget = true
    }
  }

  // === LOCATION ===
  const cityPattern = new RegExp(`(?:\\b(?:en|de|por|para|in|at|a)\\b\\s+)?(${KNOWN_CITIES.join('|')})`, 'gi')
  const cityMatches = [...normalized.matchAll(cityPattern)]
  const unknownCityPattern = /\b(?:en|in|a)\b\s+([a-záàâäãåéèêëíìîïóòôöõúùûü]{3,20})/gi
  const fallbackCityCandidates = [...normalized.matchAll(unknownCityPattern)]
    .map((m) => ({ token: m[1], index: m.index || 0 }))
    .filter((m) => !isSemanticLocationStopword(m.token))

  if (cityMatches.length > 0 || fallbackCityCandidates.length > 0) {
    const negationWords = ['no ', 'not ', 'non ', 'pero ', 'ma ', 'but ', 'instead ', 'invece ']
    let lastNegationPos = -1
    for (const nw of negationWords) {
      const idx = normalized.lastIndexOf(nw)
      if (idx > lastNegationPos) lastNegationPos = idx
    }

    const allMatches = [
      ...cityMatches.map(m => ({ match: m[1], index: m.index || 0, known: true })),
      ...fallbackCityCandidates.map(m => ({ match: m.token, index: m.index, known: false })),
    ]

    let rawCity: string | undefined
    if (lastNegationPos >= 0) {
      const afterNegation = allMatches.filter(m => m.index > lastNegationPos)
      const preferred = afterNegation.length > 0 ? afterNegation : allMatches
      const knownPreferred = preferred.filter(m => m.known)
      rawCity = (knownPreferred.length > 0 ? knownPreferred[knownPreferred.length - 1] : preferred[preferred.length - 1])?.match
    } else {
      const knownMatches = allMatches.filter(m => m.known)
      rawCity = (knownMatches.length > 0 ? knownMatches[knownMatches.length - 1] : allMatches[allMatches.length - 1])?.match
    }

    if (rawCity) {
      // Use locale-appropriate city names
      const cityMapES: Record<string, string> = {
        'barcelona': 'Barcelona', 'madrid': 'Madrid', 'valencia': 'Valencia', 'sevilla': 'Sevilla',
      'malaga': 'Málaga', 'bilbao': 'Bilbao', 'badajoz': 'Badajoz', 'alicante': 'Alicante',
      'zaragoza': 'Zaragoza', 'murcia': 'Murcia', 'barcellona': 'Barcelona', 'siviglia': 'Sevilla',
      'seville': 'Sevilla', 'paris': 'París', 'london': 'Londres', 'rome': 'Roma', 'roma': 'Roma',
      'milan': 'Milán', 'milano': 'Milán', 'naples': 'Nápoles', 'napoli': 'Nápoles',
      'florence': 'Florencia', 'firenze': 'Florencia',
    }
    const cityMapEN: Record<string, string> = {
      'barcelona': 'Barcelona', 'madrid': 'Madrid', 'valencia': 'Valencia', 'sevilla': 'Seville',
      'malaga': 'Malaga', 'bilbao': 'Bilbao', 'badajoz': 'Badajoz', 'alicante': 'Alicante',
      'zaragoza': 'Zaragoza', 'murcia': 'Murcia', 'barcellona': 'Barcelona', 'siviglia': 'Seville',
      'seville': 'Seville', 'paris': 'Paris', 'london': 'London', 'rome': 'Rome', 'roma': 'Rome',
      'milan': 'Milan', 'milano': 'Milan', 'naples': 'Naples', 'napoli': 'Naples',
      'florence': 'Florence', 'firenze': 'Florence',
    }
    const cityMapIT: Record<string, string> = {
      'barcelona': 'Barcellona', 'madrid': 'Madrid', 'valencia': 'Valencia', 'sevilla': 'Siviglia',
      'malaga': 'Malaga', 'bilbao': 'Bilbao', 'badajoz': 'Badajoz', 'alicante': 'Alicante',
      'zaragoza': 'Saragozza', 'murcia': 'Murcia', 'barcellona': 'Barcellona', 'siviglia': 'Siviglia',
      'seville': 'Siviglia', 'paris': 'Parigi', 'london': 'Londra', 'rome': 'Roma', 'roma': 'Roma',
      'milan': 'Milano', 'milano': 'Milano', 'naples': 'Napoli', 'napoli': 'Napoli',
      'florence': 'Firenze', 'firenze': 'Firenze',
    }
      const cityMap = locale === 'en' ? cityMapEN : locale === 'it' ? cityMapIT : cityMapES
      criteria.city = cityMap[rawCity] || capitalize(rawCity)
    }
  }

  // Subzones
  const subzonePatterns: Array<{ pattern: RegExp; label: (locale: string) => string }> = [
    { pattern: /\b(centro de la ciudad|centro ciudad|centro de|en el centro|downtown|city center|city centre|centre of|center of|centro citta|centro storico|centro di|centro della)\b/, label: (l: string) => l === 'en' ? 'the center' : l === 'it' ? 'il centro' : 'el centro' },
    { pattern: /\b(afueras|outskirts|periferia|periferie)\b/, label: (l: string) => l === 'en' ? 'the outskirts' : l === 'it' ? 'la periferia' : 'las afueras' },
    { pattern: /\b(zona historica|zona storica|historic zone|old town|casco antiguo|casco historico)\b/, label: (l: string) => l === 'en' ? 'the historic zone' : l === 'it' ? 'la zona storica' : 'la zona histórica' },
  ]
  for (const sp of subzonePatterns) {
    if (sp.pattern.test(normalized)) {
      criteria.subzone = sp.label(locale)
      break
    }
  }

  // Spatial relations + landmarks (supports multiple)
  const landmarks: string[] = []
  const spatialRels: string[] = []
  const locationClauses: Array<{ relation: string; landmark: string }> = []

  // Find all spatial relation + landmark pairs
  for (const sp of SPATIAL_TOKENS) {
    let searchFrom = 0
    while (true) {
      const remaining = normalized.substring(searchFrom)
      const relMatch = remaining.match(sp.pattern)
      if (!relMatch) break

      const absIndex = searchFrom + relMatch.index!
      const afterRel = normalized.substring(absIndex + relMatch[0].length).trim()
      let foundLandmark = false
      for (const lm of LANDMARK_TOKENS) {
        if (lm.pattern.test(afterRel)) {
          const label = spatialLabel(sp.token, locale)
          const lmLabel = landmarkLabel(lm.token, locale)
          if (!spatialRels.includes(label)) spatialRels.push(label)
          if (!landmarks.includes(lmLabel)) landmarks.push(lmLabel)
          locationClauses.push({ relation: label, landmark: lmLabel })
          foundLandmark = true
          break
        }
      }
      searchFrom = absIndex + relMatch[0].length + 1
    }
  }

  if (spatialRels.length > 0) criteria.spatial_relations = spatialRels
  if (spatialRels.length > 0 && landmarks.length === 0) {
    // Bare spatial relation without landmark — keep it if it adds context
    criteria.spatial_relation = spatialRels[0]
  }
  if (landmarks.length > 0) {
    criteria.landmarks = landmarks
    criteria.landmark = landmarks[0] // Keep primary for backward compat
  }
  if (locationClauses.length > 0) criteria.location_clauses = locationClauses

  // Also detect standalone landmarks
  if (landmarks.length === 0) {
    for (const lm of LANDMARK_TOKENS) {
      if (lm.pattern.test(normalized)) {
        const lmLabel = landmarkLabel(lm.token, locale)
        if (!landmarks.includes(lmLabel)) landmarks.push(lmLabel)
      }
    }
    if (landmarks.length > 0) {
      criteria.landmarks = landmarks
      criteria.landmark = landmarks[0]
    }
  }

  // Location flexibility
  if (locale === 'en' && /\b(don'?t care about location|anywhere|any location|location doesn'?t matter|flexible location)\b/.test(normalized)) {
    criteria.is_location_flexible = true
  } else if (locale === 'it' && /\b(non mi importa la posizione|ovunque|posizione flessibile|qualsiasi zona)\b/.test(normalized)) {
    criteria.is_location_flexible = true
  } else if (locale === 'es' && /\b(no me importa la ubicaci[oó]n|no me importa la zona|cualquier zona|ubicaci[oó]n flexible|me da igual la ubicaci[oó]n|con que sea)\b/.test(normalized)) {
    criteria.is_location_flexible = true
  }

  // Urgency
  const urgencyPatterns = locale === 'en'
    ? /\b(as soon as possible|urgent|urgently|soon|quickly|this week|asap|immediately)\b/
    : locale === 'it'
    ? /\b(il prima possibile|urgente|subito|questa settimana|immediatamente|presto)\b/
    : /\b(lo m[aá]s pronto posible|urgente|cuanto antes|esta semana|lo antes posible|pronto|inmediatamente)\b/
  if (urgencyPatterns.test(normalized)) criteria.urgency = 'high'

  return criteria
}

export function mergeChatbotCriteria(
  current: ChatbotSearchCriteria | undefined,
  incoming: ChatbotSearchCriteria,
  rawText?: string
): ChatbotSearchCriteria {
  // Detect if the incoming message looks like a correction/clarification
  // rather than a completely new search — based on RAW TEXT, not parsed criteria
  const n = rawText ? normalizeText(rawText) : ''
  const correctionPatterns = [
    /\b(no|pero|mejor|mas|cambia|cambio|prefiero|piu|te he dicho|ya te|antes|en cambio|en vez|al contrario|al reves|no eso|no ese|no esa|mejor no|no quiero|no prefiero|cambialo|cambiala)\b/i,
    /\b(no|ma|meglio|piu|cambia|cambio|preferisco|preferirei|invece|al contrario|non quello|non quella|cambialo|cambiala)\b/i,
    /\b(but|instead|rather|actually|wait|no|not|change|switch|prefer|better)\b/i,
  ]
  const isCorrection = rawText ? correctionPatterns.some(p => p.test(n)) : false
  const isExplicitRestart = rawText ? detectExplicitRestart(rawText) : false

  // Count CORE criteria fields (city, property_type, operation, rooms, bathrooms, budget)
  // vs SUPPLEMENTARY fields (landmarks, logistics, spatial_relations, attributes)
  const coreFieldCount = [
    incoming.property_type, incoming.city, incoming.operation,
    incoming.rooms, incoming.rooms_min, incoming.bathrooms, incoming.bathrooms_min,
    incoming.budget_max,
  ].filter(Boolean).length
  const supplementaryFieldCount = [
    incoming.subzone, incoming.landmark,
    incoming.landmarks?.length, incoming.spatial_relations?.length,
    incoming.attributes?.length, incoming.logistic_attributes?.length,
    incoming.qualitative_attributes?.length,
  ].filter(Boolean).length

  const hasCurrentCore = hasCoreSearchSignal(current)
  const incomingHasCore = hasCoreSearchSignal(incoming)
  const isPartialUpdate = hasCurrentCore && !isExplicitRestart && (
    !incomingHasCore ||
    isCorrection ||
    coreFieldCount + supplementaryFieldCount <= 3
  )
  const shouldPreserveExisting = hasCurrentCore && !isExplicitRestart && (isPartialUpdate || !incomingHasCore)
  const cityChanged = incoming.city !== undefined && incoming.city !== current?.city
  const shouldResetMicroLocation = cityChanged && !incoming.subzone && !incoming.landmark && !incoming.landmarks?.length && !incoming.spatial_relation && !incoming.spatial_relations?.length
  const incomingHasLocationDetail = Boolean(
    incoming.subzone || incoming.landmark || incoming.landmarks?.length || incoming.spatial_relation || incoming.spatial_relations?.length || incoming.location_clauses?.length
  )
  const shouldReplaceLocationDetail = isCorrection && incomingHasLocationDetail

  const mergedLandmarks = shouldResetMicroLocation || shouldReplaceLocationDetail
    ? mergeUniqueStrings(incoming.landmarks, incoming.landmark ? [incoming.landmark] : undefined)
    : mergeUniqueStrings(current?.landmarks, current?.landmark ? [current.landmark] : undefined, incoming.landmarks, incoming.landmark ? [incoming.landmark] : undefined)
  const mergedSpatialRelations = shouldResetMicroLocation || shouldReplaceLocationDetail
    ? mergeUniqueStrings(incoming.spatial_relations, incoming.spatial_relation ? [incoming.spatial_relation] : undefined)
    : mergeUniqueStrings(current?.spatial_relations, current?.spatial_relation ? [current.spatial_relation] : undefined, incoming.spatial_relations, incoming.spatial_relation ? [incoming.spatial_relation] : undefined)
  const mergedLocationClauses = shouldResetMicroLocation || shouldReplaceLocationDetail
    ? mergeLocationClauses(incoming.location_clauses)
    : mergeLocationClauses(current?.location_clauses, incoming.location_clauses)
  const mergedAttributes = mergeUniqueStrings(current?.attributes, incoming.attributes)
  const mergedLogistics = mergeUniqueStrings(current?.logistic_attributes, incoming.logistic_attributes)
  const mergedQualitative = mergeUniqueStrings(current?.qualitative_attributes, incoming.qualitative_attributes)
  const draft: ChatbotSearchCriteria = shouldPreserveExisting ? {
    ...current,
    landmarks: current?.landmarks,
    spatial_relations: current?.spatial_relations,
    attributes: current?.attributes,
    logistic_attributes: current?.logistic_attributes,
    qualitative_attributes: current?.qualitative_attributes,
  } : {}

  for (const mention of buildEntityMentions(incoming)) {
    applyEntityMentionUpdate(draft, current, mention, shouldPreserveExisting, shouldResetMicroLocation)
  }

  draft.region = incoming.region !== undefined ? incoming.region : shouldPreserveExisting ? current?.region : undefined
  draft.country = incoming.country !== undefined ? incoming.country : shouldPreserveExisting ? current?.country : undefined
  draft.subzone = incoming.subzone !== undefined ? incoming.subzone : (shouldResetMicroLocation || shouldReplaceLocationDetail) ? undefined : draft.subzone
  draft.landmarks = mergedLandmarks
  draft.landmark = mergedLandmarks?.[0]
  draft.spatial_relations = mergedSpatialRelations
  draft.spatial_relation = mergedSpatialRelations?.[0]
  draft.location_clauses = mergedLocationClauses
  draft.attributes = mergedAttributes
  draft.logistic_attributes = mergedLogistics
  draft.qualitative_attributes = mergedQualitative
  draft.raw_context = incoming.raw_context || current?.raw_context
  draft.budget_approx = incoming.budget_approx !== undefined ? incoming.budget_approx : current?.budget_approx
  draft.is_monthly_budget = incoming.is_monthly_budget !== undefined ? incoming.is_monthly_budget : current?.is_monthly_budget

  return draft
}

export function detectChatbotDialogueAct(args: {
  currentCriteria?: ChatbotSearchCriteria
  incomingCriteria: ChatbotSearchCriteria
  mergedCriteria: ChatbotSearchCriteria
  rawText: string
  dialogueState?: ChatbotDialogueState
}): ChatbotDialogueAct {
  const { currentCriteria, incomingCriteria, mergedCriteria, rawText, dialogueState } = args
  const normalized = normalizeText(rawText)
  const signals = detectSignalClasses(rawText)
  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length
  const hasCurrentContext = hasUsefulChatbotCriteria(currentCriteria || {})
  const incomingHasCore = hasCoreSearchSignal(incomingCriteria)
  const supplementaryCount = countSupplementarySignals(incomingCriteria)
  const changedCoreField = criteriaChangesCoreField(currentCriteria, incomingCriteria)
  const replacedExistingCoreField = criteriaReplacesExistingCoreField(currentCriteria, incomingCriteria)
  const isExplicitRestart = detectExplicitRestart(rawText)
  const clarificationHints = /\b(es decir|o sea|me refiero|exactamente|mas bien|better said|i mean|cioe|intendo)\b/

  if (isExplicitRestart) return 'restart'

  if (dialogueState?.pending_field && satisfiesPendingField(dialogueState.pending_field, incomingCriteria)) {
    return 'answer_pending'
  }

  if (!hasCurrentContext && hasUsefulChatbotCriteria(mergedCriteria)) {
    return 'new_search'
  }

  if (hasCurrentContext && signals.includes('CORRECTION_SIGNAL') && replacedExistingCoreField) {
    return incomingHasCore && supplementaryCount > 0 ? 'reformulation' : 'correction'
  }

  if (hasCurrentContext && incomingHasCore && replacedExistingCoreField) {
    return supplementaryCount > 0 || wordCount > 6 ? 'reformulation' : 'correction'
  }

  if (hasCurrentContext && (!incomingHasCore && supplementaryCount > 0)) {
    return 'add_constraint'
  }

  if (hasCurrentContext && incomingHasCore) {
    return 'add_constraint'
  }

  if (hasCurrentContext && clarificationHints.test(normalized)) {
    return 'clarification'
  }

  if (hasCurrentContext && wordCount <= 4) {
    return 'short_follow_up'
  }

  return hasUsefulChatbotCriteria(mergedCriteria) ? 'clarification' : 'fallback'
}

function mapDialogueActToConversationAct(dialogueAct: ChatbotDialogueAct): ChatbotConversationAct {
  switch (dialogueAct) {
    case 'new_search': return 'SEARCH_REQUEST'
    case 'correction': return 'CORRECTION'
    case 'clarification': return 'CLARIFICATION'
    case 'add_constraint': return 'ADD_CONSTRAINT'
    case 'reformulation': return 'REFORMULATION'
    case 'answer_pending': return 'ANSWER_TO_PENDING_QUESTION'
    case 'short_follow_up': return 'FOLLOW_UP'
    case 'restart': return 'RESTART'
    case 'fallback': return 'FALLBACK'
    default: return 'FALLBACK'
  }
}

export function interpretChatbotTurn(args: {
  text: string
  locale?: string
  currentCriteria?: ChatbotSearchCriteria
  mergedCriteria: ChatbotSearchCriteria
  dialogueState?: ChatbotDialogueState
}): ChatbotTurnInterpretation {
  const { text, locale = 'es', currentCriteria, mergedCriteria, dialogueState } = args
  const extracted = extractChatbotCriteria(text, locale)
  const dialogueAct = detectChatbotDialogueAct({
    currentCriteria,
    incomingCriteria: extracted,
    mergedCriteria,
    rawText: text,
    dialogueState,
  })
  return {
    raw_text: text,
    locale,
    normalized_text: normalizeText(text),
    conversation_act: mapDialogueActToConversationAct(dialogueAct),
    signal_classes: detectSignalClasses(text, locale),
    entity_mentions: buildEntityMentions(extracted),
    extracted_criteria: extracted,
  }
}

export function buildNextDialogueState(args: {
  previousState?: ChatbotDialogueState
  mergedCriteria: ChatbotSearchCriteria
  activeFlow: ChatbotDialogueState['active_flow']
  lastUserAct: ChatbotDialogueAct
  replyType: 'auto_reply' | 'appointment_suggestion' | 'escalation' | 'fallback'
  replyText: string
  matchesCount?: number
  nextMissingField?: 'operation' | 'city' | 'budget_max' | null
  userText: string
}): ChatbotDialogueState {
  const { previousState, mergedCriteria, activeFlow, lastUserAct, replyType, replyText, matchesCount = 0, nextMissingField, userText } = args
  const turnCount = (previousState?.turn_count || 0) + 1
  const replyVariant = ((previousState?.reply_variant || 0) + 1) % 3

  let lastBotAct: ChatbotDialogueState['last_bot_act'] = 'fallback'
  if (replyType === 'appointment_suggestion') lastBotAct = 'appointment'
  else if (replyType === 'escalation') lastBotAct = 'escalation'
  else if (nextMissingField) lastBotAct = 'ask_missing_field'
  else if (matchesCount > 0) lastBotAct = 'show_matches'
  else if (hasUsefulChatbotCriteria(mergedCriteria)) lastBotAct = 'summarize_search'

  return {
    active_flow: activeFlow,
    last_user_act: lastUserAct,
    last_bot_act: lastBotAct,
    pending_field: nextMissingField || null,
    turn_count: turnCount,
    reply_variant: replyVariant,
    last_user_text: userText,
    last_bot_text: replyText,
  }
}

// Helper: check if incoming has enough fields to be considered a new search
function hasEnoughForNewSearch(incoming: ChatbotSearchCriteria): boolean {
  return !!(incoming.property_type || incoming.city || incoming.operation)
}

export function hasUsefulChatbotCriteria(criteria: ChatbotSearchCriteria): boolean {
  return Boolean(criteria.property_type || criteria.rooms || criteria.city || criteria.subzone || criteria.landmark || criteria.budget_max || criteria.operation)
}

export function detectHumanContactIntent(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'hablar personalmente', 'hablar con una persona', 'hablar con alguien',
    'contactarlos', 'contactar', 'telefono', 'teléfono',
    'horario atienden', 'horario de atencion', 'horario de atención',
    'atencion humana', 'atención humana', 'persona real', 'hablar con un asesor', 'necesito hablar con un asesor',
    'quiero hablar con un agente', 'puedo hablar con un agente', 'hablar con un agente', 'quiero hablar con un asesor', 'puedo hablar con un asesor',
    'real person', 'human agent', 'speak with an advisor', 'talk to an agent', 'speak to an agent', 'human support', 'can i talk to an agent', 'i want to talk to an agent',
    'persona reale', 'operatore umano', 'parlare con un consulente', 'parlare con una persona', 'posso parlare con un agente', 'voglio parlare con un agente',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

export function detectCrmSupportIntent(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'crm', 'reprogramar una cita', 'reagendar una cita', 'reprogramar cita', 'mover una cita',
    'cambiar una cita', 'pipeline', 'lead stage', 'estado del lead', 'registrar una llamada',
    'crear una tarea', 'nota en el crm', 'seguimiento en el crm',
    'reschedule an appointment', 'reschedule a meeting', 'move an appointment in the crm',
    'crm support', 'how do i reprogram',
    'riprogrammare un appuntamento', 'spostare un appuntamento nel crm', 'supporto crm',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

export function detectFinancingIntent(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'hipoteca', 'hipotecas', 'financiacion', 'financiación', 'ayuda con hipoteca',
    'mortgage', 'mortgages', 'financing',
    'mutuo', 'mutui', 'finanziamento',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

export function detectLegalComplexIntent(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'duda legal', 'contratos', 'contrato', 'arras', 'nota simple', 'herencia', 'embargo',
    'legal question', 'contract issue', 'legal doubt',
    'questione legale', 'contratto', 'contratti', 'eredità',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

export function buildFinancingReply(locale = 'es'): { text: string; replyType: 'auto_reply' } {
  if (locale === 'en') return { replyType: 'auto_reply', text: 'Yes, we can help with basic mortgage guidance. If you want, tell me your budget and a comfortable monthly payment and I will orient you from there.' }
  if (locale === 'it') return { replyType: 'auto_reply', text: 'Sì, possiamo orientarti in modo básico con il mutuo. Se vuoi, dimmi budget e rata comoda al mese e ti guido da lì.' }
  return { replyType: 'auto_reply', text: 'Sí, podemos orientarte de forma básica con la hipoteca. Si quieres, dime presupuesto y cuota cómoda al mes y te guío desde ahí.' }
}

export function buildLegalComplexReply(locale = 'es'): { text: string; replyType: 'escalation' } {
  if (locale === 'en') return { replyType: 'escalation', text: 'This looks like a legal or technical question. I prefer to leave it with a specialist so you get a precise answer.' }
  if (locale === 'it') return { replyType: 'escalation', text: 'Questa sembra una questione legale o tecnica. Preferisco lasciarla a un consulente esperto per darti una risposta precisa.' }
  return { replyType: 'escalation', text: 'Eso ya entra en una duda legal o técnica. Prefiero dejarlo a un especialista para darte una respuesta precisa.' }
}

export function buildCrmSupportReply(locale = 'es'): { text: string; replyType: 'auto_reply' } {
  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: 'To reschedule an appointment in the CRM, open the appointment, change the date or time, save it, and confirm the new slot with the client. If you want, tell me what you need to change and I will guide you step by step.',
    }
  }
  if (locale === 'it') {
    return {
      replyType: 'auto_reply',
      text: 'Per riprogrammare un appuntamento nel CRM, apri la ficha, cambia data o ora, salva e conferma il nuovo slot con il cliente. Se vuoi, dimmi cosa devi cambiare e ti guido passo passo.',
    }
  }
  return {
    replyType: 'auto_reply',
    text: 'Para reprogramar una cita en el CRM, abre la ficha, cambia la fecha o la hora, guarda el cambio y confirma el nuevo hueco con el cliente. Si quieres, dime qué parte necesitas cambiar y te guío paso a paso.',
  }
}

export function detectAdminVisibleDataQuestion(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'que dato visible deberia mirar primero', 'qué dato visible debería mirar primero', 'que dato visible debo mirar', 'que dato visible miro primero', 'qué dato visible miro primero', 'que dato visible mirar primero', 'qué dato visible mirar primero', 'que informacion visible revisar primero', 'qué información visible revisar primero', 'que informacion visible me conviene revisar primero', 'qué información visible me conviene revisar primero', 'que dato visible me orienta primero', 'qué dato visible me orienta primero', 'como empezarias a analizar esta pantalla', 'cómo empezarías a analizar esta pantalla',
    'what visible detail should i check first', 'what visible data should i look at first', 'how would you start analyzing this screen',
    'quale dato visibile dovrei guardare per primo', 'quale dato visibile devo guardare', 'come inizieresti ad analizzare questa schermata',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

export function detectAdminKnownScreenQuestion(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'como funciona', 'cómo funciona', 'como funciona eso', 'como funciona esta pantalla', 'como funciona esa pantalla',
    'que es', 'qué es', 'para que sirve', 'para qué sirve', 'como se usa', 'cómo se usa', 'explicame', 'explícame',
    'que hace', 'qué hace', 'como va', 'cómo va', 'como opera', 'cómo opera',
    'how does it work', 'what is this', 'what does it do', 'what is it for', 'how do i use it', 'explain this screen',
    'come funziona', 'cos e', 'cos’è', 'a cosa serve', 'come si usa', 'spiegami questa schermata',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

export function detectAdminStepByStepQuestion(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'paso a paso', 'explicamelo paso a paso', 'explícamelo paso a paso', 'guiame paso a paso', 'guíame paso a paso',
    'step by step', 'walk me through it', 'guide me step by step',
    'passo passo', 'spiegamelo passo passo', 'guidami passo passo',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

export function detectAdminDailyUseQuestion(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'trabajo diario', 'dia a dia', 'día a día', 'en que ayuda cada dia', 'en qué ayuda cada día', 'para el trabajo diario',
    'daily work', 'day to day', 'daily use', 'everyday work',
    'lavoro quotidiano', 'giorno per giorno', 'uso quotidiano',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

function formatAdminActionList(actions: string[], locale: string) {
  const items = actions.slice(0, 4)
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  const conjunction = locale === 'en' ? 'and' : locale === 'it' ? 'y' : 'y'
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
}

function formatKnowledgeList(items: string[] | undefined, limit = 3) {
  return (items || []).filter(Boolean).slice(0, limit)
}

export function buildKnownScreenReply(entry: AppKnowledgeEntry, locale = 'es'): { text: string; replyType: 'auto_reply' } {
  const sections = formatKnowledgeList(entry.sections, 2).join(' y ')
  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: `${entry.title} is the screen for this part of the app. The main visible areas are ${sections || 'the main sections on screen'}, and it is used for the actions tied to that workflow.`,
    }
  }
  return {
    replyType: 'auto_reply',
    text: `${entry.title} es la pantalla para esta parte de la app. Lo principal que vas a ver ahi es ${sections || 'los bloques principales de esa vista'}, y desde ahi se resuelven las acciones de ese flujo.`,
  }
}

export function buildScreenVisibleDataReply(entry: AppKnowledgeEntry, locale = 'es'): { text: string; replyType: 'auto_reply' } {
  const priorityBits = formatKnowledgeList([...(entry.sections || []), ...(entry.filters || []), ...(entry.supportFields || [])], 3)
  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: `${entry.title}: start by checking ${priorityBits.join(', ') || 'the visible label closest to the issue'}. That is the fastest way to narrow down what is happening there.`,
    }
  }
  return {
    replyType: 'auto_reply',
    text: `${entry.title}: empieza revisando ${priorityBits.join(', ') || 'la etiqueta visible mas cercana al problema'}. Es la forma mas rapida de acotar que esta pasando ahi.`,
  }
}

export function buildScreenStepByStepReply(entry: AppKnowledgeEntry, locale = 'es'): { text: string; replyType: 'auto_reply' } {
  const first = entry.sections?.[0] || 'el bloque principal'
  const second = entry.sections?.[1] || entry.filters?.[0] || 'la accion visible que quieras usar'
  const third = entry.actions?.[0] || entry.forms?.[0] || 'la accion correspondiente'
  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: `In ${entry.title}, first review ${first.toLowerCase()}, then move to ${second.toLowerCase()}, and from there use ${third.toLowerCase()} if you need to act.`,
    }
  }
  return {
    replyType: 'auto_reply',
    text: `En ${entry.title}, primero revisa ${first.toLowerCase()}, despues pasa a ${second.toLowerCase()}, y desde ahi usa ${third.toLowerCase()} si necesitas actuar.`,
  }
}

export function buildScreenSupportReply(entry: AppKnowledgeEntry, locale = 'es'): { text: string; replyType: 'auto_reply' } {
  const supportFields = formatKnowledgeList(entry.supportFields || entry.minimumContext || [], 3)
  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: `If we stay on ${entry.title}, tell me which of these you are looking at: ${supportFields.join(', ') || 'the visible block or label involved'}.`,
    }
  }
  return {
    replyType: 'auto_reply',
    text: `Si seguimos en ${entry.title}, dime cual de estos tienes delante: ${supportFields.join(', ') || 'el bloque o la etiqueta visible implicada'}.`,
  }
}

function isPanelGlobalEntry(entry: AppKnowledgeEntry) {
  return entry.route === '/admin' && normalizeText(entry.title) === 'panel global'
}

function getPanelGlobalFocus(entry: AppKnowledgeEntry) {
  return {
    overview: entry.sections[0] || 'Tarjetas de Tenants, Operativos, Incidencias y Usuarios facturables',
    table: entry.sections[1] || 'Tabla de tenants con Tenant, Estado tenant, Plan actual, Suscripción, Usuarios facturables, ¿Puede crear más? y Operativo',
    create: entry.sections[2] || 'Crear tenant',
  }
}

export function buildAdminKnownScreenReply(entry: AppKnowledgeEntry, locale = 'es'): { text: string; replyType: 'auto_reply' } {
  if (isPanelGlobalEntry(entry)) {
    if (locale === 'en') {
      return {
        replyType: 'auto_reply',
        text: 'Panel global is the superadmin view to monitor tenants and act on their commercial or operational state. The key visible pieces are the top cards, the tenants table, and Create tenant if you need to open a new account.',
      }
    }
    if (locale === 'it') {
      return {
        replyType: 'auto_reply',
        text: 'Panel global es la vista de superadmin para controlar tenants y actuar sobre su estado comercial u operativo. Lo visible que mas manda son las tarjetas superiores, la tabla de tenants y Crear tenant si necesitas dar de alta uno nuevo.',
      }
    }
    return {
      replyType: 'auto_reply',
      text: 'Panel global es la vista de superadmin para controlar tenants y actuar sobre su estado comercial u operativo. Lo visible que mas manda son las tarjetas superiores, la tabla de tenants y Crear tenant si necesitas dar de alta uno nuevo.',
    }
  }

  const actions = formatAdminActionList(entry.actions, locale)

  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: `${entry.title} is the workspace for this part of the admin. It is mainly used to review what is happening there and handle actions like ${actions}. If you want, I can walk you through it step by step.`,
    }
  }

  if (locale === 'it') {
    return {
      replyType: 'auto_reply',
      text: `${entry.title} e la pantalla de trabajo para esta parte del admin. Sirve sobre todo para revisar lo que pasa ahi y hacer acciones como ${actions}. Se vuoi, te lo spiego passo passo.`,
    }
  }

  return {
    replyType: 'auto_reply',
    text: `${entry.title} es la pantalla de trabajo para esta parte del admin. Sirve sobre todo para revisar lo que pasa ahi y gestionar acciones como ${actions}. Si quieres, te lo explico paso a paso.`,
  }
}

export function buildAdminStepByStepReply(entry: AppKnowledgeEntry, locale = 'es'): { text: string; replyType: 'auto_reply' } {
  if (isPanelGlobalEntry(entry)) {
    const focus = getPanelGlobalFocus(entry)
    if (locale === 'en') {
      return {
        replyType: 'auto_reply',
        text: `In Panel global, first check ${focus.overview.toLowerCase()}. Then go to ${focus.table.toLowerCase()} to confirm the tenant row you care about, and only after that use ${focus.create.toLowerCase()} or the row actions if you need to change something.`,
      }
    }
    if (locale === 'it') {
      return {
        replyType: 'auto_reply',
        text: 'En Panel global, primero mira las tarjetas Tenants, Operativos, Incidencias y Usuarios facturables. Despues baja a la tabla y revisa la fila del tenant en Tenant, Estado tenant, Plan actual, Suscripción, Usuarios facturables y Operativo. Si necesitas actuar, usa Crear tenant o las acciones de esa fila.',
      }
    }
    return {
      replyType: 'auto_reply',
      text: 'En Panel global, primero mira las tarjetas Tenants, Operativos, Incidencias y Usuarios facturables. Despues baja a la tabla y revisa la fila del tenant en Tenant, Estado tenant, Plan actual, Suscripción, Usuarios facturables y Operativo. Si necesitas actuar, usa Crear tenant o las acciones de esa fila.',
    }
  }

  const firstAction = entry.actions[0] || 'revisar el bloque principal'
  const secondAction = entry.actions[1] || 'hacer la accion principal'

  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: `In ${entry.title}, start by reviewing the main block, then continue with ${firstAction.toLowerCase()} and ${secondAction.toLowerCase()}. If you want, tell me which part you have open and I will continue from there.`,
    }
  }

  if (locale === 'it') {
    return {
      replyType: 'auto_reply',
      text: `En ${entry.title}, primero revisa el bloque principal y luego sigue con ${firstAction.toLowerCase()} y ${secondAction.toLowerCase()}. Si quieres, dime que parte tienes abierta y sigo desde ahi.`,
    }
  }

  return {
    replyType: 'auto_reply',
    text: `En ${entry.title}, primero revisa el bloque principal y luego sigue con ${firstAction.toLowerCase()} y ${secondAction.toLowerCase()}. Si quieres, dime que parte tienes abierta y sigo desde ahi.`,
  }
}

export function buildAdminDailyUseReply(entry: AppKnowledgeEntry, locale = 'es'): { text: string; replyType: 'auto_reply' } {
  if (isPanelGlobalEntry(entry)) {
    if (locale === 'en') {
      return {
        replyType: 'auto_reply',
        text: 'In daily work, Panel global helps you see how many tenants are fine, where there are issues, and which tenant needs a change in plan, subscription, suspension, or reactivation.',
      }
    }
    if (locale === 'it') {
      return {
        replyType: 'auto_reply',
        text: 'En el trabajo diario, Panel global te sirve para ver cuantos tenants estan bien, donde hay incidencias y que tenant necesita revisar Estado tenant, Plan actual, Suscripción, Usuarios facturables u Operativo.',
      }
    }
    return {
      replyType: 'auto_reply',
      text: 'En el trabajo diario, Panel global te sirve para ver cuantos tenants estan bien, donde hay incidencias y que tenant necesita revisar Estado tenant, Plan actual, Suscripción, Usuarios facturables u Operativo.',
    }
  }

  const actions = formatAdminActionList(entry.actions, locale)

  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: `In day-to-day work, ${entry.title} helps you keep this area under control and act quickly with things like ${actions}. It is useful when you need to review status and move on the next admin action.`,
    }
  }

  if (locale === 'it') {
    return {
      replyType: 'auto_reply',
      text: `En el trabajo diario, ${entry.title} sirve para tener esta parte bajo control y moverte rapido con acciones como ${actions}. Va bien cuando necesitas revisar el estado y pasar a la siguiente accion del admin.`,
    }
  }

  return {
    replyType: 'auto_reply',
    text: `En el trabajo diario, ${entry.title} sirve para tener esta parte bajo control y moverte rapido con acciones como ${actions}. Va bien cuando necesitas revisar el estado y pasar a la siguiente accion del admin.`,
  }
}

export function buildAdminVisibleDataReply(locale = 'es', entry?: AppKnowledgeEntry | null): { text: string; replyType: 'auto_reply' } {
  if (entry) {
    if (isPanelGlobalEntry(entry)) {
      if (locale === 'en') {
        return {
          replyType: 'auto_reply',
          text: 'In Panel global, start with the top cards: Tenants, Operativos, Incidencias, and Usuarios facturables. They tell you right away whether the issue is volume, operational health, incidents, or user capacity.',
        }
      }
      if (locale === 'it') {
        return {
          replyType: 'auto_reply',
          text: 'En Panel global, empieza por las tarjetas de arriba: Tenants, Operativos, Incidencias y Usuarios facturables. Ahi ves enseguida si el problema va de volumen, salud operativa, incidencias o capacidad de usuarios.',
        }
      }
      return {
        replyType: 'auto_reply',
        text: 'En Panel global, empieza por las tarjetas de arriba: Tenants, Operativos, Incidencias y Usuarios facturables. Ahi ves enseguida si el problema va de volumen, salud operativa, incidencias o capacidad de usuarios.',
      }
    }

    if (locale === 'en') {
      return {
        replyType: 'auto_reply',
        text: `If we stay on ${entry.title}, start with the part where the issue appears and the nearest visible label. With that reference I can narrow it down without making things up.`,
      }
    }
    if (locale === 'it') {
      return {
        replyType: 'auto_reply',
        text: `Se restiamo su ${entry.title}, guarda prima il bloque dove vedi il problema e l'etichetta visibile piu vicina. Con questo riferimento posso orientarti senza inventare niente.`,
      }
    }
    return {
      replyType: 'auto_reply',
      text: `Si seguimos con ${entry.title}, mira primero el bloque donde ves el problema y la etiqueta visible mas cercana. Con esa referencia puedo acotarlo sin inventar nada.`,
    }
  }

  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: 'Start with the exact screen title and the closest visible label related to the issue. With those two references I can guide you safely.',
    }
  }
  if (locale === 'it') {
    return {
      replyType: 'auto_reply',
      text: 'Guarda prima il titolo esatto della schermata e poi l’etichetta visibile più vicina al problema. Con questi due riferimenti posso orientarti in modo sicuro.',
    }
  }
  return {
    replyType: 'auto_reply',
    text: 'Mira primero el título exacto de la pantalla y después la etiqueta visible más cercana al problema. Con esas dos referencias puedo orientarte con seguridad.',
  }
}

export function buildAdminSupportReply(locale = 'es', entry?: AppKnowledgeEntry | null): { text: string; replyType: 'auto_reply' } {
  if (entry) {
    if (isPanelGlobalEntry(entry)) {
      if (locale === 'en') {
        return {
          replyType: 'auto_reply',
          text: 'If we stay on Panel global, the next useful check is usually the tenant row in the table: status, plan, subscription, billable users, and operational. Tell me which of those you want to read first.',
        }
      }
      if (locale === 'it') {
        return {
          replyType: 'auto_reply',
          text: 'Si seguimos en Panel global, lo siguiente mas util suele ser la fila del tenant en la tabla: Estado tenant, Plan actual, Suscripción, Usuarios facturables y Operativo. Dime cual de esos quieres revisar primero.',
        }
      }
      return {
        replyType: 'auto_reply',
        text: 'Si seguimos en Panel global, lo siguiente mas util suele ser la fila del tenant en la tabla: Estado tenant, Plan actual, Suscripción, Usuarios facturables y Operativo. Dime cual de esos quieres revisar primero.',
      }
    }

    if (locale === 'en') {
      return {
        replyType: 'auto_reply',
        text: `If we are still on ${entry.title}, I keep that context and can help from there. Tell me what you want to understand or what is failing, and I guide you without inventing screens or actions.`,
      }
    }
    if (locale === 'it') {
      return {
        replyType: 'auto_reply',
        text: `Se stiamo ancora su ${entry.title}, mantengo quel contesto e ti aiuto da li. Dimmi cosa vuoi capire o cosa non ti torna e ti guido senza inventare schermate o azioni.`,
      }
    }
    return {
      replyType: 'auto_reply',
      text: `Si seguimos en ${entry.title}, mantengo ese contexto y te ayudo desde ahi. Dime que quieres entender o que no te cuadra y te guio sin inventar pantallas ni acciones.`,
    }
  }

  if (locale === 'en') {
    return {
      replyType: 'auto_reply',
      text: 'I can help with CRM operational questions from this admin view. Tell me the exact screen title and the closest visible label, and I will guide you without inventing internal structure.',
    }
  }
  if (locale === 'it') {
    return {
      replyType: 'auto_reply',
      text: 'Posso aiutarti con dubbi operativi del CRM da questa vista admin. Dimmi il titolo esatto della schermata e l’etichetta visibile più vicina, e ti guiderò senza inventare struttura interna.',
    }
  }
  return {
    replyType: 'auto_reply',
    text: 'Puedo ayudarte con dudas operativas del CRM desde esta vista admin. Dime el título exacto de la pantalla y la etiqueta visible más cercana, y te orientaré sin inventar estructura interna.',
  }
}

export function detectSellerIntent(text: string): boolean {
  const normalized = normalizeText(text)
  return [
    'vender mi piso', 'vender mi casa', 'vender una propiedad',
    'quiero vender', 'necesito vender', 'valoracion', 'valoración',
    'tasacion', 'tasación', 'captacion', 'captación', 'propietario',
  ].some((phrase) => normalized.includes(normalizeText(phrase)))
}

export function shouldStayInPropertyFlow(args: {
  incomingCriteria: ChatbotSearchCriteria
  mergedCriteria: ChatbotSearchCriteria
  baseIntent: IntentType
  text: string
  dialogueState?: ChatbotDialogueState
}): boolean {
  const { incomingCriteria, mergedCriteria, baseIntent, text, dialogueState } = args
  if (detectHumanContactIntent(text)) return false
  if (detectSellerIntent(text)) return false
  if (baseIntent === 'human_help' || baseIntent === 'complaint') return false
  if (dialogueState?.active_flow === 'property_search') {
    if (hasUsefulChatbotCriteria(mergedCriteria)) return true
    if (dialogueState.pending_field && satisfiesPendingField(dialogueState.pending_field, incomingCriteria)) return true
  }
  if (hasUsefulChatbotCriteria(incomingCriteria)) return true
  // Multi-turn: if merged criteria already has useful data and the message is
  // short or looks like a correction/clarification, treat it as a continuation
  if (hasUsefulChatbotCriteria(mergedCriteria)) {
    const wordCount = text.trim().split(/\s+/).length
    const isShort = wordCount <= 8
    const n = normalizeText(text)
    const isCorrection = /\b(no|pero|mejor|mas|cambia|cambio|en|con|te he dicho|ya te|antes|prefiero|piu|pero|mejor|mas|cambia|mejor no|no quiero|no prefiero|cambialo|cambiala|ma|meglio|piu|cambia|cambio|preferisco|invece|but|instead|rather|actually|wait|no|not|change|switch|prefer|better)\b/.test(n)
    if (isShort || isCorrection) return true
  }
  return baseIntent === 'property_interest' && hasUsefulChatbotCriteria(mergedCriteria)
}

export function buildSellerHelpReply(): { text: string; replyType: 'auto_reply' } {
  return {
    replyType: 'auto_reply',
    text: 'Sí, te puedo ayudar con la venta. Para orientarte bien, dime primero la zona del inmueble y si tienes una tasación reciente.',
  }
}

export function buildHumanContactReply(locale = 'es'): { text: string; replyType: 'escalation' } {
  if (locale === 'en') {
    return {
      replyType: 'escalation',
      text: 'Perfect. I will leave this conversation marked for human follow-up so an advisor can continue with you here as soon as possible.',
    }
  }
  if (locale === 'it') {
    return {
      replyType: 'escalation',
      text: 'Perfetto. Lascio questa conversazione segnata per un follow-up umano cosi un consulente puo continuare con te qui il prima possibile.',
    }
  }
  return {
    replyType: 'escalation',
    text: 'Perfecto, voy a dejar esta conversación marcada para seguimiento humano para que un asesor siga contigo por aquí cuanto antes.',
  }
}

export function formatCurrencyES(amount: number, locale = 'es'): string {
  if (locale === 'en') return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function getNextMissingField(criteria: ChatbotSearchCriteria): 'operation' | 'city' | 'budget_max' | null {
  if (!criteria.operation) return 'operation'
  if (!criteria.city && !criteria.is_location_flexible) return 'city'
  return null
}

function formatList(items: string[], locale: string): string {
  if (items.length <= 1) return items[0] || ''
  const conjunction = locale === 'en' ? 'and' : locale === 'it' ? 'e' : 'y'
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
}

function buildLocationText(criteria: ChatbotSearchCriteria, locale: string): string {
  const { city, subzone, landmark, landmarks, spatial_relation, spatial_relations, is_location_flexible, location_clauses } = criteria
  if (is_location_flexible && !city && !subzone && !landmark && (!landmarks?.length)) {
    return locale === 'en' ? ' anywhere' : locale === 'it' ? ' ovunque' : ' en cualquier ubicación'
  }

  const parts: string[] = []
  const allLandmarks = landmarks || (landmark ? [landmark] : [])
  const allSpatialRels = spatial_relations || (spatial_relation ? [spatial_relation] : [])
  const clauses = location_clauses || []

  const formatClause = (relation: string, lm: string) => {
    if (locale === 'it') {
      const contracted = lm.replace(/^la /, 'alla ').replace(/^il /, 'allo ').replace(/^l'/, "all'")
      return `${relation} ${contracted}`
    }
    if (locale === 'es') {
      return `${relation} ${lm}`.replace(/ de el /g, ' del ').replace(/ a el /g, ' al ')
    }
    return `${relation} ${lm}`
  }

  if (city) {
    if (subzone && clauses.length > 0) {
      const clauseText = formatList(clauses.map((clause) => formatClause(clause.relation, clause.landmark)), locale)
      if (locale === 'it') {
        const cleanSub = subzone.replace('il ', '').replace('la ', '')
        const article = cleanSub === 'centro' ? 'nel' : cleanSub === 'periferia' ? 'nella' : 'nel'
        parts.push(` ${article} ${cleanSub} di ${city} ${clauseText}`)
      } else if (locale === 'en') {
        parts.push(` in ${subzone} of ${city} ${clauseText}`)
      } else {
        parts.push(` en ${subzone} de ${city} ${clauseText}`)
      }
    } else if (clauses.length > 0) {
      const clauseText = formatList(clauses.map((clause) => formatClause(clause.relation, clause.landmark)), locale)
      const locPrefix = locale === 'en' ? ` in ${city}` : locale === 'it' ? ` a ${city}` : ` en ${city}`
      parts.push(`${locPrefix} ${clauseText}`)
    } else if (subzone) {
      if (locale === 'it') {
        const cleanSub = subzone.replace('il ', '').replace('la ', '')
        const article = cleanSub === 'centro' ? 'nel' : cleanSub === 'periferia' ? 'nella' : 'nel'
        parts.push(` ${article} ${cleanSub} di ${city}`)
      } else if (locale === 'en') {
        parts.push(` in ${subzone} of ${city}`)
      } else {
        parts.push(` en ${subzone} de ${city}`)
      }
    } else if (allLandmarks.length > 0) {
      // City + landmarks (with or without spatial relations)
      if (allSpatialRels.length > 0) {
        const landmarkTexts = allLandmarks.map((lm, i) => formatClause(allSpatialRels[i] || allSpatialRels[0], lm))
        const locPrefix = locale === 'en' ? ` in ${city}` : locale === 'it' ? ` a ${city}` : ` en ${city}`
        parts.push(`${locPrefix} ${formatList(landmarkTexts, locale)}`)
      } else {
        // City + landmarks without explicit spatial relation
        if (locale === 'it') {
          const contractedLandmarks = allLandmarks.map(lm => lm.replace(/^la /, 'alla ').replace(/^il /, 'allo ').replace(/^l'/, "all'"))
          parts.push(` a ${city} vicino ${contractedLandmarks.join(', ')}`)
        } else if (locale === 'en') {
          parts.push(` in ${city} near ${allLandmarks.join(', ')}`)
        } else {
          parts.push(` en ${city}, cerca de ${allLandmarks.join(', ')}`)
        }
      }
    } else if (allSpatialRels.length > 0) {
      if (locale === 'it') {
        parts.push(` a ${city} ${allSpatialRels.join(', ')}`)
      } else if (locale === 'en') {
        parts.push(` in ${city} ${allSpatialRels.join(', ')}`)
      } else {
        parts.push(` en ${city} ${allSpatialRels.join(', ')}`)
      }
    } else {
      parts.push(locale === 'en' ? ` in ${city}` : locale === 'it' ? ` a ${city}` : ` en ${city}`)
    }
  } else if (subzone) {
    if (locale === 'it') {
      const cleanSub = subzone.replace('il ', '').replace('la ', '')
      const article = cleanSub === 'centro' ? 'nel' : cleanSub === 'periferia' ? 'nella' : 'nel'
      parts.push(` ${article} ${cleanSub}`)
    } else {
      parts.push(locale === 'en' ? ` in ${subzone}` : ` en ${subzone}`)
    }
  } else if (allLandmarks.length > 0) {
    if (clauses.length > 0) {
      parts.push(` ${formatList(clauses.map((clause) => formatClause(clause.relation, clause.landmark)), locale)}`)
    } else if (allSpatialRels.length > 0) {
      const landmarkTexts = allLandmarks.map((lm, i) => formatClause(allSpatialRels[i] || allSpatialRels[0], lm))
      parts.push(` ${formatList(landmarkTexts, locale)}`)
    } else {
      parts.push(locale === 'en' ? ` near ${allLandmarks.join(', ')}` : locale === 'it' ? ` vicino ${allLandmarks.join(', ')}` : ` cerca de ${allLandmarks.join(', ')}`)
    }
  } else if (allSpatialRels.length > 0) {
    parts.push(` ${allSpatialRels.join(', ')}`)
  }

  if (is_location_flexible && city) {
    parts.push(locale === 'en' ? ' or nearby' : locale === 'it' ? ' o dintorni' : ' o alrededores')
  }

  return parts.join('')
}

function buildAttributesText(criteria: ChatbotSearchCriteria, locale: string): string {
  if (!criteria.attributes?.length) return ''
  const attrList = formatList(criteria.attributes, locale)
  return locale === 'en' ? ` with ${attrList}` : locale === 'it' ? ` con ${attrList}` : ` con ${attrList}`
}

function buildLogisticText(criteria: ChatbotSearchCriteria, locale: string): string {
  if (!criteria.logistic_attributes?.length) return ''
  const transportLandmarks = new Set([
    'el metro', 'the metro', 'la metropolitana',
    'la estación', 'the station', 'la stazione',
  ])
  const landmarks = criteria.landmarks || (criteria.landmark ? [criteria.landmark] : [])
  const hasTransportLandmark = landmarks.some((item) => transportLandmarks.has(item))
  const filtered = criteria.logistic_attributes.filter((item) => {
    if (!hasTransportLandmark) return true
    return !['cerca de transporte', 'near transport', 'vicino ai trasporti'].includes(item)
  })
  if (filtered.length === 0) return ''
  if (locale === 'es') {
    const connectivity = filtered.filter((item) => item === 'buena conexión')
    const proximity = filtered.filter((item) => item !== 'buena conexión')
    const pieces: string[] = []
    if (proximity.length > 0) pieces.push(formatList(proximity, locale))
    if (connectivity.length > 0) pieces.push('con buena conexión')
    return pieces.length > 0 ? `, ${pieces.join(' y ')}` : ''
  }
  const list = formatList(filtered, locale)
  return `, ${list}`
}

function buildQualitativeText(criteria: ChatbotSearchCriteria, locale: string): string {
  if (!criteria.qualitative_attributes?.length) return ''
  const qualList = formatList(criteria.qualitative_attributes, locale)
  return locale === 'en' ? `, ${qualList}` : locale === 'it' ? `, ${qualList}` : `, ${qualList}`
}

function buildOperationLead(criteria: ChatbotSearchCriteria, locale: string): string {
  if (criteria.operation === 'sale') {
    return locale === 'en' ? 'buy' : locale === 'it' ? 'comprare' : 'comprar'
  }
  if (criteria.operation === 'rent') {
    return locale === 'en' ? 'rent' : locale === 'it' ? 'affittare' : 'alquilar'
  }
  return locale === 'en' ? 'find' : locale === 'it' ? 'trovare' : 'encontrar'
}

function buildSearchClause(criteria: ChatbotSearchCriteria, locale: string, description: string): string {
  if (!criteria.operation) {
    if (locale === 'en') return `You're looking for ${description}`
    if (locale === 'it') return `Cerchi ${description}`
    return `Buscas ${description}`
  }

  const operationLead = buildOperationLead(criteria, locale)
  if (locale === 'en') return `You want to ${operationLead} ${description}`
  if (locale === 'it') return `Vuoi ${operationLead} ${description}`
  return `Quieres ${operationLead} ${description}`
}

function describeChangedField(criteria: ChatbotSearchCriteria, previous: ChatbotSearchCriteria | undefined, locale: string): string | null {
  if (criteria.city && criteria.city !== previous?.city) {
    return locale === 'en' ? `the area to ${criteria.city}` : locale === 'it' ? `la zona su ${criteria.city}` : `la zona a ${criteria.city}`
  }
  if (criteria.operation && criteria.operation !== previous?.operation) {
    return locale === 'en'
      ? criteria.operation === 'rent' ? 'the operation to rent' : 'the operation to buy'
      : locale === 'it'
      ? criteria.operation === 'rent' ? 'l\'operazione su affitto' : 'l\'operazione su vendita'
      : criteria.operation === 'rent' ? 'la operación a alquiler' : 'la operación a compra'
  }
  if (criteria.property_type && criteria.property_type !== previous?.property_type) {
    return locale === 'en' ? 'the property type' : locale === 'it' ? 'la tipologia' : 'el tipo de inmueble'
  }
  if (criteria.budget_max !== undefined && criteria.budget_max !== previous?.budget_max) {
    return locale === 'en' ? 'the budget' : locale === 'it' ? 'il budget' : 'el presupuesto'
  }
  return null
}

function addedLocationDetail(criteria: ChatbotSearchCriteria, previous: ChatbotSearchCriteria | undefined): boolean {
  return Boolean(
    (criteria.subzone && criteria.subzone !== previous?.subzone) ||
    (criteria.landmark && criteria.landmark !== previous?.landmark) ||
    (criteria.logistic_attributes?.length || 0) > (previous?.logistic_attributes?.length || 0)
  )
}

function addedCapacityDetail(criteria: ChatbotSearchCriteria, previous: ChatbotSearchCriteria | undefined): boolean {
  return Boolean(
    (criteria.rooms !== undefined && criteria.rooms !== previous?.rooms) ||
    (criteria.rooms_min !== undefined && criteria.rooms_min !== previous?.rooms_min) ||
    (criteria.bathrooms !== undefined && criteria.bathrooms !== previous?.bathrooms) ||
    (criteria.bathrooms_min !== undefined && criteria.bathrooms_min !== previous?.bathrooms_min)
  )
}

function addedAttributeDetail(criteria: ChatbotSearchCriteria, previous: ChatbotSearchCriteria | undefined): boolean {
  return Boolean(
    (criteria.attributes?.length || 0) > (previous?.attributes?.length || 0) ||
    (criteria.qualitative_attributes?.length || 0) > (previous?.qualitative_attributes?.length || 0)
  )
}

function buildReplyLead(args: {
  locale: string
  dialogueAct?: ChatbotDialogueAct
  nextMissing?: 'operation' | 'city' | 'budget_max' | null
  previousCriteria?: ChatbotSearchCriteria
  criteria: ChatbotSearchCriteria
}): string {
  const { locale, dialogueAct, previousCriteria, criteria } = args
  const changed = describeChangedField(criteria, previousCriteria, locale)

  if (locale === 'en') {
    switch (dialogueAct) {
      case 'correction': return 'Understood.'
      case 'reformulation': return 'All right.'
      case 'add_constraint': return 'Perfect.'
      case 'answer_pending': return 'Perfect.'
      case 'clarification': return 'Understood.'
      case 'short_follow_up': return 'All right.'
      case 'restart': return 'Perfect.'
      default: return 'Understood.'
    }
  }

  if (locale === 'it') {
    switch (dialogueAct) {
      case 'correction': return 'Capito.'
      case 'reformulation': return 'Va bene.'
      case 'add_constraint': return 'Perfetto.'
      case 'answer_pending': return 'Perfetto.'
      case 'clarification': return 'Capito.'
      case 'short_follow_up': return 'Va bene.'
      case 'restart': return 'Perfetto.'
      default: return 'Capito.'
    }
  }

  switch (dialogueAct) {
    case 'correction': return 'De acuerdo.'
    case 'reformulation': return 'De acuerdo.'
    case 'add_constraint':
      if (addedLocationDetail(criteria, previousCriteria)) return 'Perfecto.'
      if (addedCapacityDetail(criteria, previousCriteria)) return 'Perfecto.'
      if (addedAttributeDetail(criteria, previousCriteria)) return 'Perfecto.'
      return 'Perfecto.'
    case 'answer_pending': return 'Perfecto.'
    case 'clarification': return 'Entendido.'
    case 'short_follow_up': return 'Vale.'
    case 'restart': return 'Perfecto.'
    default: return 'Entendido.'
  }
}

function buildMissingFieldQuestion(
  locale: string,
  missingField: 'operation' | 'city' | 'budget_max'
): string {
  if (locale === 'en') {
    if (missingField === 'operation') return 'Are you looking to buy or rent?'
    if (missingField === 'city') return 'Which area or city should I focus on?'
    return 'What budget range would you like me to keep in mind?'
  }
  if (locale === 'it') {
    if (missingField === 'operation') return 'Cerchi in vendita o in affitto?'
    if (missingField === 'city') return 'Su quale zona o città devo concentrarmi?'
    return 'Quale budget vuoi che tenga come riferimento?'
  }
  if (missingField === 'operation') return '¿Lo buscas para compra o para alquiler?'
  if (missingField === 'city') return '¿En qué ciudad o zona concreta quieres que me centre?'
  return '¿Qué rango de presupuesto quieres que tenga en cuenta?'
}

function buildNoMatchClosing(criteria: ChatbotSearchCriteria, locale: string): string {
  if (criteria.urgency === 'high') {
    if (locale === 'en') return 'Since timing matters here, the most useful next step is to open the area or the budget slightly so we can surface realistic alternatives sooner.'
    if (locale === 'it') return 'Dato che il tempo conta, il passo piu utile e aprire un po zona o budget per far emergere alternative realistiche prima.'
    return 'Como aquí el tiempo importa, lo más útil ahora es abrir un poco la zona o el presupuesto para que aparezcan alternativas realistas antes.'
  }

  if (criteria.subzone || criteria.landmark || criteria.logistic_attributes?.length) {
    if (locale === 'en') return 'The most restrictive part seems to be the location detail, so if you want I can widen the area a little without touching the rest.'
    if (locale === 'it') return 'La parte piu restrictiva parece la ubicazione fina, quindi se vuoi posso allargare un po la zona senza toccare il resto.'
    return 'Da la impresión de que ahora mismo lo que más limita la búsqueda es ese nivel de detalle en la zona, así que, si te parece, puedo abrir un poco el radio sin tocar lo demás.'
  }

  if (criteria.budget_max !== undefined) {
    if (locale === 'en') return 'The budget may be what is tightening the search most, so I can review that next if you want.'
    if (locale === 'it') return 'Il budget potrebbe essere il punto che piu stringe la ricerca, quindi se vuoi possiamo revisar quello subito dopo.'
    return 'Es posible que el presupuesto esté apretando bastante la búsqueda, así que, si te parece, revisamos ese punto a continuación.'
  }

  if (criteria.property_type) {
    if (locale === 'en') return 'If you want, I can keep the same area and budget but open the property type a bit to look for real alternatives.'
    if (locale === 'it') return 'Se vuoi, posso mantenere zona e budget ma aprire un po la tipologia per cercare alternative reali.'
    return 'Si quieres, puedo mantener la zona y el presupuesto y abrir un poco el tipo de inmueble para ver alternativas reales.'
  }

  if (locale === 'en') return 'If you want, I can narrow the next step to one thing only: area, budget, or property type.'
  if (locale === 'it') return 'Se vuoi, il prossimo passo puo concentrarsi solo su una cosa: zona, budget o tipologia.'
  return 'Si quieres, podemos centrarnos solo en una cosa para seguir afinando: zona, presupuesto o tipo de inmueble.'
}

function buildNoMatchSentence(criteria: ChatbotSearchCriteria, locale: string): string {
  if (criteria.subzone || criteria.landmark || criteria.logistic_attributes?.length) {
    if (locale === 'en') return 'Right now I am not seeing a clear option that fits that level of location detail.'
    if (locale === 'it') return 'In questo momento non vedo una soluzione chiara che regga con questo livello di detalle sulla zona.'
    return 'Ahora mismo no veo una opción clara que encaje con ese nivel de detalle en la zona.'
  }
  if (criteria.budget_max !== undefined && criteria.property_type) {
    if (locale === 'en') return 'Right now I do not see a clear property that fits both the type and the budget as they stand.'
    if (locale === 'it') return 'Al momento non vedo un immobile chiaro che regga insieme tipo e budget tal como estan.'
    return 'Ahora mismo no veo un inmueble que encaje bien con el tipo y el presupuesto tal como están planteados.'
  }
  if (locale === 'en') return 'Right now I do not see a clear match with the search as it stands.'
  if (locale === 'it') return 'Al momento non vedo una corrispondenza chiara con la ricerca cosi come queda.'
  return 'Ahora mismo no veo una coincidencia clara con la búsqueda tal como está planteada.'
}

function buildMatchSentence(matchesCount: number, matchTitles: string[], locale: string): string {
  const sample = matchTitles.slice(0, 2)
  if (locale === 'en') {
    if (matchesCount === 1) return `Here I do see a property that fits quite well${sample[0] ? `: ${sample[0]}` : ''}.`
    return `Here I already see ${matchesCount} options that make sense${sample.length ? `, such as ${sample.join(' and ')}` : ''}.`
  }
  if (locale === 'it') {
    if (matchesCount === 1) return `Qui invece vedo una soluzione che ha senso${sample[0] ? `: ${sample[0]}` : ''}.`
    return `Qui vedo gia ${matchesCount} opzioni plausibili${sample.length ? `, per esempio ${sample.join(' e ')}` : ''}.`
  }
  if (matchesCount === 1) return `Aquí sí veo una opción que encaja bastante bien${sample[0] ? `: ${sample[0]}` : ''}.`
  return `Aquí ya veo ${matchesCount} opciones que pueden encajar bien${sample.length ? `, por ejemplo ${sample.join(' y ')}` : ''}.`
}

function buildMatchClosing(locale: string): string {
  if (locale === 'en') return 'If you want, I can narrow the search a bit more or move straight to arranging a visit.'
  if (locale === 'it') return 'Se vuoi, posso stringere ancora un po la ricerca o passare direttamente a organizzare una visita.'
  return 'Si quieres, puedo afinar un poco más la búsqueda o pasar directamente a organizar una visita.'
}

function buildPropertyTypeLabel(criteria: ChatbotSearchCriteria, locale: string): string {
  if (criteria.property_type === 'house') return locale === 'en' ? 'house' : locale === 'it' ? 'casa' : 'casa'
  if (criteria.property_type === 'apartment') return locale === 'en' ? 'apartment' : locale === 'it' ? 'appartamento' : 'apartamento'
  if (criteria.property_type === 'penthouse') return locale === 'en' ? 'penthouse' : locale === 'it' ? 'attico' : 'ático'
  return locale === 'en' ? 'property' : locale === 'it' ? 'immobile' : 'inmueble'
}

function buildDeltaSegments(
  criteria: ChatbotSearchCriteria,
  previous: ChatbotSearchCriteria | undefined,
  locale: string
): string[] {
  const parts: string[] = []

  if (criteria.city && criteria.city !== previous?.city) {
    parts.push(locale === 'en' ? `Let's focus on ${criteria.city} instead` : locale === 'it' ? `allora ci concentriamo su ${criteria.city}` : `de acuerdo, nos centramos en ${criteria.city}`)
  }

  if (criteria.operation && criteria.operation !== previous?.operation) {
    const opText = criteria.operation === 'rent'
      ? (locale === 'en' ? 'rent' : locale === 'it' ? 'affitto' : 'alquiler')
      : (locale === 'en' ? 'buy' : locale === 'it' ? 'vendita' : 'compra')
    parts.push(locale === 'en' ? `Then we look at it as a ${opText}` : locale === 'it' ? `allora lo planteamos como ${opText}` : `de acuerdo, lo enfocamos como ${opText}`)
  }

  if (criteria.property_type && criteria.property_type !== previous?.property_type) {
    parts.push(locale === 'en' ? `That fits better with a ${buildPropertyTypeLabel(criteria, locale)}` : locale === 'it' ? `encaja meglio con un ${buildPropertyTypeLabel(criteria, locale)}` : `por ese lado encaja mejor un ${buildPropertyTypeLabel(criteria, locale)}`)
  }

  if (criteria.budget_max !== undefined && criteria.budget_max !== previous?.budget_max) {
    const budget = formatCurrencyES(criteria.budget_max, locale)
    const budgetText = criteria.is_monthly_budget
      ? (locale === 'en' ? `${budget} euros per month` : locale === 'it' ? `${budget} euro al mese` : `${budget} euros al mes`)
      : (locale === 'en' ? `${budget} euros` : locale === 'it' ? `${budget} euro` : `${budget} euros`)
    parts.push(locale === 'en' ? `We can work with a budget up to ${budgetText}` : locale === 'it' ? `podemos movernos con un budget fino a ${budgetText}` : `perfecto, nos movemos con un presupuesto de hasta ${budgetText}`)
  }

  if (criteria.rooms !== undefined && criteria.rooms !== previous?.rooms) {
    parts.push(locale === 'en' ? `I will keep ${criteria.rooms} bedrooms in mind` : locale === 'it' ? `tengo presenti anche ${criteria.rooms} camere` : `perfecto, tengo en cuenta también que tenga ${criteria.rooms} habitaciones`)
  } else if (criteria.rooms_min !== undefined && criteria.rooms_min !== previous?.rooms_min) {
    parts.push(locale === 'en' ? `I will keep at least ${criteria.rooms_min} bedrooms in mind` : locale === 'it' ? `tengo presentes al menos ${criteria.rooms_min} camere` : `perfecto, tengo en cuenta también que tenga al menos ${criteria.rooms_min} habitaciones`)
  }

  if (criteria.bathrooms !== undefined && criteria.bathrooms !== previous?.bathrooms) {
    parts.push(locale === 'en' ? `I will keep ${criteria.bathrooms} bathrooms in mind too` : locale === 'it' ? `tengo presenti anche ${criteria.bathrooms} bagni` : `perfecto, tengo en cuenta también que tenga ${criteria.bathrooms} baños`)
  } else if (criteria.bathrooms_min !== undefined && criteria.bathrooms_min !== previous?.bathrooms_min) {
    parts.push(locale === 'en' ? `I will keep at least ${criteria.bathrooms_min} bathrooms in mind too` : locale === 'it' ? `tengo presenti anche almeno ${criteria.bathrooms_min} bagni` : `perfecto, tengo en cuenta también que tenga al menos ${criteria.bathrooms_min} baños`)
  }

  if ((criteria.logistic_attributes?.length || 0) > (previous?.logistic_attributes?.length || 0)) {
    const newItems = (criteria.logistic_attributes || []).filter(item => !(previous?.logistic_attributes || []).includes(item))
    if (newItems.length > 0) {
      parts.push(locale === 'en' ? `I will also look for something ${formatList(newItems, locale)}` : locale === 'it' ? `buscaré anche qualcosa ${formatList(newItems, locale)}` : `perfecto, buscaré también algo ${formatList(newItems, locale)}`)
    }
  }

  if ((criteria.attributes?.length || 0) > (previous?.attributes?.length || 0)) {
    const newItems = (criteria.attributes || []).filter(item => !(previous?.attributes || []).includes(item))
    if (newItems.length > 0) {
      parts.push(locale === 'en' ? `I will also keep ${formatList(newItems, locale)} as a preference` : locale === 'it' ? `tengo también ${formatList(newItems, locale)} come preferenza` : `perfecto, tengo también ${formatList(newItems, locale)} como preferencia`)
    }
  }

  return parts.slice(0, 2)
}

function buildDeltaResponse(
  criteria: ChatbotSearchCriteria,
  previous: ChatbotSearchCriteria | undefined,
  locale: string
): string | null {
  const segments = buildDeltaSegments(criteria, previous, locale)
  if (segments.length === 0) return null
  if (segments.length === 1) return capitalize(segments[0]) + '.'
  if (locale === 'en') return capitalize(`${segments[0]}, and ${segments[1]}.`)
  if (locale === 'it') return capitalize(`${segments[0]} e inoltre ${segments[1]}.`)
  return capitalize(`${segments[0]} y además ${segments[1]}.`)
}

function buildCompactSnapshot(criteria: ChatbotSearchCriteria, locale: string): string {
  const type = buildPropertyTypeLabel(criteria, locale)
  const detailText = buildLocationText({
    city: criteria.city,
    subzone: criteria.subzone,
    landmark: criteria.landmark,
    landmarks: criteria.landmarks,
    spatial_relation: criteria.spatial_relation,
    spatial_relations: criteria.spatial_relations,
    location_clauses: criteria.location_clauses,
    is_location_flexible: criteria.is_location_flexible,
  }, locale)
  const op = criteria.operation
    ? (criteria.operation === 'rent'
      ? (locale === 'en' ? 'for rent' : locale === 'it' ? 'en alquiler' : 'en alquiler')
      : (locale === 'en' ? 'to buy' : locale === 'it' ? 'para compra' : 'para compra'))
    : ''
  if (locale === 'en') return `For now, I am looking at a ${type}${detailText}${op ? ` ${op}` : ''}`
  if (locale === 'it') return `Per ora sto guardando un ${type}${detailText}${op ? ` ${op}` : ''}`
  return `De momento, estoy buscando un ${type}${detailText}${op ? ` ${op}` : ''}`
}

function chooseReplyMode(args: {
  dialogueAct?: ChatbotDialogueAct
  nextMissing?: 'operation' | 'city' | 'budget_max' | null
  matchesCount: number
  previousCriteria?: ChatbotSearchCriteria
  criteria: ChatbotSearchCriteria
}): 'delta' | 'delta_plus_action' | 'question' | 'result_first' | 'full_summary' {
  const { dialogueAct, nextMissing, matchesCount, previousCriteria, criteria } = args
  const hasDelta = buildDeltaSegments(criteria, previousCriteria, 'es').length > 0
  if (nextMissing) return 'question'
  if (matchesCount > 0 && (dialogueAct === 'correction' || dialogueAct === 'add_constraint' || dialogueAct === 'answer_pending')) return 'result_first'
  if (dialogueAct === 'correction' || dialogueAct === 'add_constraint' || dialogueAct === 'clarification' || dialogueAct === 'answer_pending' || dialogueAct === 'short_follow_up') {
    return hasDelta ? 'delta_plus_action' : 'delta'
  }
  if (dialogueAct === 'reformulation') return 'full_summary'
  return 'full_summary'
}

export function buildChatbotPropertyReply(args: {
  criteria: ChatbotSearchCriteria
  previousCriteria?: ChatbotSearchCriteria
  matchesCount: number
  matchTitles?: string[]
  locale?: string
  dialogueAct?: ChatbotDialogueAct
  dialogueState?: ChatbotDialogueState
}): { text: string; replyType: 'auto_reply' | 'fallback' } {
  const { criteria, previousCriteria, matchesCount, matchTitles = [], locale = 'es', dialogueAct, dialogueState } = args
  const nextMissing = getNextMissingField(criteria)
  const budget = criteria.budget_max ? formatCurrencyES(criteria.budget_max, locale) : null
  const locationText = buildLocationText(criteria, locale)
  const attributesText = buildAttributesText(criteria, locale)
  const logisticText = buildLogisticText(criteria, locale)
  const qualitativeText = buildQualitativeText(criteria, locale)

  const urgencyNote = criteria.urgency === 'high'
    ? (locale === 'en' ? ', and you need it as soon as possible' : locale === 'it' ? ', e ti serve il prima possibile' : ', y te interesa encontrarlo cuanto antes')
    : ''

  const propType = criteria.property_type === 'apartment'
    ? (locale === 'en' ? 'an apartment' : locale === 'it' ? 'un appartamento' : 'un apartamento')
    : criteria.property_type === 'house'
    ? (locale === 'en' ? 'a house' : locale === 'it' ? 'una casa' : 'una casa')
    : (locale === 'en' ? 'a property' : locale === 'it' ? 'una proprietà' : 'una propiedad')

  // Rooms — preserves ranges and minimums
  let roomsText = ''
  if (criteria.rooms_comparator === 'range' && criteria.rooms_min && criteria.rooms_max) {
    roomsText = locale === 'en' ? ` with ${criteria.rooms_min} to ${criteria.rooms_max} bedrooms` : locale === 'it' ? ` con ${criteria.rooms_min} a ${criteria.rooms_max} camere` : ` de ${criteria.rooms_min} a ${criteria.rooms_max} habitaciones`
  } else if (criteria.rooms_comparator === 'min' && criteria.rooms_min) {
    roomsText = locale === 'en' ? ` with at least ${criteria.rooms_min} bedrooms` : locale === 'it' ? ` con almeno ${criteria.rooms_min} camere` : ` con al menos ${criteria.rooms_min} habitaciones`
  } else if (criteria.rooms) {
    roomsText = locale === 'en' ? ` with ${criteria.rooms} bedrooms` : locale === 'it' ? ` con ${criteria.rooms} camere` : ` de ${criteria.rooms} habitaciones`
  }

  // Bathrooms — preserves ranges and minimums
  let bathText = ''
  const bathPrefix = roomsText ? (locale === 'en' ? ' and ' : locale === 'it' ? ' e ' : ' y ') : (locale === 'en' ? ' with ' : locale === 'it' ? ' con ' : ' con ')
  if (criteria.bathrooms_comparator === 'range' && criteria.bathrooms_min && criteria.bathrooms_max) {
    bathText = locale === 'en' ? `${bathPrefix}${criteria.bathrooms_min} to ${criteria.bathrooms_max} bathrooms` : locale === 'it' ? `${bathPrefix}${criteria.bathrooms_min} a ${criteria.bathrooms_max} bagni` : `${bathPrefix}${criteria.bathrooms_min} a ${criteria.bathrooms_max} baños`
  } else if (criteria.bathrooms_comparator === 'min' && criteria.bathrooms_min) {
    bathText = locale === 'en' ? `${bathPrefix}at least ${criteria.bathrooms_min} bathrooms` : locale === 'it' ? `${bathPrefix}almeno ${criteria.bathrooms_min} bagni` : `${bathPrefix}al menos ${criteria.bathrooms_min} baños`
  } else if (criteria.bathrooms) {
    bathText = locale === 'en' ? `${bathPrefix}${criteria.bathrooms} bathrooms` : locale === 'it' ? `${bathPrefix}${criteria.bathrooms} bagni` : `${bathPrefix}${criteria.bathrooms} baños`
  }

  // Budget — preserves approximate nature and monthly vs purchase
  let budgetText = ''
  if (budget) {
    if (criteria.budget_approx) {
      budgetText = locale === 'en' ? ` around ${budget} euros` : locale === 'it' ? ` circa ${budget} euro` : `, alrededor de ${budget} euros`
    } else if (criteria.is_monthly_budget) {
      budgetText = locale === 'en' ? ` with a monthly budget of ${budget} euros` : locale === 'it' ? ` con un budget mensile di ${budget} euro` : `, con un presupuesto mensual de ${budget} euros`
    } else {
      budgetText = locale === 'en' ? ` with a maximum budget of ${budget} euros` : locale === 'it' ? ` con un budget massimo di ${budget} euro` : `, con un presupuesto máximo de ${budget} euros`
    }
  }

  const fullDescription = `${propType}${roomsText}${bathText}${attributesText}${qualitativeText}${locationText}${logisticText}${budgetText}${urgencyNote}`
  const searchClause = buildSearchClause(criteria, locale, fullDescription)
  const lead = buildReplyLead({ locale, dialogueAct, nextMissing, previousCriteria, criteria })
  const deltaText = buildDeltaResponse(criteria, previousCriteria, locale)
  const compactSnapshot = buildCompactSnapshot(criteria, locale)
  const replyMode = chooseReplyMode({ dialogueAct, nextMissing, matchesCount, previousCriteria, criteria })
  const hasPriorContext = hasUsefulChatbotCriteria(previousCriteria || {})

  // === ENGLISH ===
  if (locale === 'en') {
    if (nextMissing === 'operation') {
      const base = dialogueAct === 'answer_pending' && deltaText ? deltaText : `${lead} ${compactSnapshot}.`
      return { replyType: 'auto_reply', text: `${base} ${buildMissingFieldQuestion(locale, nextMissing)}` }
    }
    if (nextMissing === 'city' || nextMissing === 'budget_max') {
      const base = hasPriorContext && deltaText ? deltaText : `${lead} ${compactSnapshot}.`
      return { replyType: 'auto_reply', text: `${base} ${buildMissingFieldQuestion(locale, nextMissing)}` }
    }
    if (matchesCount > 0) {
      if (replyMode === 'result_first') {
        return { replyType: 'auto_reply', text: `${buildMatchSentence(matchesCount, matchTitles, locale)} ${deltaText || compactSnapshot + '.'} ${buildMatchClosing(locale)}` }
      }
      return { replyType: 'auto_reply', text: `${lead} ${searchClause}. ${buildMatchSentence(matchesCount, matchTitles, locale)} ${buildMatchClosing(locale)}` }
    }
    if (replyMode === 'delta_plus_action' && deltaText) {
      return { replyType: 'auto_reply', text: `${deltaText} ${buildNoMatchSentence(criteria, locale)} ${buildNoMatchClosing(criteria, locale)}` }
    }
    return { replyType: 'auto_reply', text: `${lead} ${searchClause}. ${buildNoMatchSentence(criteria, locale)} ${buildNoMatchClosing(criteria, locale)}` }
  }

  // === ITALIAN ===
  if (locale === 'it') {
    if (nextMissing === 'operation') {
      const base = dialogueAct === 'answer_pending' && deltaText ? deltaText : `${lead} ${compactSnapshot}.`
      return { replyType: 'auto_reply', text: `${base} ${buildMissingFieldQuestion(locale, nextMissing)}` }
    }
    if (nextMissing === 'city' || nextMissing === 'budget_max') {
      const base = hasPriorContext && deltaText ? deltaText : `${lead} ${compactSnapshot}.`
      return { replyType: 'auto_reply', text: `${base} ${buildMissingFieldQuestion(locale, nextMissing)}` }
    }
    if (matchesCount > 0) {
      if (replyMode === 'result_first') {
        return { replyType: 'auto_reply', text: `${buildMatchSentence(matchesCount, matchTitles, locale)} ${deltaText || compactSnapshot + '.'} ${buildMatchClosing(locale)}` }
      }
      return { replyType: 'auto_reply', text: `${lead} ${searchClause}. ${buildMatchSentence(matchesCount, matchTitles, locale)} ${buildMatchClosing(locale)}` }
    }
    if (replyMode === 'delta_plus_action' && deltaText) {
      return { replyType: 'auto_reply', text: `${deltaText} ${buildNoMatchSentence(criteria, locale)} ${buildNoMatchClosing(criteria, locale)}` }
    }
    return { replyType: 'auto_reply', text: `${lead} ${searchClause}. ${buildNoMatchSentence(criteria, locale)} ${buildNoMatchClosing(criteria, locale)}` }
  }

  // === SPANISH (default) ===
  if (nextMissing === 'operation') {
    const base = dialogueAct === 'answer_pending' && deltaText ? deltaText : `${lead} ${compactSnapshot}.`
    return { replyType: 'auto_reply', text: `${base} ${buildMissingFieldQuestion(locale, nextMissing)}` }
  }

  if (nextMissing === 'city' || nextMissing === 'budget_max') {
    const base = hasPriorContext && deltaText ? deltaText : `${lead} ${compactSnapshot}.`
    return { replyType: 'auto_reply', text: `${base} ${buildMissingFieldQuestion(locale, nextMissing)}` }
  }

  if (matchesCount > 0) {
    if (replyMode === 'result_first') {
      return { replyType: 'auto_reply', text: `${buildMatchSentence(matchesCount, matchTitles, locale)} ${deltaText || compactSnapshot + '.'} ${buildMatchClosing(locale)}` }
    }
    return { replyType: 'auto_reply', text: `${lead} ${searchClause}. ${buildMatchSentence(matchesCount, matchTitles, locale)} ${buildMatchClosing(locale)}` }
  }

  if (replyMode === 'delta_plus_action' && deltaText) {
    return { replyType: 'auto_reply', text: `${deltaText} ${buildNoMatchSentence(criteria, locale)} ${buildNoMatchClosing(criteria, locale)}` }
  }

  return { replyType: 'auto_reply', text: `${lead} ${searchClause}. ${buildNoMatchSentence(criteria, locale)} ${buildNoMatchClosing(criteria, locale)}` }
}

function capitalize(text: string) {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

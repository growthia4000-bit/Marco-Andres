import type { ChatbotDialogueState, ChatbotSearchCriteria } from './chatbot-engine'

export type PropertyTurnAct =
  | 'SEARCH_REQUEST'
  | 'CORRECTION'
  | 'ADD_CONSTRAINT'
  | 'REFORMULATION'
  | 'HARD_RESET'
  | 'ANSWER_TO_PENDING_QUESTION'
  | 'FOLLOW_UP'
  | 'RESTART'
  | 'FALLBACK'

export interface PropertyTurnInterpretation {
  act: PropertyTurnAct
  patch: ChatbotSearchCriteria
  missing: 'operation' | 'city' | null
}

export interface ConcretePropertyRecord {
  id: string
  title: string
  city: string | null
  address: string | null
  property_type: string | null
  deal_type: string | null
  price: number | null
  rooms: number | null
  status?: string | null
}

const KNOWN_LOCATIONS = [
  'madrid', 'barcelona', 'valencia', 'sevilla', 'malaga', 'bilbao', 'roma', 'rome', 'milano', 'milan', 'napoli', 'naples', 'paris', 'london', 'londra'
]

const NUMBER_WORDS: Record<string, number> = {
  cero: 0, zero: 0,
  un: 1, uno: 1, una: 1, one: 1,
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

const PROPERTY_TYPE_PATTERNS = {
  apartment: /\b(apartamento|apartamentos|piso|pisos|departamento|departamentos|depto|deptos|apartment|apartments|flat|flats|condo|condos|appartamento|appartamenti)\b/,
  house: /\b(casa|casas|chalet|chalets|villa|villas|house|houses|home|homes|villetta|villette)\b/,
  penthouse: /\b(atico|ático|penthouse|attico)\b/,
  commercial: /\b(local|oficina|commercial|ufficio|shop|retail|negozio)\b/,
  land: /\b(terreno|solar|parcela|land|plot|lotto|terreno)\b/,
}

const GENERIC_PROPERTY_PATTERN = /\b(vivienda|inmueble|propiedad|property|immobile|casa o piso|vivienda para vivir)\b/

const LOGISTIC_SIGNALS = [
  { pattern: /\b(colegios?|escuelas?|schools?|scuole)\b/, es: 'cerca de colegios', en: 'near schools', it: 'vicino a scuole' },
  { pattern: /\b(supermercados?|supermarkets?|supermercati)\b/, es: 'cerca de supermercados', en: 'near supermarkets', it: 'vicino a supermercati' },
  { pattern: /\b(transport(e)?|metro|tren|train|bus|autobus|trasporti|metropolitana)\b/, es: 'cerca de transporte', en: 'near transport', it: 'vicino ai trasporti' },
  { pattern: /\b(servicios?(?: basicos?)?|basic services|servizi(?: di base)?|hospital|clinic|clinica|farmacia)\b/, es: 'cerca de servicios básicos', en: 'near basic services', it: 'vicino a servizi di base' },
  { pattern: /\b(conexion|conexión|connection|connessione)\b/, es: 'buena conexión', en: 'good connection', it: 'buona connessione' },
]

const ATTRIBUTE_SIGNALS = [
  { pattern: /\b(jardin|jard[ií]n|garden|giardino)\b/, es: 'jardín', en: 'garden', it: 'giardino' },
  { pattern: /\b(terraza|terrace|terrazza)\b/, es: 'terraza', en: 'terrace', it: 'terrazza' },
  { pattern: /\b(garaje|parking|parcheggio)\b/, es: 'garaje', en: 'parking', it: 'parcheggio' },
  { pattern: /\b(piscina|pool)\b/, es: 'piscina', en: 'pool', it: 'piscina' },
]

const QUALITATIVE_SIGNALS = [
  { pattern: /\b(tranquila|tranquilo|quiet|tranquilla|tranquillo)\b/, es: 'zona tranquila', en: 'quiet area', it: 'zona tranquilla' },
  { pattern: /\b(luminosa|bright|luminos[oa])\b/, es: 'luminosa', en: 'bright', it: 'luminosa' },
]

const LANDMARK_SIGNALS = [
  { pattern: /\bmetro\b/, es: 'el metro', en: 'the metro', it: 'la metropolitana' },
  { pattern: /\bestacion|estación|station|stazione\b/, es: 'la estación', en: 'the station', it: 'la stazione' },
  { pattern: /\bplaya|beach|spiaggia\b/, es: 'la playa', en: 'the beach', it: 'la spiaggia' },
  { pattern: /\bhospital|clinic|clinica|ospedale\b/, es: 'el hospital', en: 'the hospital', it: "l'ospedale" },
  { pattern: /\buniversidad|university|universita\b/, es: 'la universidad', en: 'the university', it: "l'università" },
]

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizePropertyDealType(dealType: string | null | undefined): 'sale' | 'rent' | null {
  const normalized = normalize(String(dealType || '')).trim()
  if (!normalized) return null
  if (['rent', 'rental', 'lease', 'alquiler', 'affitto', 'in affitto'].includes(normalized)) return 'rent'
  if (['sale', 'buy', 'venta', 'vendita', 'in vendita'].includes(normalized)) return 'sale'
  return null
}

export function propertyMatchesOperation(dealType: string | null | undefined, operation: ChatbotSearchCriteria['operation'] | undefined) {
  if (!operation) return true
  return normalizePropertyDealType(dealType) === operation
}

function normalizeLoose(text: string) {
  return normalize(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function uniq(values: string[] | undefined, extra: string[] | undefined) {
  const merged = [...(values || []), ...(extra || [])]
  return merged.length ? [...new Set(merged)] : undefined
}

function parseNumber(token?: string) {
  if (!token) return undefined
  const normalized = normalize(token)
  if (/^\d+$/.test(normalized)) return Number(normalized)
  return NUMBER_WORDS[normalized]
}

function wordNumberPattern(locale: string) {
  if (locale === 'en') return 'one|two|three|four|five|six|seven|eight|nine|ten'
  if (locale === 'it') return 'un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci'
  return 'un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|due|tre|quattro|cinque'
}

function quantityToken(locale: string) {
  return `(\\d+|${wordNumberPattern(locale)})`
}

function detectOperation(normalized: string): ChatbotSearchCriteria['operation'] | undefined {
  if (/\b(alquiler|alquilar|rent|rental|lease|affitto|affittare|in affitto)\b/.test(normalized)) return 'rent'
  if (/\b(compra|comprar|buy|purchase|in vendita|vendita|comprare)\b/.test(normalized)) return 'sale'
  return undefined
}

function detectProperty(normalized: string, locale: string): Pick<ChatbotSearchCriteria, 'property_type' | 'property_label'> {
  for (const [type, pattern] of Object.entries(PROPERTY_TYPE_PATTERNS)) {
    if (pattern.test(normalized)) return { property_type: type as ChatbotSearchCriteria['property_type'] }
  }
  if (GENERIC_PROPERTY_PATTERN.test(normalized)) {
    return { property_label: locale === 'en' ? 'property' : locale === 'it' ? 'immobile' : 'vivienda' }
  }
  return {}
}

function stripResetPhrases(text: string): string {
  return text
    .replace(/\b(olvida la busqueda anterior|olvida la búsqueda anterior|ignora la busqueda previa|ignora la búsqueda previa|empecemos de nuevo|nueva busqueda|nueva búsqueda|cambia completamente la busqueda|cambia completamente la búsqueda|ya no quiero eso|forget the previous search|new search|ignore the previous search|ignora la ricerca precedente|nuova ricerca|adesso cerco altro)\b[\s:,.]*/gi, '')
    .trim()
}

function detectRoomsAndBaths(normalized: string, locale: string): Pick<ChatbotSearchCriteria, 'rooms' | 'rooms_min' | 'rooms_comparator' | 'bathrooms' | 'bathrooms_min' | 'bathrooms_comparator'> {
  const qty = quantityToken(locale)
  const result: Pick<ChatbotSearchCriteria, 'rooms' | 'rooms_min' | 'rooms_comparator' | 'bathrooms' | 'bathrooms_min' | 'bathrooms_comparator'> = {}
  const roomsMin = normalized.match(new RegExp(`(?:al menos|at least|almeno)\\s*${qty}\\s*(?:habitaciones?|bedrooms?|camere?)`))
  const roomsExact = normalized.match(new RegExp(`${qty}\\s*(?:habitaciones?|bedrooms?|camere?)`))
  const bathsMin = normalized.match(new RegExp(`(?:al menos|at least|almeno)\\s*${qty}\\s*(?:banos?|bathrooms?|bagni)`))
  const bathsExact = normalized.match(new RegExp(`${qty}\\s*(?:banos?|bathrooms?|bagni)`))
  if (roomsMin) {
    result.rooms_min = parseNumber(roomsMin[1])
    result.rooms = result.rooms_min
    result.rooms_comparator = 'min'
  } else if (roomsExact) {
    result.rooms = parseNumber(roomsExact[1])
    result.rooms_comparator = 'exact'
  }
  if (bathsMin) {
    result.bathrooms_min = parseNumber(bathsMin[1])
    result.bathrooms = result.bathrooms_min
    result.bathrooms_comparator = 'min'
  } else if (bathsExact) {
    result.bathrooms = parseNumber(bathsExact[1])
    result.bathrooms_comparator = 'exact'
  }
  return result
}

function detectBudget(normalized: string): Pick<ChatbotSearchCriteria, 'budget_max' | 'is_monthly_budget'> {
  const monthly = normalized.match(/(?:budget|presupuesto|budget|hasta|maximo|maximum|up to)?\s*(\d[\d.,]*)\s*(?:al mes|mensual|per month|monthly|al mese)/)
  if (monthly) return { budget_max: Number(monthly[1].replace(/[.,]/g, '')), is_monthly_budget: true }
  const max = normalized.match(/(?:budget|presupuesto|maximo|maximum|up to|hasta|massimo)\s*(?:de|of|di)?\s*(\d[\d.,]*)/)
  if (max) return { budget_max: Number(max[1].replace(/[.,]/g, '')) }
  const standalone = normalized.match(/\b(\d{3,7})\b/)
  if (standalone && Number(standalone[1]) >= 1000) return { budget_max: Number(standalone[1]) }
  return {}
}

function detectBroadArea(normalized: string): Pick<ChatbotSearchCriteria, 'search_area' | 'location_scope' | 'is_location_flexible'> {
  const match = normalized.match(/(?:alrededores de|zona de|area de|surroundings of|around|dintorni di|zona di|por)\s+([a-z\s]{3,40}?)(?=(?:\s+(?:con|with|y|and|e|budget|presupuesto|maximo|maximum|hasta|habitaciones|bedrooms|camere|banos|bathrooms|bagni)|[,.]|$))/)
  if (!match) return {}
  const area = match[1].replace(/\s+y\s+alrededores$/, '').replace(/^(la zona de|zona de)\s+/, '').trim()
  return {
    search_area: area,
    location_scope: /alrededores|surroundings|dintorni|around/.test(match[0]) ? 'surroundings' : 'broad',
    is_location_flexible: true,
  }
}

function detectHardReset(normalized: string): boolean {
  return /\b(olvida la busqueda anterior|olvida la búsqueda anterior|ignora la busqueda previa|ignora la búsqueda previa|empecemos de nuevo|nueva busqueda|nueva búsqueda|cambia completamente la busqueda|cambia completamente la búsqueda|ya no quiero eso|forget the previous search|start over|new search|ignore the previous search|ignora la ricerca precedente|nuova ricerca|adesso cerco altro)\b/.test(normalized)
}

function detectExactLocation(raw: string, normalized: string, broadArea?: string): Pick<ChatbotSearchCriteria, 'city'> {
  if (broadArea) return {}
  for (const location of KNOWN_LOCATIONS) {
    if (new RegExp(`\\b${location}\\b`, 'i').test(normalized)) {
      return { city: location.charAt(0).toUpperCase() + location.slice(1) }
    }
  }
  const exact = raw.match(/(?:en|in|a)\s+([A-ZÁÉÍÓÚ][\p{L}\s'-]{2,40})/u)
  if (exact) return { city: exact[1].trim() }
  return {}
}

function detectSubzone(normalized: string, locale: string): Pick<ChatbotSearchCriteria, 'subzone'> {
  if (/\b(en el centro|centro historico|casco antiguo|downtown|city center|centro storico)\b/.test(normalized)) {
    return { subzone: locale === 'en' ? 'the center' : locale === 'it' ? 'il centro' : 'el centro' }
  }
  if (/\b(afueras|outskirts|periferia)\b/.test(normalized)) {
    return { subzone: locale === 'en' ? 'the outskirts' : locale === 'it' ? 'la periferia' : 'las afueras' }
  }
  return {}
}

function detectSpatialDetail(normalized: string, locale: string): Pick<ChatbotSearchCriteria, 'landmark' | 'landmarks' | 'spatial_relation' | 'spatial_relations' | 'location_clauses'> {
  const clauses: Array<{ relation: string; landmark: string }> = []
  const relation = locale === 'en' ? 'near' : locale === 'it' ? 'vicino a' : 'cerca de'
  if (!/\b(cerca de|cerca del|cerca de la|near|vicino a|vicino ai|vicino alla|junto a|next to|accanto a)\b/.test(normalized)) return {}
  for (const lm of LANDMARK_SIGNALS) {
    if (lm.pattern.test(normalized)) {
      const label = locale === 'en' ? lm.en : locale === 'it' ? lm.it : lm.es
      clauses.push({ relation, landmark: label })
    }
  }
  if (!clauses.length) return {}
  return {
    landmark: clauses[0].landmark,
    landmarks: clauses.map((c) => c.landmark),
    spatial_relation: relation,
    spatial_relations: [relation],
    location_clauses: clauses,
  }
}

function detectLogistics(normalized: string, locale: string): Pick<ChatbotSearchCriteria, 'logistic_attributes'> {
  const matches: string[] = []
  for (const signal of LOGISTIC_SIGNALS) {
    if (signal.pattern.test(normalized)) {
      matches.push(locale === 'en' ? signal.en : locale === 'it' ? signal.it : signal.es)
    }
  }
  return matches.length ? { logistic_attributes: [...new Set(matches)] } : {}
}

function detectAttributes(normalized: string, locale: string): Pick<ChatbotSearchCriteria, 'attributes' | 'qualitative_attributes'> {
  const attrs: string[] = []
  const quals: string[] = []
  for (const signal of ATTRIBUTE_SIGNALS) if (signal.pattern.test(normalized)) attrs.push(locale === 'en' ? signal.en : locale === 'it' ? signal.it : signal.es)
  for (const signal of QUALITATIVE_SIGNALS) if (signal.pattern.test(normalized)) quals.push(locale === 'en' ? signal.en : locale === 'it' ? signal.it : signal.es)
  return {
    ...(attrs.length ? { attributes: [...new Set(attrs)] } : {}),
    ...(quals.length ? { qualitative_attributes: [...new Set(quals)] } : {}),
  }
}

function detectUrgency(normalized: string): Pick<ChatbotSearchCriteria, 'urgency'> {
  return /\b(urgente|cuanto antes|asap|urgent|subito|prima possibile)\b/.test(normalized) ? { urgency: 'high' } : {}
}

export function isResultQuestion(text: string): boolean {
  const normalized = normalize(text).trim()
  const hasQuestionShape = /\?/.test(text) || /^(que|qué|cual|cuál|como|cómo|donde|dónde|where|what|how|which|quanto|quale|che|dove)\b/.test(normalized)
  if (!hasQuestionShape) return false
  return /\b(precio|cuanto cuesta|cuanto vale|direccion|direccion exacta|zona exacta|ubicacion exacta|que zona|en que zona|detalles|mas informacion|más informacion|superficie|metros|price|address|where is it|what area|details|tell me more|prezzo|quanto costa|indirizzo|dove si trova|che zona|vicino a|cerca de|near|playa|beach|metro|colegios|schools|services|servicios)\b/.test(normalized)
}

function interpretAct(text: string, patch: ChatbotSearchCriteria, current: ChatbotSearchCriteria | undefined, dialogueState?: ChatbotDialogueState): PropertyTurnAct {
  const normalized = normalize(text)
  if (detectHardReset(normalized)) return 'HARD_RESET'
  if (/\b(empezar de nuevo|start over|da zero)\b/.test(normalized)) return 'RESTART'
  if (dialogueState?.pending_field) {
    if (dialogueState.pending_field === 'operation' && patch.operation) return 'ANSWER_TO_PENDING_QUESTION'
    if (dialogueState.pending_field === 'city' && (patch.city || patch.search_area)) return 'ANSWER_TO_PENDING_QUESTION'
  }
  if (/\b(no|mejor|instead|rather|invece|meglio|en realidad|prefiero|prefer|preferisco)\b/.test(normalized)) {
    const changes = Object.keys(patch).length
    return changes > 2 ? 'REFORMULATION' : 'CORRECTION'
  }
  if (current && patch.search_area && (current.city || current.subzone || current.landmark || current.location_clauses?.length)) {
    return 'REFORMULATION'
  }
  if (current && patch.property_label && !patch.property_type && current.property_type) {
    return 'REFORMULATION'
  }
  if (current) {
    const replacesCore = Boolean(
      (patch.property_type && patch.property_type !== current.property_type) ||
      (patch.city && patch.city !== current.city) ||
      (patch.search_area && patch.search_area !== current.search_area) ||
      (patch.operation && patch.operation !== current.operation) ||
      (patch.budget_max !== undefined && patch.budget_max !== current.budget_max)
    )
    if (replacesCore && Object.keys(patch).length >= 2) return 'REFORMULATION'
  }
  if (!current || !Object.keys(current).length) return 'SEARCH_REQUEST'
  if (Object.keys(patch).length && !patch.city && !patch.search_area && !patch.operation && !patch.property_type && !patch.property_label) return 'ADD_CONSTRAINT'
  if (Object.keys(patch).length) return 'FOLLOW_UP'
  return 'FALLBACK'
}

function mergeArrays(current: string[] | undefined, incoming: string[] | undefined, replace = false): string[] | undefined {
  if (!incoming?.length) return replace ? undefined : current
  return replace ? [...new Set(incoming)] : uniq(current, incoming)
}

export function interpretPropertyTurn(text: string, locale = 'es', current: ChatbotSearchCriteria | undefined, dialogueState?: ChatbotDialogueState): PropertyTurnInterpretation {
  const normalizedOriginal = normalize(text)
  const hardResetRequested = detectHardReset(normalizedOriginal)
  const sanitizedText = hardResetRequested ? stripResetPhrases(text) : text
  const raw = sanitizedText
  const normalized = normalize(sanitizedText)
  if (isResultQuestion(text)) {
    const preview = mergePropertyState(current, {}, 'FOLLOW_UP')
    const missing = !preview.operation ? 'operation' : (!preview.city && !preview.search_area && !preview.is_location_flexible ? 'city' : null)
    return { act: 'FOLLOW_UP', patch: {}, missing }
  }
  const broadArea = detectBroadArea(normalized)
  const patch: ChatbotSearchCriteria = {
    ...detectProperty(normalized, locale),
    ...detectRoomsAndBaths(normalized, locale),
    ...detectBudget(normalized),
    ...broadArea,
    ...detectExactLocation(raw, normalized, broadArea.search_area),
    ...detectSubzone(normalized, locale),
    ...detectSpatialDetail(normalized, locale),
    ...detectLogistics(normalized, locale),
    ...detectAttributes(normalized, locale),
    ...detectUrgency(normalized),
  }
  const operation = detectOperation(normalized)
  if (operation) patch.operation = operation
  const act = interpretAct(text, patch, current, dialogueState)
  if (act === 'HARD_RESET') {
    const resetPatch: ChatbotSearchCriteria = { ...patch }
    if (resetPatch.search_area) resetPatch.city = undefined
    return { act, patch: resetPatch, missing: !resetPatch.operation ? 'operation' : (!resetPatch.city && !resetPatch.search_area && !resetPatch.is_location_flexible ? 'city' : null) }
  }
  const preview = mergePropertyState(current, patch, act)
  const missing = !preview.operation ? 'operation' : (!preview.city && !preview.search_area && !preview.is_location_flexible ? 'city' : null)
  return { act, patch, missing }
}

export function mergePropertyState(current: ChatbotSearchCriteria | undefined, patch: ChatbotSearchCriteria, act: PropertyTurnAct): ChatbotSearchCriteria {
  if (act === 'RESTART' || act === 'HARD_RESET') {
    const fresh = { ...patch }
    if (fresh.operation === undefined && current?.operation) fresh.operation = current.operation
    if (fresh.search_area) fresh.city = undefined
    if (fresh.property_type) fresh.property_label = undefined
    return fresh
  }
  const base: ChatbotSearchCriteria = { ...(current || {}) }
  const replaceLocation = (act === 'CORRECTION' || act === 'REFORMULATION') && Boolean(patch.city || patch.search_area)
  const replaceSpatial = replaceLocation || ((act === 'CORRECTION' || act === 'REFORMULATION') && Boolean(patch.subzone || patch.location_clauses?.length || patch.landmark || patch.logistic_attributes?.length))
  const replacePropertyKind = act === 'REFORMULATION' && Boolean(patch.property_label || patch.property_type)

  const next: ChatbotSearchCriteria = {
    ...base,
    ...(['operation','property_type','property_label','rooms','rooms_min','rooms_comparator','bathrooms','bathrooms_min','bathrooms_comparator','budget_max','budget_min','budget_approx','is_monthly_budget','urgency'] as const)
      .reduce((acc, key) => ({ ...acc, [key]: patch[key] !== undefined ? patch[key] : (replacePropertyKind && (key === 'property_type' || key === 'property_label') ? undefined : base[key]) }), {}),
    city: patch.city !== undefined ? patch.city : replaceLocation ? undefined : base.city,
    search_area: patch.search_area !== undefined ? patch.search_area : replaceLocation ? undefined : base.search_area,
    location_scope: patch.location_scope !== undefined ? patch.location_scope : replaceLocation ? undefined : base.location_scope,
    is_location_flexible: patch.is_location_flexible !== undefined ? patch.is_location_flexible : base.is_location_flexible,
    subzone: patch.subzone !== undefined ? patch.subzone : replaceSpatial ? undefined : base.subzone,
    landmark: patch.landmark !== undefined ? patch.landmark : replaceSpatial ? undefined : base.landmark,
    landmarks: mergeArrays(replaceSpatial ? undefined : base.landmarks, patch.landmarks, replaceSpatial),
    spatial_relation: patch.spatial_relation !== undefined ? patch.spatial_relation : replaceSpatial ? undefined : base.spatial_relation,
    spatial_relations: mergeArrays(replaceSpatial ? undefined : base.spatial_relations, patch.spatial_relations, replaceSpatial),
    location_clauses: patch.location_clauses?.length ? (replaceSpatial ? patch.location_clauses : [...(base.location_clauses || []), ...patch.location_clauses].filter((v, i, a) => a.findIndex(x => x.relation === v.relation && x.landmark === v.landmark) === i)) : (replaceSpatial ? undefined : base.location_clauses),
    logistic_attributes: mergeArrays(replaceSpatial ? undefined : base.logistic_attributes, patch.logistic_attributes, false),
    attributes: mergeArrays(base.attributes, patch.attributes, false),
    qualitative_attributes: mergeArrays(base.qualitative_attributes, patch.qualitative_attributes, false),
  }
  if ((act === 'CORRECTION' || act === 'REFORMULATION') && patch.property_label && patch.property_type === undefined) {
    next.property_type = undefined
  }
  if (patch.property_type) next.property_label = undefined
  return next
}

export function hasPropertySearchContext(state: ChatbotSearchCriteria | undefined): boolean {
  if (!state) return false
  return Boolean(state.city || state.search_area || state.property_type || state.property_label || state.operation || state.rooms || state.budget_max || state.subzone || state.landmark)
}

export function decidePropertyFlow(state: ChatbotSearchCriteria): { missing: 'operation' | 'city' | null; searchable: boolean } {
  const missing = !state.operation ? 'operation' : (!state.city && !state.search_area && !state.is_location_flexible ? 'city' : null)
  return { missing, searchable: missing === null && Boolean(state.operation) }
}

export function rankPropertyMatches(state: ChatbotSearchCriteria, properties: Array<{ id: string; title: string; city: string | null; address: string | null; property_type: string | null; deal_type: string | null; price: number | null; rooms: number | null; status: string | null }>) {
  return properties
    .map((property) => {
      let score = 0
      if (state.city && property.city === state.city) score += 10
      if (state.property_type && property.property_type === state.property_type) score += 6
      if (state.operation && propertyMatchesOperation(property.deal_type, state.operation)) score += 6
      if (state.budget_max && property.price && property.price <= state.budget_max) score += 4
      if (state.rooms && property.rooms && property.rooms >= state.rooms) score += 3
      const haystack = `${property.title || ''} ${property.address || ''}`.toLowerCase()
      if (state.subzone && haystack.includes(normalize(state.subzone))) score += 2
      if (state.landmarks?.some((lm) => haystack.includes(normalize(lm)))) score += 1
      return { property, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.property)
}

function extractPropertyReferenceCue(text: string): string | null {
  const normalized = normalizeLoose(text)
  const patterns = [
    /(?:quiero saber acerca de|quiero saber acerca del|quiero saber de|quiero saber del|hablame de|hablame del|que informacion tienes de|que informacion tienes del|muestrame|muestrame el|dime sobre|dime sobre el)\s+(.+)/,
    /(?:tell me about|show me|what information do you have about|i want to know about)\s+(.+)/,
    /(?:parlami di|vorrei sapere di|che informazioni hai su|mostrami|mostrami il)\s+(.+)/,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      return match[1]
        .replace(/\b(que tiene en sus registros|in your records|nei tuoi registri)\b/g, '')
        .trim()
    }
  }
  return null
}

function looksLikeSearchRewrite(candidate: string): boolean {
  const normalized = normalizeLoose(candidate)
  return /\b(apartamento|apartamentos|piso|pisos|casa|casas|appartamento|appartamenti|apartment|apartments|house|houses|vivienda|immobile|property|properties|en|in|a|hasta|up to|fino a|presupuesto|budget|habitaciones|bedrooms|camere|banos|bathrooms|bagni|alquiler|compra|rent|buy|affitto|vendita|solo|only|madrid|valencia|sevilla|barcelona|milano|roma)\b/.test(normalized)
}

export function resolveConcretePropertyReference(
  text: string,
  properties: ConcretePropertyRecord[]
): { requested: boolean; match: ConcretePropertyRecord | null; candidate: string | null } {
  const normalizedText = normalizeLoose(text)
  const candidate = extractPropertyReferenceCue(text)
  const exactRequested = properties.some((property) => normalizedText.includes(normalizeLoose(property.title)))
  const requested = exactRequested || Boolean(candidate && !looksLikeSearchRewrite(candidate))
  if (!requested) return { requested: false, match: null, candidate: null }

  const exactByTitle = properties.find((property) => normalizedText.includes(normalizeLoose(property.title)))
  if (exactByTitle) return { requested: true, match: exactByTitle, candidate: propertyTitleCandidate(exactByTitle.title) }

  if (candidate) {
    const normalizedCandidate = normalizeLoose(candidate)
    const byCandidate = properties.find((property) => {
      const title = normalizeLoose(property.title)
      return title === normalizedCandidate || title.includes(normalizedCandidate) || normalizedCandidate.includes(title)
    })
    if (byCandidate) return { requested: true, match: byCandidate, candidate }
  }

  return { requested: true, match: null, candidate }
}

function propertyTitleCandidate(title: string) {
  return title
}

function asksPropertyPrice(text: string) {
  return /\b(precio|cuanto cuesta|cuanto vale|price|how much|prezzo|quanto costa)\b/.test(normalize(text))
}

function asksPropertyAddress(text: string) {
  return /\b(direccion|direccion exacta|address|where is it|indirizzo|dove si trova|zona exacta|que zona|en que zona|what area|which area|in che zona|che zona)\b/.test(normalize(text))
}

function asksPropertyDetails(text: string) {
  return /\b(detalles|mas informacion|más informacion|details|tell me more|give me more information|informacion|informazioni|superficie|metros|dame los detalles|dime mas|dime más|quiero mas informacion|quiero más información|dammi i dettagli|dimmi di piu|dimmi di più)\b/.test(normalize(text))
}

export function isConcretePropertyFollowUp(text: string): boolean {
  const normalized = normalize(text)
  return /\b(este apartamento|esta propiedad|este inmueble|este piso|esta casa|esta|esa|dame los detalles|dime mas|dime más|quiero mas informacion|quiero más información|this apartment|this property|this house|this one|that one|give me the details|tell me more about this property|questo appartamento|questo immobile|questa proprieta|questa proprietà|questa|quella|dammi i dettagli|dimmi di piu|dimmi di più)\b/.test(normalized)
}

export function buildConcretePropertyReply(args: {
  property: ConcretePropertyRecord | null
  candidate: string | null
  locale?: string
  text: string
}): string {
  const { property, candidate, locale = 'es', text } = args
  if (!property) {
    if (locale === 'en') return `I cannot find a specific property with that name in the current records.`
    if (locale === 'it') return `Non trovo una proprietà concreta con quel nome nei registri attuali.`
    return `No encuentro una propiedad concreta con ese nombre en los registros actuales.`
  }

  if (asksPropertyPrice(text) && property.price != null) {
    if (locale === 'en') return `For ${property.title}, the listed price is ${property.price}.`
    if (locale === 'it') return `Per ${property.title}, il prezzo publicado è ${property.price}.`
    return `En ${property.title}, el precio publicado es ${property.price}.`
  }
  if (asksPropertyAddress(text)) {
    const place = property.address || property.city
    if (locale === 'en') return place ? `${property.title} is listed in ${place}.` : `I have ${property.title}, but I do not have a more precise location here.`
    if (locale === 'it') return place ? `${property.title} risulta en ${place}.` : `Tengo ${property.title}, ma non vedo una ubicación più precisa qui.`
    return place ? `${property.title} figura en ${place}.` : `Tengo ${property.title}, pero aquí no veo una ubicación más precisa.`
  }
  if (asksPropertyDetails(text)) {
    const chunks: string[] = []
    if (property.property_type) chunks.push(locale === 'en' ? `type: ${property.property_type}` : locale === 'it' ? `tipo: ${property.property_type}` : `tipo: ${property.property_type}`)
    if (property.deal_type) chunks.push(locale === 'en' ? `operation: ${property.deal_type}` : locale === 'it' ? `operazione: ${property.deal_type}` : `operación: ${property.deal_type}`)
    if (property.city) chunks.push(locale === 'en' ? `city: ${property.city}` : locale === 'it' ? `città: ${property.city}` : `ciudad: ${property.city}`)
    if (property.address) chunks.push(locale === 'en' ? `address: ${property.address}` : locale === 'it' ? `indirizzo: ${property.address}` : `dirección: ${property.address}`)
    if (property.price != null) chunks.push(locale === 'en' ? `price: ${property.price}` : locale === 'it' ? `prezzo: ${property.price}` : `precio: ${property.price}`)
    if (property.rooms != null) chunks.push(locale === 'en' ? `rooms: ${property.rooms}` : locale === 'it' ? `camere: ${property.rooms}` : `habitaciones: ${property.rooms}`)
    const detailText = chunks.join(locale === 'en' ? '; ' : locale === 'it' ? '; ' : '; ')
    if (locale === 'en') return `For ${property.title}, these are the concrete details I have right now: ${detailText || 'no additional confirmed data'}.`
    if (locale === 'it') return `Per ${property.title}, questi sono i dettagli concreti che vedo adesso: ${detailText || 'nessun dato aggiuntivo confermato'}.`
    return `De ${property.title}, estos son los detalles concretos que tengo ahora mismo: ${detailText || 'ningún dato adicional confirmado'}.`
  }

  if (locale === 'en') return `Yes, I do have ${property.title} in the records. If you want, I can tell you the price, the area, or the available details.`
  if (locale === 'it') return `Sí, tengo ${property.title} nei registri. Se vuoi, posso dirti il prezzo, la zona o i dettagli disponibles.`
  return `Sí, tengo ${property.title} en los registros. Si quieres, puedo decirte el precio, la zona o los detalles disponibles.`
}

function joinLocationSummary(state: ChatbotSearchCriteria, locale: string): string {
  const parts: string[] = []
  const formatClause = (relation: string, landmark: string) => {
    if (locale === 'es') return `${relation} ${landmark}`.replace(/ de el /g, ' del ').replace(/ a el /g, ' al ')
    return `${relation} ${landmark}`
  }
  if (state.location_scope && state.search_area) {
    if (locale === 'en') parts.push(state.location_scope === 'surroundings' ? `around ${state.search_area}` : `in the ${state.search_area} area`)
    else if (locale === 'it') parts.push(state.location_scope === 'surroundings' ? `nei dintorni di ${state.search_area}` : `nella zona de ${state.search_area}`)
    else parts.push(state.location_scope === 'surroundings' ? `por ${state.search_area} y alrededores` : `en la zona de ${state.search_area}`)
  } else if (state.city) {
    if (state.subzone) parts.push(locale === 'en' ? `in ${state.subzone} of ${state.city}` : locale === 'it' ? `nel ${state.subzone} di ${state.city}` : `en ${state.subzone} de ${state.city}`)
    else parts.push(locale === 'en' ? `in ${state.city}` : locale === 'it' ? `a ${state.city}` : `en ${state.city}`)
  }
  if (state.location_clauses?.length) {
    const clause = state.location_clauses.map((c) => formatClause(c.relation, c.landmark)).join(locale === 'en' ? ' and ' : locale === 'it' ? ' e ' : ' y ')
    parts.push(clause)
  }
  return parts.join(', ')
}

function propertyNoun(state: ChatbotSearchCriteria, locale: string) {
  if (state.property_type === 'apartment') return locale === 'en' ? 'apartment' : locale === 'it' ? 'appartamento' : 'apartamento'
  if (state.property_type === 'house') return locale === 'en' ? 'house' : locale === 'it' ? 'casa' : 'casa'
  if (state.property_type === 'penthouse') return locale === 'en' ? 'penthouse' : locale === 'it' ? 'attico' : 'ático'
  return state.property_label || (locale === 'en' ? 'property' : locale === 'it' ? 'immobile' : 'vivienda')
}

function propertyPhrase(state: ChatbotSearchCriteria, locale: string, operation?: ChatbotSearchCriteria['operation']) {
  const noun = propertyNoun(state, locale)
  const feminineEs = noun === 'vivienda' || noun === 'casa'
  if (locale === 'en') {
    const article = /^[aeiou]/.test(noun) ? 'an' : 'a'
    if (operation === 'sale') return `${article} ${noun} to buy`
    if (operation === 'rent') return `${article} ${noun} to rent`
    return `${article} ${noun}`
  }
  if (locale === 'it') {
    if (operation === 'sale') return `un ${noun} da comprare`
    if (operation === 'rent') return `un ${noun} in affitto`
    return `un ${noun}`
  }
  if (operation === 'sale') return `${feminineEs ? 'una' : 'un'} ${noun} para comprar`
  if (operation === 'rent') return `${feminineEs ? 'una' : 'un'} ${noun} para alquilar`
  return `${feminineEs ? 'una' : 'un'} ${noun}`
}

function buildStateSummary(state: ChatbotSearchCriteria, locale: string) {
  const pieces: string[] = []
  pieces.push(propertyPhrase(state, locale, state.operation))
  if (state.rooms) pieces.push(locale === 'en' ? `${state.rooms} bedrooms` : locale === 'it' ? `${state.rooms} camere` : `${state.rooms} habitaciones`)
  if (state.bathrooms) pieces.push(locale === 'en' ? `${state.bathrooms} bathrooms` : locale === 'it' ? `${state.bathrooms} bagni` : `${state.bathrooms} baños`)
  if (state.attributes?.length) pieces.push(locale === 'en' ? `with ${state.attributes.join(', ')}` : locale === 'it' ? `con ${state.attributes.join(', ')}` : `con ${state.attributes.join(', ')}`)
  const location = joinLocationSummary(state, locale)
  if (location) pieces.push(location)
  if (state.logistic_attributes?.length) {
    const redundantTransport = state.location_clauses?.some((clause) => /metro|station|stazione/.test(normalize(clause.landmark)))
      ? ['cerca de transporte', 'near transport', 'vicino ai trasporti']
      : []
    const visibleLogistics = state.logistic_attributes.filter((item) => !redundantTransport.includes(item))
    if (visibleLogistics.length) pieces.push(visibleLogistics.join(locale === 'en' ? ' and ' : locale === 'it' ? ' e ' : ' y '))
  }
  if (state.budget_max) pieces.push(locale === 'en' ? `up to ${state.budget_max}` : locale === 'it' ? `fino a ${state.budget_max}` : `hasta ${state.budget_max}`)
  return pieces.join(', ')
}

export function buildPropertyReply(args: {
  state: ChatbotSearchCriteria
  previous?: ChatbotSearchCriteria
  act: PropertyTurnAct
  missing: 'operation' | 'city' | null
  matches: Array<{ title: string; address?: string | null; price?: number | null; city?: string | null }>
  locale?: string
  text: string
}): string {
  const { state, act, missing, matches, locale = 'es', text } = args
  const summary = buildStateSummary(state, locale)
  const normalized = normalize(text)
  const isQuestion = /\?/.test(text) || /^(que|qué|cual|cuál|como|cómo|donde|dónde|where|what|how|which|quanto|quale|che|dove)\b/.test(normalized.trim())
  const asksPrice = isQuestion && /\b(precio|cuanto cuesta|cuanto vale|price|how much|prezzo|quanto costa)\b/.test(normalized)
  const asksLocation = isQuestion && /\b(direccion|direccion exacta|address|where is it|what area|which area|zona exacta|ubicacion exacta|indirizzo|dove si trova|in che zona|che zona|en que zona|que zona)\b/.test(normalized)
  const asksDetails = isQuestion && /\b(detalles|mas informacion|más informacion|details|tell me more|informacion|informazioni|superficie|metros)\b/.test(normalized)
  const asksEnvironment = isQuestion && /\b(cerca de|near|vicino a|playa|beach|metro|transport|transporte|colegios|schools|servicios|services)\b/.test(normalized)
  const asksSpecificResult = asksPrice || asksLocation || asksDetails
  const selected = matches.length === 1 ? matches[0] : null

  if (asksPrice || asksLocation || asksDetails || asksEnvironment) {
    if (!selected) {
      if (locale === 'en') return `I still do not have one specific property identified well enough to answer that. If you want, I can narrow the search first and then give you the exact detail.`
      if (locale === 'it') return `Non ho ancora una proprietà concreta abbastanza definita per rispondere a questo. Se vuoi, prima restringo la ricerca e poi ti do il dato preciso.`
      return `Todavía no tengo una propiedad concreta identificada como para responderte eso con precisión. Si quieres, primero acoto la búsqueda y después te doy ese dato exacto.`
    }
    if (asksPrice && selected.price != null) {
      if (locale === 'en') return `For ${selected.title}, the listed price is ${selected.price}.`
      if (locale === 'it') return `Per ${selected.title}, il prezzo publicado è ${selected.price}.`
      return `En ${selected.title}, el precio publicado es ${selected.price}.`
    }
    if (asksLocation) {
      const place = selected.address || selected.city || ''
      if (locale === 'en') return place ? `${selected.title} is listed in ${place}.` : `I have ${selected.title}, but I still do not have a precise address available here.`
      if (locale === 'it') return place ? `${selected.title} risulta en ${place}.` : `Tengo ${selected.title}, ma qui non vedo un indirizzo preciso.`
      return place ? `${selected.title} figura en ${place}.` : `Tengo ${selected.title}, pero aquí no veo una dirección precisa.`
    }
    if (asksDetails) {
      if (locale === 'en') return `I do have ${selected.title} as the clearest option right now. If you want, I can continue with the concrete details I have available for it.`
      if (locale === 'it') return `In questo momento l'opzione più clara è ${selected.title}. Se vuoi, continuo con i dettagli concreti che tengo disponibili.`
      return `Ahora mismo la opción más clara es ${selected.title}. Si quieres, sigo con los detalles concretos que tengo disponibles.`
    }
    if (asksEnvironment) {
      if (locale === 'en') return `For ${selected.title}, I still do not have enough confirmed detail here to answer that reliably.`
      if (locale === 'it') return `Per ${selected.title}, qui non ho ancora abbastanza dettaglio confermato per risponderti con sicurezza.`
      return `Sobre ${selected.title}, aquí todavía no tengo suficiente detalle confirmado como para responderte eso con seguridad.`
    }
  }

  if (missing === 'operation') {
    if (locale === 'en') return `Of course. I can help with ${summary}. Are you looking to buy or rent?`
    if (locale === 'it') return `Certo. Posso aiutarti con ${summary}. Cerchi in vendita o in affitto?`
    return `Claro. Puedo ayudarte con ${summary}. ¿Lo buscas para compra o para alquiler?`
  }
  if (missing === 'city') {
    if (locale === 'en') return `Perfect. I can look for ${summary}. Which city or area should I focus on?`
    if (locale === 'it') return `Perfetto. Posso cercare ${summary}. Su quale città o zona vuoi che mi concentri?`
    return `Perfecto. Puedo buscar ${summary}. ¿En qué ciudad o zona quieres que me centre?`
  }
  if (matches.length > 0) {
    if (locale === 'en') return `I do see options that fit what you told me, for example ${matches[0].title}. If you want, I can narrow them down or move straight to a visit.`
    if (locale === 'it') return `Qui vedo opzioni che possono encajar con quello che cerchi, per esempio ${matches[0].title}. Se vuoi, posso restringerle meglio o passare a una visita.`
    return `Sí veo opciones que encajan con lo que buscas, por ejemplo ${matches[0].title}. Si quieres, puedo afinarlas un poco más o pasar directamente a una visita.`
  }
  if (locale === 'en') return `I do not see an exact match for ${summary} right now. If you want, I can review nearby areas, budget, or property type to find realistic alternatives.`
  if (locale === 'it') return `In questo momento non vedo una corrispondenza esatta per ${summary}. Se vuoi, posso rivedere zona, budget o tipologia per trovare alternative reali.`
  return `Ahora mismo no veo una coincidencia exacta para ${summary}. Si quieres, puedo revisar zonas cercanas, presupuesto o tipología para proponerte alternativas reales.`
}

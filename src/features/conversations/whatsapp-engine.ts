export interface WhatsAppMessage {
  id?: string
  from: string
  to: string
  text: string
  type: 'text' | 'template' | 'image' | 'document' | 'location'
  timestamp?: string
  provider_message_id?: string
  template_name?: string
  template_params?: string[]
}

export interface WhatsAppInboundPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        messages?: Array<{
          from: string
          id: string
          timestamp: string
          type: string
          text?: { body: string }
          image?: { id: string; mime_type: string; sha256: string }
          document?: { id: string; filename: string; mime_type: string }
          location?: { latitude: number; longitude: number; name: string; address: string }
        }>
        contacts?: Array<{
          profile: { name: string }
          wa_id: string
        }>
        statuses?: Array<{
          id: string
          status: 'sent' | 'delivered' | 'read' | 'failed'
          recipient_id: string
          timestamp: string
        }>
      }
    }>
  }>
}

export interface WhatsAppOutboundResult {
  status: 'prepared' | 'sent' | 'failed'
  message_id?: string
  provider_message_id?: string
  error?: string
  reason?: string
  message_type?: 'text' | 'template'
  template_name?: string
}

export interface WhatsAppMetadata {
  whatsapp_from?: string
  whatsapp_to?: string
  whatsapp_provider_message_id?: string
  whatsapp_message_type?: string
  whatsapp_template_name?: string
  whatsapp_template_params?: string[]
  whatsapp_contact_name?: string
  whatsapp_phone_number_id?: string
  reply_type?: 'human' | 'auto' | 'template'
  whatsapp_delivery_provider?: 'none' | 'meta_cloud'
  whatsapp_delivery_status?: 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed'
  whatsapp_delivery_error?: string
  whatsapp_delivery_response?: string
  whatsapp_delivery_requested_type?: 'text' | 'template'
  whatsapp_delivery_sent_type?: 'text' | 'template'
  whatsapp_delivery_template_fallback?: boolean
  whatsapp_delivery_sandbox?: boolean
  whatsapp_config_source?: 'db_config' | 'env_fallback'
  whatsapp_resolved_to?: string
  whatsapp_resolved_source?: 'metadata.last_whatsapp_to' | 'metadata.contact_phone' | 'lead.contact_phone' | null
}

export interface WhatsAppDeliveryConfig {
  provider: 'none' | 'meta_cloud'
  configured: boolean
  reason?: string
  meta?: {
    token: string
    phoneNumberId: string
  }
}

export interface WhatsAppTemplate {
  id: string
  name: string
  language: string
  category: string
  text: string
  params_required: number
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'wa_greeting',
    name: 'saludo_seguimiento',
    language: 'es',
    category: 'marketing',
    text: 'Hola {{1}}, gracias por contactarnos. ¿En qué podemos ayudarte?',
    params_required: 1,
  },
  {
    id: 'wa_appointment_confirm',
    name: 'confirmacion_cita',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, tu cita ha sido confirmada para el {{2}} a las {{3}}. ¿Necesitas cambiar algo?',
    params_required: 3,
  },
  {
    id: 'wa_human_handoff',
    name: 'agente_contactara',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, un agente de nuestro equipo te contactará pronto. Gracias por tu paciencia.',
    params_required: 1,
  },
  {
    id: 'wa_reminder',
    name: 'recordatorio_cita',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, te recordamos tu cita del {{2}} a las {{3}}. ¡Te esperamos!',
    params_required: 3,
  },
  {
    id: 'lead_bienvenida',
    name: 'lead_bienvenida_es',
    language: 'es',
    category: 'marketing',
    text: 'Hola {{1}}, gracias por contactarnos. Мы te ayudamos a encontrar tu propiedad ideal. ¿Qué tipo de inmueble buscas?',
    params_required: 1,
  },
  {
    id: 'lead_reactivacion',
    name: 'lead_reactivacion_es',
    language: 'es',
    category: 'marketing',
    text: 'Seguimos atentos a tu solicitud. Si aún necesitas ayuda, un asesor puede continuar contigo por este medio.',
    params_required: 0,
  },
  {
    id: 'calificacion_presupuesto',
    name: 'calificacion_presupuesto_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, para buscar propiedades que se ajusten a tu presupuesto, ¿cuál es el rango de precio que tienes en mente?',
    params_required: 1,
  },
  {
    id: 'calificacion_tipo',
    name: 'calificacion_tipo_propiedad_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, ¿qué tipo de propiedad buscas? ¿Piso, casa, ático, chalet?',
    params_required: 1,
  },
  {
    id: 'calificacion_zona',
    name: 'calificacion_zona_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, ¿en qué zona o barrio te gustaría buscar?',
    params_required: 1,
  },
  {
    id: 'calificacion_habitaciones',
    name: 'calificacion_habitaciones_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, ¿cuántas habitaciones necesitas?',
    params_required: 1,
  },
  {
    id: 'calificacion_operacion',
    name: 'calificacion_compra_alquiler_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, ¿buscas comprar o alquilar?',
    params_required: 1,
  },
  {
    id: 'envio_propiedad',
    name: 'envio_ficha_propiedad_es',
    language: 'es',
    category: 'marketing',
    text: 'Hola {{1}}, te envío la ficha de esta propiedad: {{2}}. ¿Te gustaría visitarla?',
    params_required: 2,
  },
  {
    id: 'visita_propuesta',
    name: 'visita_propuesta_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, te proponemos visitar la propiedad el {{2}} a las {{3}}. ¿Te viene bien?',
    params_required: 3,
  },
  {
    id: 'visita_confirmacion',
    name: 'visita_confirmacion_es',
    language: 'es',
    category: 'utility',
    text: 'Tu visita ha sido confirmada. Un asesor te atendera en la fecha y hora acordadas. Si necesitas cambiarla, responde a este mensaje.',
    params_required: 0,
  },
  {
    id: 'visita_recordatorio',
    name: 'visita_recordatorio_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, te recordamos tu visita mañana {{2}} a las {{3}}. ¡Hasta luego!',
    params_required: 3,
  },
  {
    id: 'visita_reprogramacion',
    name: 'visita_reprogramacion_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, hemos reprogramado tu visita para el {{2}} a las {{3}}. ¿Te parece bien?',
    params_required: 3,
  },
  {
    id: 'visita_cancelacion',
    name: 'visita_cancelacion_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, tu visita programada para el {{2}} ha sido cancelada. ¿Quieres programar otra fecha?',
    params_required: 2,
  },
  {
    id: 'seguimiento_post_visita',
    name: 'seguimiento_post_visita_es',
    language: 'es',
    category: 'marketing',
    text: 'Hola {{1}}, ¿qué te pareció la visita? ¿Te interesa alguna otra propiedad?',
    params_required: 1,
  },
  {
    id: 'seguimiento_interes',
    name: 'seguimiento_interes_es',
    language: 'es',
    category: 'marketing',
    text: 'Hola {{1}}, ¿has tenido oportunidad de pensar la propiedad? ¿Te gustaría recibir más información?',
    params_required: 1,
  },
  {
    id: 'documentacion_solicitud',
    name: 'documentacion_solicitud_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, necesitamos los siguientes documentos: {{2}}. ¿Puedes enviarlos?',
    params_required: 2,
  },
  {
    id: 'human_handoff_msg',
    name: 'human_handoff_msg_es',
    language: 'es',
    category: 'utility',
    text: 'Hola {{1}}, un agente te atenderá personalmente. Por favor espera mientras te conectamos.',
    params_required: 1,
  },
]

export const TEMPLATE_BY_NAME: Record<string, WhatsAppTemplate> = WHATSAPP_TEMPLATES.reduce((acc, t) => {
  acc[t.name] = t
  return acc
}, {} as Record<string, WhatsAppTemplate>)

export function getTemplateByName(name: string): WhatsAppTemplate | undefined {
  return TEMPLATE_BY_NAME[name]
}

export const SUPPORTED_LOCALES = ['es', 'en', 'it'] as const
export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

export const TEMPLATE_KEY_BASE_TO_NAMES: Record<string, Record<SupportedLocale, string>> = {
  lead_bienvenida: {
    es: 'lead_bienvenida_es',
    en: 'lead_bienvenida_en',
    it: 'lead_bienvenida_it',
  },
  lead_reactivacion: {
    es: 'lead_reactivacion_es',
    en: 'lead_reactivacion_en',
    it: 'lead_reactivacion_it',
  },
  visita_confirmacion: {
    es: 'visita_confirmacion_es',
    en: 'visita_confirmacion_en',
    it: 'visita_confirmacion_it',
  },
}

export function resolveTemplateByKeyAndLocale(
  templateKey: string,
  locale: string
): { templateName: string; localeCode: string; localeRequested: string; usedFallback: boolean; fallbackReason?: string } | null {
  const isLocaleEmpty = !locale || locale.trim() === ''
  const localeRequested = isLocaleEmpty ? 'empty' : locale.trim()
  const normalizedLocale = normalizeLocale(locale)
  const templateNames = TEMPLATE_KEY_BASE_TO_NAMES[templateKey]
  
  if (!templateNames) {
    console.warn(`[whatsapp-engine] Unknown template key: ${templateKey}`)
    return null
  }
  
  let resolvedLocale: SupportedLocale = normalizedLocale
  let usedFallback = false
  let fallbackReason: string | undefined
  
  if (!templateNames[normalizedLocale]) {
    resolvedLocale = 'es'
    usedFallback = true
    fallbackReason = `locale_${localeRequested}_not_available`
  } else if (isLocaleEmpty) {
    resolvedLocale = 'es'
    usedFallback = true
    fallbackReason = 'locale_empty_default_to_es'
  }
  
  const templateName = templateNames[resolvedLocale]
  if (!templateName) {
    fallbackReason = `no_template_for_${resolvedLocale}_fallback_failed`
    console.warn(`[whatsapp-engine] No template for key=${templateKey}, locale=${resolvedLocale}`)
    return null
  }
  
  return { 
    templateName, 
    localeCode: resolvedLocale,
    localeRequested,
    usedFallback,
    fallbackReason 
  }
}

function normalizeLocale(locale: string | undefined | null): SupportedLocale {
  if (!locale) return 'es'
  const normalized = locale.toLowerCase().trim()
  if (SUPPORTED_LOCALES.includes(normalized as SupportedLocale)) {
    return normalized as SupportedLocale
  }
  return 'es'
}

export function findConversationByPhone(
  phone: string,
  existingConversations: Array<{ id: string; metadata: Record<string, unknown> }>
): string | null {
  const cleanPhone = phone.replace(/[^0-9+]/g, '')
  for (const conv of existingConversations) {
    const meta = conv.metadata
    if (meta.whatsapp_from === cleanPhone ||
        meta.whatsapp_from === phone ||
        meta.last_whatsapp_to === cleanPhone ||
        meta.last_whatsapp_to === phone) {
      return conv.id
    }
  }
  return null
}

export function renderTemplate(templateId: string, params: string[]): string | null {
  const template = WHATSAPP_TEMPLATES.find(t => t.id === templateId)
  if (!template) return null
  if (params.length < template.params_required) return null

  let text = template.text
  params.forEach((param, i) => {
    text = text.replace(`{{${i + 1}}}`, param)
  })
  return text
}

export function hasWhatsAppCredentials(): boolean {
  return !!(
    process.env.WHATSAPP_BUSINESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_VERIFY_TOKEN
  )
}

export function normalizeWhatsAppRecipient(raw: string): string {
  return raw.replace(/[^0-9]/g, '')
}

export interface ValidationResult {
  valid: boolean
  normalized: string | null
  error: string | null
}

const VALID_COUNTRY_CODES = [
  '1',    // USA, Canada
  '7',    // Russia, Kazakhstan
  '20',   // Egypt
  '27',   // South Africa
  '30',   // Greece
  '31',   // Netherlands
  '32',   // Belgium
  '33',   // France
  '34',   // Spain
  '36',   // Hungary
  '39',   // Italy
  '40',   // Romania
  '41',   // Switzerland
  '43',   // Austria
  '44',   // UK
  '45',   // Denmark
  '46',   // Sweden
  '47',   // Norway
  '48',   // Poland
  '49',   // Germany
  '51',   // Peru
  '52',   // Mexico
  '53',   // Cuba
  '54',   // Argentina
  '55',   // Brazil
  '56',   // Chile
  '57',   // Colombia
  '58',   // Venezuela
  '60',   // Malaysia
  '61',   // Australia
  '62',   // Indonesia
  '63',   // Philippines
  '64',   // New Zealand
  '65',   // Singapore
  '66',   // Thailand
  '81',   // Japan
  '82',   // South Korea
  '84',   // Vietnam
  '86',   // China
  '90',   // Turkey
  '91',   // India
  '92',   // Pakistan
  '93',   // Afghanistan
  '94',   // Sri Lanka
  '95',   // Myanmar
  '98',   // Iran
  '212',  // Morocco
  '213',  // Algeria
  '216',  // Tunisia
  '218',  // Libya
  '220',  // Gambia
  '221',  // Senegal
  '222',  // Mauritania
  '223',  // Mali
  '224',  // Guinea
  '225',  // Ivory Coast
  '226',  // Burkina Faso
  '227',  // Niger
  '228',  // Togo
  '229',  // Benin
  '230',  // Mauritius
  '231',  // Liberia
  '232',  // Sierra Leone
  '233',  // Ghana
  '234',  // Nigeria
  '235',  // Chad
  '236',  // Central African Republic
  '237',  // Cameroon
  '238',  // Cape Verde
  '239',  // Sao Tome and Principe
  '240',  // Equatorial Guinea
  '241',  // Gabon
  '242',  // Republic of the Congo
  '243',  // Democratic Republic of the Congo
  '244',  // Angola
  '245',  // Guinea-Bissau
  '246',  // British Indian Ocean Territory
  '247',  // Ascension Island
  '248',  // Seychelles
  '249',  // Sudan
  '250',  // Rwanda
  '251',  // Ethiopia
  '252',  // Somalia
  '253',  // Djibouti
  '254',  // Kenya
  '255',  // Tanzania
  '256',  // Uganda
  '257',  // Burundi
  '258',  // Mozambique
  '260',  // Zambia
  '261',  // Madagascar
  '262',  // Reunion/Mayotte
  '263',  // Zimbabwe
  '264',  // Namibia
  '265',  // Malawi
  '266',  // Lesotho
  '267',  // Botswana
  '268',  // Eswatini
  '269',  // Comoros
  '290',  // Saint Helena
  '291',  // Eritrea
  '297',  // Aruba
  '298',  // Faroe Islands
  '299',  // Greenland
  '350',  // Gibraltar
  '351',  // Portugal
  '352',  // Luxembourg
  '353',  // Ireland
  '354',  // Iceland
  '355',  // Albania
  '356',  // Malta
  '357',  // Cyprus
  '358',  // Finland
  '359',  // Bulgaria
  '370',  // Lithuania
  '371',  // Latvia
  '372',  // Estonia
  '373',  // Moldova
  '374',  // Armenia
  '375',  // Belarus
  '376',  // Andorra
  '377',  // Monaco
  '378',  // San Marino
  '380',  // Ukraine
  '381',  // Serbia
  '382',  // Montenegro
  '383',  // Kosovo
  '385',  // Croatia
  '386',  // Slovenia
  '387',  // Bosnia and Herzegovina
  '389',  // North Macedonia
  '420',  // Czech Republic
  '421',  // Slovakia
  '423',  // Liechtenstein
  '500',  // Falkland Islands
  '501',  // Belize
  '502',  // Guatemala
  '503',  // El Salvador
  '504',  // Honduras
  '505',  // Nicaragua
  '506',  // Costa Rica
  '507',  // Panama
  '508',  // Saint Pierre and Miquelon
  '509',  // Haiti
  '590',  // Guadeloupe
  '591',  // Bolivia
  '592',  // Guyana
  '593',  // Ecuador
  '594',  // French Guiana
  '595',  // Paraguay
  '596',  // Martinique
  '597',  // Suriname
  '598',  // Uruguay
  '599',  // Caribbean Netherlands
  '670',  // Timor-Leste
  '672',  // Norfolk Island
  '673',  // Brunei
  '674',  // Nauru
  '675',  // Papua New Guinea
  '676',  // Tonga
  '677',  // Solomon Islands
  '678',  // Vanuatu
  '679',  // Fiji
  '680',  // Palau
  '681',  // Wallis and Futuna
  '682',  // Cook Islands
  '683',  // Niue
  '685',  // Samoa
  '686',  // Kiribati
  '687',  // New Caledonia
  '688',  // Tuvalu
  '689',  // French Polynesia
  '690',  // Tokelau
  '691',  // Micronesia
  '692',  // Marshall Islands
  '850',  // North Korea
  '852',  // Hong Kong
  '853',  // Macau
  '855',  // Cambodia
  '856',  // Laos
  '880',  // Bangladesh
  '886',  // Taiwan
  '960',  // Maldives
  '961',  // Lebanon
  '962',  // Jordan
  '963',  // Syria
  '964',  // Iraq
  '965',  // Kuwait
  '966',  // Saudi Arabia
  '967',  // Yemen
  '968',  // Oman
  '970',  // Palestine
  '971',  // UAE
  '972',  // Israel
  '973',  // Bahrain
  '974',  // Qatar
  '975',  // Bhutan
  '976',  // Mongolia
  '977',  // Nepal
  '992',  // Tajikistan
  '993',  // Turkmenistan
  '994',  // Azerbaijan
  '995',  // Georgia
  '996',  // Kyrgyzstan
  '998',  // Uzbekistan
]

export function validateWhatsAppNumber(phone: string): ValidationResult {
  const digits = phone.replace(/[^0-9]/g, '')
  
  if (!digits) {
    return { valid: false, normalized: null, error: 'El número está vacío' }
  }

  if (digits.length < 10) {
    return { valid: false, normalized: null, error: `Número demasiado corto (${digits.length} dígitos). Mínimo 10 dígitos.` }
  }

  if (digits.length > 15) {
    return { valid: false, normalized: null, error: `Número demasiado largo (${digits.length} dígitos). Máximo 15 dígitos.` }
  }

  let countryCode: string | null = null
  let countryCodeLength = 0
  
  if (digits.startsWith('1') && digits.length >= 11) {
    countryCode = '1'
    countryCodeLength = 1
  } else if (digits.startsWith('7') && digits.length >= 11) {
    countryCode = '7'
    countryCodeLength = 1
  } else if (digits.length >= 2) {
    for (const code of VALID_COUNTRY_CODES.filter(c => c.length === 2).sort((a, b) => b.length - a.length)) {
      if (digits.startsWith(code)) {
        countryCode = code
        countryCodeLength = 2
        break
      }
    }
  } else if (digits.length >= 3) {
    for (const code of VALID_COUNTRY_CODES.filter(c => c.length === 3).sort((a, b) => b.length - a.length)) {
      if (digits.startsWith(code)) {
        countryCode = code
        countryCodeLength = 3
        break
      }
    }
  }

  if (!countryCode) {
    const suggestion = digits.length === 10 
      ? `Agrega prefijo país (ej: 1 para USA/Canadá, 54 para Argentina, 52 para México)` 
      : 'El número debe incluir prefijo país válido'
    return { 
      valid: false, 
      normalized: null, 
      error: `Número sin prefijo país válido. ${suggestion}` 
    }
  }

  const expectedLength = countryCodeLength === 1 ? 11 : (countryCodeLength === 2 ? 12 : 13)
  if (digits.length !== expectedLength) {
    const countryName = getCountryName(countryCode)
    return {
      valid: false,
      normalized: null,
      error: `Número con prefijo ${countryCode} (${countryName}) debe tener ${expectedLength} dígitos. Tiene ${digits.length}.`
    }
  }

  if (!/^\+?[1-9]\d{1,14}$/.test(digits)) {
    return { valid: false, normalized: null, error: 'El formato del número no es válido para WhatsApp' }
  }

  return { valid: true, normalized: digits, error: null }
}

function getCountryName(code: string): string {
  const names: Record<string, string> = {
    '1': 'USA/Canadá',
    '7': 'Rusia/Kazajistán',
    '20': 'Egipto',
    '27': 'Sudáfrica',
    '30': 'Grecia',
    '31': 'Países Bajos',
    '32': 'Bélgica',
    '33': 'Francia',
    '34': 'España',
    '36': 'Hungría',
    '39': 'Italia',
    '40': 'Rumania',
    '41': 'Suiza',
    '43': 'Austria',
    '44': 'Reino Unido',
    '45': 'Dinamarca',
    '46': 'Suecia',
    '47': 'Noruega',
    '48': 'Polonia',
    '49': 'Alemania',
    '51': 'Perú',
    '52': 'México',
    '53': 'Cuba',
    '54': 'Argentina',
    '55': 'Brasil',
    '56': 'Chile',
    '57': 'Colombia',
    '58': 'Venezuela',
    '60': 'Malasia',
    '61': 'Australia',
    '62': 'Indonesia',
    '63': 'Filipinas',
    '64': 'Nueva Zelanda',
    '65': 'Singapur',
    '66': 'Tailandia',
    '81': 'Japón',
    '82': 'Corea del Sur',
    '84': 'Vietnam',
    '86': 'China',
    '90': 'Turquía',
    '91': 'India',
    '92': 'Pakistán',
    '93': 'Afganistán',
    '94': 'Sri Lanka',
    '95': 'Myanmar',
    '98': 'Irán',
    '212': 'Marruecos',
    '213': 'Argelia',
    '216': 'Túnez',
    '218': 'Libia',
    '220': 'Gambia',
    '221': 'Senegal',
    '222': 'Mauritania',
    '223': 'Mali',
    '224': 'Guinea',
    '225': 'Costa de Marfil',
    '226': 'Burkina Faso',
    '227': 'Níger',
    '228': 'Togo',
    '229': 'Benín',
    '230': 'Mauricio',
    '231': 'Liberia',
    '232': 'Sierra Leona',
    '233': 'Ghana',
    '234': 'Nigeria',
    '235': 'Chad',
    '236': 'República Centroafricana',
    '237': 'Camerún',
    '238': 'Cabo Verde',
    '239': 'Santo Tomé y Príncipe',
    '240': 'Guinea Ecuatorial',
    '241': 'Gabón',
    '242': 'República del Congo',
    '243': 'República Democrática del Congo',
    '244': 'Angola',
    '245': 'Guinea-Bisáu',
    '246': 'Territorio Británico del Océano Índico',
    '247': 'Isla de la Ascensión',
    '248': 'Seychelles',
    '249': 'Sudán',
    '250': 'Ruanda',
    '251': 'Etiopía',
    '252': 'Somalia',
    '253': 'Yibuti',
    '254': 'Kenia',
    '255': 'Tanzania',
    '256': 'Uganda',
    '257': 'Burundi',
    '258': 'Mozambique',
    '260': 'Zambia',
    '261': 'Madagascar',
    '262': 'Reunión/Mayotte',
    '263': 'Zimbabue',
    '264': 'Namibia',
    '265': 'Malaui',
    '266': 'Lesoto',
    '267': 'Botsuana',
    '268': 'Esuatini',
    '269': 'Comoras',
    '290': 'Santa Elena',
    '291': 'Eritrea',
    '297': 'Aruba',
    '298': 'Islas Feroe',
    '299': 'Groenlandia',
    '350': 'Gibraltar',
    '351': 'Portugal',
    '352': 'Luxemburgo',
    '353': 'Irlanda',
    '354': 'Islandia',
    '355': 'Albania',
    '356': 'Malta',
    '357': 'Chipre',
    '358': 'Finlandia',
    '359': 'Bulgaria',
    '370': 'Lituania',
    '371': 'Letonia',
    '372': 'Estonia',
    '373': 'Moldavia',
    '374': 'Armenia',
    '375': 'Bielorrusia',
    '376': 'Andorra',
    '377': 'Mónaco',
    '378': 'San Marino',
    '380': 'Ucrania',
    '381': 'Serbia',
    '382': 'Montenegro',
    '383': 'Kosovo',
    '385': 'Croacia',
    '386': 'Eslovenia',
    '387': 'Bosnia y Herzegovina',
    '389': 'Macedonia del Norte',
    '420': 'República Checa',
    '421': 'Eslovaquia',
    '423': 'Liechtenstein',
    '500': 'Islas Malvinas',
    '501': 'Belice',
    '502': 'Guatemala',
    '503': 'El Salvador',
    '504': 'Honduras',
    '505': 'Nicaragua',
    '506': 'Costa Rica',
    '507': 'Panamá',
    '508': 'San Pedro y Miquelón',
    '509': 'Haití',
    '590': 'Guadalupe',
    '591': 'Bolivia',
    '592': 'Guyana',
    '593': 'Ecuador',
    '594': 'Guayana Francesa',
    '595': 'Paraguay',
    '596': 'Martinica',
    '597': 'Surinam',
    '598': 'Uruguay',
    '599': 'Caribes holandeses',
    '670': 'Timor-Leste',
    '672': 'Isla Norfolk',
    '673': 'Brunéi',
    '674': 'Nauru',
    '675': 'Papúa Nueva Guinea',
    '676': 'Tonga',
    '677': 'Islas Salomón',
    '678': 'Vanuatu',
    '679': 'Fiyi',
    '680': 'Palaos',
    '681': 'Wallis y Futuna',
    '682': 'Islas Cook',
    '683': 'Niue',
    '685': 'Samoa',
    '686': 'Kiribati',
    '687': 'Nueva Caledonia',
    '688': 'Tuvalu',
    '689': 'Polinesia francesa',
    '690': 'Tokelau',
    '691': 'Micronesia',
    '692': 'Islas Marshall',
    '850': 'Corea del Norte',
    '852': 'Hong Kong',
    '853': 'Macao',
    '855': 'Camboya',
    '856': 'Laos',
    '880': 'Bangladesh',
    '886': 'Taiwán',
    '960': 'Maldivas',
    '961': 'Líbano',
    '962': 'Jordania',
    '963': 'Siria',
    '964': 'Irak',
    '965': 'Kuwait',
    '966': 'Arabia Saudita',
    '967': 'Yemen',
    '968': 'Omán',
    '970': 'Palestina',
    '971': 'EAU',
    '972': 'Israel',
    '973': 'Baréin',
    '974': 'Catar',
    '975': 'Bután',
    '976': 'Mongolia',
    '977': 'Nepal',
    '992': 'Tayikistán',
    '993': 'Turkmenistán',
    '994': 'Azerbaiyán',
    '995': 'Georgia',
    '996': 'Kirguistán',
    '998': 'Uzbekistán',
  }
  return names[code] || 'desconocido'
}

export function detectWhatsAppDeliveryConfig(env: Record<string, string | undefined>): WhatsAppDeliveryConfig {
  const token = env.WHATSAPP_BUSINESS_TOKEN?.trim()
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim()

  if (!token && !phoneNumberId) {
    return {
      provider: 'none',
      configured: false,
      reason: 'No WhatsApp outbound provider credentials were found in the server environment.',
    }
  }

  if (!token || !phoneNumberId) {
    const missing = [
      !token ? 'WHATSAPP_BUSINESS_TOKEN' : null,
      !phoneNumberId ? 'WHATSAPP_PHONE_NUMBER_ID' : null,
    ].filter(Boolean)

    return {
      provider: 'meta_cloud',
      configured: false,
      reason: `Missing required WhatsApp env vars: ${missing.join(', ')}`,
    }
  }

  return {
    provider: 'meta_cloud',
    configured: true,
    meta: {
      token,
      phoneNumberId,
    },
  }
}

export async function sendWhatsAppViaMeta(params: {
  config: NonNullable<WhatsAppDeliveryConfig['meta']>
  to: string
  text: string
  templateName?: string
  templateParams?: string[]
  templateLanguageCode?: string
}): Promise<WhatsAppOutboundResult> {
  const { config, to, text, templateName, templateParams, templateLanguageCode = 'es' } = params
  const normalizedTo = normalizeWhatsAppRecipient(to)
  const isTemplate = Boolean(templateName)

  console.info('[whatsapp-engine] Sending to Meta', {
    phoneNumberId: config.phoneNumberId,
    to: normalizedTo,
    toOriginal: to,
    isTemplate,
    templateName,
  })

  const response = await fetch(`https://graph.facebook.com/v23.0/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      ...(isTemplate
        ? {
            type: 'template',
            template: {
              name: templateName,
              language: { code: templateLanguageCode },
              ...(templateParams && templateParams.length > 0
                ? {
                    components: [
                      {
                        type: 'body',
                        parameters: templateParams.map((p: string) => ({ type: 'text', text: p })),
                      },
                    ],
                  }
                : {}),
            },
          }
        : {
            type: 'text',
            text: {
              preview_url: false,
              body: text,
            },
          }),
    }),
  })

  const raw = await response.text()
  let parsed: any = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const apiError = parsed?.error
    const providerMessage = apiError?.message
      || apiError?.error_user_msg
      || apiError?.error_user_title
      || raw
      || `Meta Cloud API responded with ${response.status}`

    const errorCode = apiError?.code
      || (typeof parsed?.error === 'string' ? parsed.error : null)

    const errorSubcode = apiError?.error_subcode || null
    const errorType = apiError?.type || null

    const providerReason = [
      errorType ? `[${errorType}]` : null,
      errorCode ? `code=${errorCode}` : null,
      errorSubcode ? `subcode=${errorSubcode}` : null,
      providerMessage !== raw ? providerMessage : null,
      `HTTP ${response.status}`,
    ].filter(Boolean).join(' ')

    return {
      status: 'failed',
      error: providerMessage,
      reason: providerReason,
      message_type: isTemplate ? 'template' : 'text',
      template_name: templateName,
    }
  }

  return {
    status: 'sent',
    provider_message_id: parsed?.messages?.[0]?.id,
    message_id: parsed?.messages?.[0]?.id,
    reason: raw || undefined,
    message_type: isTemplate ? 'template' : 'text',
    template_name: templateName,
  }
}

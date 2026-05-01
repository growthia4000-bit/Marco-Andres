import type { IntentType, IntentResult, DecisionResult, ClassificationResult } from './intent-types'

interface IntentRule {
  intent: IntentType
  keywords: string[]
  weight: number
  minConfidence: number
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'appointment_request',
    keywords: ['visita', 'visitar', 'cita', 'ver el piso', 'ver la casa', 'ver el apartamento',
      'agendar', 'programar', 'cuando puedo', 'puedo ver', 'quiero ver',
      'horario', 'disponible', 'disponibilidad', 'quedamos', 'quedar',
      'visit', 'appointment', 'schedule', 'meeting', 'available'],
    weight: 1.0,
    minConfidence: 0.4,
  },
  {
    intent: 'pricing_question',
    keywords: ['precio', 'coste', 'costo', 'cuánto cuesta', 'cuánto vale', 'valor',
      'negociable', 'descuento', 'financiación', 'financiacion', 'hipoteca',
      'pago', 'mensualidad', 'alquiler mensual', 'entrada',
      'price', 'cost', 'how much', 'negotiable', 'mortgage', 'payment'],
    weight: 0.9,
    minConfidence: 0.35,
  },
  {
    intent: 'property_interest',
    keywords: ['interesado', 'interesada', 'interés', 'me gusta', 'me interesa',
      'apartamento', 'piso', 'casa', 'ático', 'atico', 'vivienda', 'inmueble',
      'habitaciones', 'dormitorios', 'baños', 'metros', 'superficie',
      'ubicación', 'zona', 'barrio', 'dirección',
      'interested', 'apartment', 'house', 'property', 'bedrooms', 'bathrooms', 'location'],
    weight: 0.85,
    minConfidence: 0.3,
  },
  {
    intent: 'complaint',
    keywords: ['problema', 'reclamación', 'queja', 'malo', 'mala', 'terrible',
      'no funciona', 'roto', 'sucio', 'demora', 'retraso', 'insatisfecho',
      'molesto', 'enfadado', 'indignado', 'inaceptable',
      'complaint', 'problem', 'broken', 'terrible', 'unacceptable', 'angry'],
    weight: 1.0,
    minConfidence: 0.4,
  },
  {
    intent: 'human_help',
    keywords: ['persona real', 'hablar con alguien', 'agente', 'representante',
      'necesito ayuda', 'ayúdame', 'no entiendo', 'confundido',
      'humano', 'operador', 'atención al cliente', 'asesor',
      'hablar con un asesor', 'hablar con alguien', 'conectar con alguien',
      'human', 'real person', 'speak to someone', 'agent', 'representative', 'help me'],
    weight: 1.0,
    minConfidence: 0.3,
  },
  {
    intent: 'documentation_request',
    keywords: ['documentos', 'documentación', 'contrato', 'escritura', 'nota simple',
      'certificado', 'cédula', 'cedula', 'planos', 'fotos adicionales',
      'envíame', 'enviar', 'mandar', 'compartir',
      'documents', 'documentation', 'contract', 'certificate', 'floor plans', 'send me'],
    weight: 0.9,
    minConfidence: 0.35,
  },
  {
    intent: 'general_question',
    keywords: ['pregunta', 'consulta', 'información', 'informacion', 'saber',
      'cómo', 'como', 'cuándo', 'cuando', 'dónde', 'donde', 'qué', 'que',
      'horario', 'abierto', 'cerrado', 'servicios', 'zona',
      'question', 'inquiry', 'information', 'how', 'when', 'where', 'what', 'services'],
    weight: 0.5,
    minConfidence: 0.2,
  },
]

export function classifyIntent(text: string): IntentResult {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const words = normalized.split(/\s+/)

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  let bestIntent: IntentType = 'unknown'
  let bestScore = 0
  let bestKeywords: string[] = []

  for (const rule of INTENT_RULES) {
    const matched: string[] = []
    for (const kw of rule.keywords) {
      const kwNorm = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(kwNorm)}([^a-z0-9]|$)`)
      if (pattern.test(normalized)) {
        matched.push(kw)
      }
    }

    if (matched.length === 0) {
      continue
    }

    const coverage = matched.length / Math.max(rule.keywords.length * 0.15, 1)
    const density = matched.length / Math.max(words.length, 1)
    const baseScore = (coverage * 0.4 + density * 0.6) * rule.weight
    const boost = matched.length === 1 ? 0.25 : 0
    const score = Math.min(1, baseScore + boost)

    if (score > bestScore && score >= rule.minConfidence) {
      bestScore = score
      bestIntent = rule.intent
      bestKeywords = matched
    }
  }

  return {
    intent: bestIntent,
    confidence: Math.round(bestScore * 100) / 100,
    matched_keywords: bestKeywords,
    source: 'heuristic',
  }
}

function deriveDecision(intent: IntentResult): DecisionResult {
  switch (intent.intent) {
    case 'appointment_request':
      if (intent.confidence >= 0.5) {
        return { decision: 'suggest_appointment', reason: 'Cliente solicita visita/cita explícitamente', source: 'rule' }
      }
      return { decision: 'suggest_appointment', reason: 'Posible solicitud de cita, verificar disponibilidad', source: 'rule' }

    case 'complaint':
      return { decision: 'require_human', reason: 'Queja detectada, requiere intervención humana inmediata', source: 'rule' }

    case 'human_help':
      return { decision: 'require_human', reason: 'Cliente solicita hablar con persona real', source: 'rule' }

    case 'property_interest':
      if (intent.confidence >= 0.6) {
        return { decision: 'suggest_auto_reply', reason: 'Interés claro en propiedad, enviar información relevante', source: 'rule' }
      }
      return { decision: 'request_more_info', reason: 'Interés detectado pero sin detalles suficientes', source: 'rule' }

    case 'pricing_question':
      if (intent.confidence >= 0.35) {
        return { decision: 'suggest_auto_reply', reason: 'Consulta de precio, enviar información de precios/financiación', source: 'rule' }
      }
      return { decision: 'request_more_info', reason: 'Posible consulta de precio, pedir más contexto', source: 'rule' }

    case 'documentation_request':
      return { decision: 'suggest_auto_reply', reason: 'Solicitud de documentación, enviar enlaces/recursos', source: 'rule' }

    case 'general_question':
      if (intent.confidence >= 0.2) {
        return { decision: 'suggest_auto_reply', reason: 'Consulta general, respuesta automática posible', source: 'rule' }
      }
      return { decision: 'request_more_info', reason: 'Consulta poco clara, pedir aclaración', source: 'rule' }

    case 'unknown':
    default:
      return { decision: 'no_action', reason: 'Intención no detectada, requiere revisión manual', source: 'rule' }
  }
}

export function classifyMessage(text: string): ClassificationResult {
  const intent = classifyIntent(text)
  const decision = deriveDecision(intent)

  return {
    intent,
    decision,
    classified_at: new Date().toISOString(),
  }
}

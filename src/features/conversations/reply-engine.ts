import type { IntentType, DecisionType, AutoReplyResult, ReplyStatus } from './intent-types'

interface ReplyTemplate {
  id: string
  applies_to: { intent: IntentType; decision: DecisionType }
  generate: (vars: Record<string, string>) => string
  status: ReplyStatus
}

const TEMPLATES: ReplyTemplate[] = [
  {
    id: 'general_info',
    applies_to: { intent: 'general_question', decision: 'suggest_auto_reply' },
    generate: (v) => `Gracias por su consulta${v.contact_name ? ', ' + v.contact_name : ''}. Hemos recibido su mensaje y nuestro equipo le responderá con la información solicitada lo antes posible. Si necesita algo urgente, no dude en indicárnoslo.`,
    status: 'draft',
  },
  {
    id: 'property_interest_ack',
    applies_to: { intent: 'property_interest', decision: 'suggest_auto_reply' },
    generate: (v) => `Gracias por su interés${v.contact_name ? ', ' + v.contact_name : ''}. Nos alegra saber que la propiedad ha captado su atención. Le enviaremos más detalles y, si lo desea, podemos agendar una visita sin compromiso. ¿Le gustaría que le enviemos información adicional?`,
    status: 'draft',
  },
  {
    id: 'property_more_info',
    applies_to: { intent: 'property_interest', decision: 'request_more_info' },
    generate: () => `Gracias por su interés. Para poder ofrecerle la mejor asesoría, ¿podría indicarnos qué características son más importantes para usted? Por ejemplo: número de habitaciones, zona preferida, presupuesto aproximado o tipo de operación (compra/alquiler).`,
    status: 'draft',
  },
  {
    id: 'pricing_info',
    applies_to: { intent: 'pricing_question', decision: 'suggest_auto_reply' },
    generate: () => `Gracias por su consulta sobre precios. Para ofrecerle información precisa y actualizada, nuestro equipo comercial le contactará en breve con los detalles de disponibilidad y condiciones. ¿Prefiere que le contactemos por este mismo canal?`,
    status: 'draft',
  },
  {
    id: 'pricing_more_info',
    applies_to: { intent: 'pricing_question', decision: 'request_more_info' },
    generate: () => `Entendido. Para facilitarle información de precios más precisa, ¿podría indicarnos qué propiedad o zona le interesa? También nos ayudaría saber si busca compra o alquiler y su rango de presupuesto aproximado.`,
    status: 'draft',
  },
  {
    id: 'docs_info',
    applies_to: { intent: 'documentation_request', decision: 'suggest_auto_reply' },
    generate: () => `Hemos registrado su solicitud de documentación. Nuestro equipo le enviará los documentos solicitados a la brevedad. Si necesita algún documento específico (planos, escrituras, nota simple, certificado energético), por favor indíquelo y nos pondremos manos a la obra.`,
    status: 'draft',
  },
  {
    id: 'appointment_ack',
    applies_to: { intent: 'appointment_request', decision: 'suggest_appointment' },
    generate: () => `Gracias por su interés en programar una visita. Nuestro equipo de agendará la cita según su disponibilidad. ¿Qué días y horarios le vienen mejor? También puede indicarnos si prefiere visita presencial o videollamada.`,
    status: 'draft',
  },
  {
    id: 'more_info_generic',
    applies_to: { intent: 'general_question', decision: 'request_more_info' },
    generate: () => `Gracias por su mensaje. Para poder ayudarle mejor, ¿podría darnos un poco más de detalle sobre lo que necesita? Nuestro equipo estará encantado de asesorarle.`,
    status: 'draft',
  },
]

export function generateReply(params: {
  intent: IntentType
  decision: DecisionType
  confidence: number
  channel: string
  contactName?: string
}): AutoReplyResult | null {
  const { intent, decision, confidence, channel, contactName } = params

  if (decision === 'require_human' || decision === 'no_action') {
    return null
  }

  const template = TEMPLATES.find(
    t => t.applies_to.intent === intent && t.applies_to.decision === decision
  )

  if (!template) {
    if (decision === 'suggest_auto_reply' || decision === 'request_more_info') {
      return {
        reply_text: 'Entiendo lo que buscas. Déjame revisar qué opciones tenemos disponibles para ti.',
        reply_status: 'draft',
        template_id: 'fallback_acknowledgment',
        based_on_intent: intent,
        based_on_decision: decision,
        confidence,
        generated_at: new Date().toISOString(),
        channel,
      }
    }
    return null
  }

  const vars: Record<string, string> = {}
  if (contactName) vars.contact_name = contactName

  return {
    reply_text: template.generate(vars),
    reply_status: template.status,
    template_id: template.id,
    based_on_intent: intent,
    based_on_decision: decision,
    confidence,
    generated_at: new Date().toISOString(),
    channel,
  }
}

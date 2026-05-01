import type { IntentType, DecisionType, HumanSuggestionResult } from './intent-types'

interface HumanTemplate {
  id: string
  applies_to: { intent: IntentType; decision: DecisionType }
  generate: (ctx: Record<string, string>) => HumanSuggestionResult
}

const HUMAN_TEMPLATES: HumanTemplate[] = [
  {
    id: 'human_complaint',
    applies_to: { intent: 'complaint', decision: 'require_human' },
    generate: (ctx) => ({
      suggested_reply: `Lamentamos los inconvenientes que ha experimentado${ctx.contact_name ? ', ' + ctx.contact_name : ''}. Su caso ha sido escalado a un agente senior que se pondrá en contacto con usted para resolverlo a la brevedad. Agradecemos su paciencia y confianza.`,
      rationale: 'Queja detectada: respuesta empática + promesa de seguimiento personal',
      source: 'template',
      based_on_intent: 'complaint',
      based_on_decision: 'require_human',
      generated_at: new Date().toISOString(),
    }),
  },
  {
    id: 'human_help',
    applies_to: { intent: 'human_help', decision: 'require_human' },
    generate: (ctx) => ({
      suggested_reply: `Entendemos que necesita asistencia personalizada${ctx.contact_name ? ', ' + ctx.contact_name : ''}. Un agente de nuestro equipo le atenderá en breve para resolver todas sus dudas. ¿Prefiere que le contactemos por teléfono o por este medio?`,
      rationale: 'Solicitud de ayuda humana: confirmar canal de contacto preferido',
      source: 'template',
      based_on_intent: 'human_help',
      based_on_decision: 'require_human',
      generated_at: new Date().toISOString(),
    }),
  },
  {
    id: 'human_unknown',
    applies_to: { intent: 'unknown', decision: 'require_human' },
    generate: () => ({
      suggested_reply: 'Hemos recibido su mensaje y un agente lo revisará para ofrecerle la mejor atención posible. Le responderemos lo antes posible.',
      rationale: 'Intención no detectada: respuesta genérica de escalamiento',
      source: 'template',
      based_on_intent: 'unknown',
      based_on_decision: 'require_human',
      generated_at: new Date().toISOString(),
    }),
  },
]

export function generateHumanSuggestion(params: {
  intent: IntentType
  decision: DecisionType
  contactName?: string
  context?: Record<string, string>
}): HumanSuggestionResult | null {
  const { intent, decision, contactName, context = {} } = params

  if (decision !== 'require_human') return null

  const template = HUMAN_TEMPLATES.find(
    t => t.applies_to.intent === intent && t.applies_to.decision === decision
  )

  if (!template) {
    return {
      suggested_reply: 'Un agente de nuestro equipo le atenderá en breve. Gracias por su paciencia.',
      rationale: 'Fallback genérico para escalado humano',
      source: 'template',
      based_on_intent: intent,
      based_on_decision: decision,
      generated_at: new Date().toISOString(),
    }
  }

  const ctx: Record<string, string> = {}
  if (contactName) ctx.contact_name = contactName
  Object.assign(ctx, context)

  return template.generate(ctx)
}

import type { TaskRecord } from '@/features/tasks/types'

type TFunction = (key: string, params?: Record<string, string | number>) => string

type FormatCurrency = (value: number) => string

function fallbackLabel(label: string, fallback: string) {
  return label === fallback ? '' : label
}

function readContext(task: TaskRecord) {
  const meta = (task.metadata || {}) as Record<string, unknown>
  const ctx = (meta.extracted_context || {}) as Record<string, unknown>
  return {
    leadIntent: typeof ctx.lead_intent === 'string' ? ctx.lead_intent : null,
    interestKind: typeof ctx.interest_kind === 'string' ? ctx.interest_kind : null,
    propertyType: typeof ctx.property_type === 'string' ? ctx.property_type : null,
    locationLabel: typeof ctx.location_label === 'string' ? ctx.location_label : null,
    city: typeof ctx.city === 'string' ? ctx.city : null,
    budgetMax: typeof ctx.budget_max === 'number' ? ctx.budget_max : null,
    selectedPropertyTitle: typeof ctx.selected_property_title === 'string' ? ctx.selected_property_title : null,
    visitRequested: Boolean(ctx.visit_requested),
    financingRequested: Boolean(ctx.financing_requested),
    humanRequested: Boolean(ctx.human_followup_requested),
  }
}

function buildSummary(task: TaskRecord, t: TFunction, formatCurrency: FormatCurrency) {
  const ctx = readContext(task)
  const chips: string[] = []

  const intentLabel = ctx.interestKind === 'seller'
    ? t('tasksPage.generated.intent.seller')
    : ctx.leadIntent === 'buy'
      ? t('tasksPage.generated.intent.buy')
      : ctx.leadIntent === 'rent'
        ? t('tasksPage.generated.intent.rent')
        : ''

  if (intentLabel) chips.push(intentLabel)
  if (ctx.propertyType) {
    const propertyType = fallbackLabel(t(`propertyLabels.types.${ctx.propertyType}`), `propertyLabels.types.${ctx.propertyType}`) || ctx.propertyType
    chips.push(t('tasksPage.generated.fields.propertyType', { value: propertyType }))
  }
  if (ctx.locationLabel || ctx.city) chips.push(t('tasksPage.generated.fields.location', { value: ctx.locationLabel || ctx.city || '-' }))
  if (ctx.budgetMax) chips.push(t('tasksPage.generated.fields.budget', { value: formatCurrency(ctx.budgetMax) }))
  if (ctx.visitRequested) chips.push(t('tasksPage.generated.flags.visit'))
  if (ctx.financingRequested) chips.push(t('tasksPage.generated.flags.financing'))
  if (ctx.humanRequested) chips.push(t('tasksPage.generated.flags.human'))

  return chips.length > 0 ? chips.join(' · ') : (task.reason || task.description || '-')
}

function buildTitle(task: TaskRecord, t: TFunction) {
  const ctx = readContext(task)
  switch (task.action_type) {
    case 'human_followup_action':
      return t('tasksPage.generated.titles.human_followup_action')
    case 'visit_action':
      return ctx.selectedPropertyTitle
        ? t('tasksPage.generated.titles.visit_action_property', { property: ctx.selectedPropertyTitle })
        : t('tasksPage.generated.titles.visit_action')
    case 'seller_valuation_action':
      return t('tasksPage.generated.titles.seller_valuation_action')
    case 'financing_followup_action':
      return t('tasksPage.generated.titles.financing_followup_action')
    case 'buyer_contact_action':
      return t('tasksPage.generated.titles.buyer_contact_action')
    default:
      return task.title
  }
}

function buildNextStep(task: TaskRecord, t: TFunction) {
  const ctx = readContext(task)
  switch (task.action_type) {
    case 'human_followup_action':
      return t('tasksPage.generated.nextSteps.human_followup_action')
    case 'visit_action':
      return ctx.selectedPropertyTitle
        ? t('tasksPage.generated.nextSteps.visit_action_property', { property: ctx.selectedPropertyTitle })
        : t('tasksPage.generated.nextSteps.visit_action')
    case 'seller_valuation_action':
      return t('tasksPage.generated.nextSteps.seller_valuation_action')
    case 'financing_followup_action':
      return t('tasksPage.generated.nextSteps.financing_followup_action')
    case 'buyer_contact_action':
      return t('tasksPage.generated.nextSteps.buyer_contact_action')
    default:
      return task.next_step || '-'
  }
}

function buildLeadLabel(task: TaskRecord, t: TFunction) {
  if (!task.leads) return '-'
  const firstName = (task.leads.first_name || '').trim()
  const lastName = (task.leads.last_name || '').trim()
  if (lastName) return `${firstName} ${lastName}`.trim()

  const ctx = readContext(task)
  const normalized = firstName.toLowerCase()
  if (ctx.interestKind === 'seller' || ['propietario', 'seller', 'venditore'].includes(normalized)) return t('tasksPage.generated.leadKinds.seller')
  if (ctx.leadIntent === 'buy' || ['comprador', 'buyer', 'acquirente'].includes(normalized)) return t('tasksPage.generated.leadKinds.buyer')
  if (ctx.leadIntent === 'rent' || ['inquilino', 'tenant', 'locatario'].includes(normalized)) return t('tasksPage.generated.leadKinds.renter')
  if (['lead chatbot', 'chatbot lead', 'lead del chatbot'].includes(normalized)) return t('tasksPage.generated.leadKinds.chatbot')
  return firstName || '-'
}

function buildConversationLabel(task: TaskRecord, t: TFunction) {
  if (!task.conversations) return '-'
  const subject = (task.conversations.subject || '').trim()
  if (!subject) return task.conversations.id
  if (task.conversations.channel === 'chatbot') {
    if (subject === 'Chatbot conversation') return t('tasksPage.generated.context.chatbotConversation')
    if (subject.startsWith('Chat: ')) return t('tasksPage.generated.context.chatbotConversationWithName', { name: subject.slice(6) })
  }
  return subject
}

export function getTaskPresentation(task: TaskRecord, t: TFunction, formatCurrency: FormatCurrency) {
  if (task.source !== 'chatbot') {
    return {
      title: task.title,
      summary: task.reason || task.description || '-',
      nextStep: task.next_step || '-',
      sourceLabel: task.source,
      leadLabel: buildLeadLabel(task, t),
      conversationLabel: buildConversationLabel(task, t),
    }
  }

  const hasStructuredContext = Boolean((task.metadata as Record<string, unknown> | null)?.extracted_context)
  if (!hasStructuredContext) {
    return {
      title: buildTitle(task, t),
      summary: task.reason || task.description || '-',
      nextStep: task.next_step || '-',
      sourceLabel: t('tasksPage.sources.chatbot'),
      leadLabel: buildLeadLabel(task, t),
      conversationLabel: buildConversationLabel(task, t),
    }
  }

  return {
    title: buildTitle(task, t),
    summary: buildSummary(task, t, formatCurrency),
    nextStep: buildNextStep(task, t),
    sourceLabel: t('tasksPage.sources.chatbot'),
    leadLabel: buildLeadLabel(task, t),
    conversationLabel: buildConversationLabel(task, t),
  }
}

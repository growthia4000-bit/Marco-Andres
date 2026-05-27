'use client'

import { getBaseTemplateKey, renderTemplatePreview } from './whatsapp-templates'
import { useI18n } from '@/i18n/I18nProvider'

type TemplateVariable = {
  key: string
  label: string
  example: string
  required: boolean
}

type TemplateOption = {
  id: string
  base_template_key?: string
  template_key: string
  name: string
  language: string
  category: string
  params_required: number
  variables_schema: TemplateVariable[]
  body_text: string
  status: string
  meta_status: string | null
  usable: boolean
  rejection_reason: string | null
}

type Props = {
  templates: TemplateOption[]
  selectedId: string
  params: string[]
  onSelect: (id: string) => void
  onParamsChange: (params: string[]) => void
}

export function WhatsAppTemplatePicker(props: Props) {
  const { t } = useI18n()
  const selectedTemplate = props.templates.find((template) => template.id === props.selectedId) || null

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{t('conversations.whatsappTemplates.approved')}</p>
          <p className="mt-1 text-xs text-emerald-800">{t('conversations.whatsappTemplates.selectUsable')}</p>
        </div>
        {props.selectedId ? (
          <button onClick={() => { props.onSelect(''); props.onParamsChange([]) }} className="text-xs font-medium text-emerald-700 hover:text-emerald-900">
            {t('conversations.whatsappTemplates.clear')}
          </button>
        ) : null}
      </div>

      <select
        value={props.selectedId}
        onChange={(event) => {
          const id = event.target.value
          props.onSelect(id)
          const nextTemplate = props.templates.find((template) => template.id === id)
          props.onParamsChange(nextTemplate ? Array.from({ length: nextTemplate.params_required }, () => '') : [])
        }}
        className="mt-3 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <option value="">{t('conversations.whatsappTemplates.freeText')}</option>
        {props.templates.filter((template) => template.usable).map((template) => (
          <option key={template.id} value={template.id}>
            {getBaseTemplateKey(template.template_key)} · {template.language.toUpperCase()} · {template.template_key}
          </option>
        ))}
      </select>

      {selectedTemplate ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 text-[11px] text-emerald-800">
            <span className="rounded-full bg-white px-2 py-1">{t('conversations.whatsappTemplates.fields.base')}: {getBaseTemplateKey(selectedTemplate.template_key)}</span>
            <span className="rounded-full bg-white px-2 py-1">{t('conversations.whatsappTemplates.fields.language')}: {selectedTemplate.language.toUpperCase()}</span>
            <span className="rounded-full bg-white px-2 py-1">{t('conversations.whatsappTemplates.fields.meta')}: {selectedTemplate.name}</span>
            <span className="rounded-full bg-white px-2 py-1">{t('conversations.whatsappTemplates.fields.status')}: {selectedTemplate.meta_status || selectedTemplate.status}</span>
            <span className="rounded-full bg-white px-2 py-1">{t('conversations.whatsappTemplates.fields.category')}: {selectedTemplate.category}</span>
          </div>

          {selectedTemplate.variables_schema.map((variable, index) => (
            <label key={`${selectedTemplate.id}-${variable.key}-${index}`} className="block text-xs text-emerald-900">
              <span className="mb-1 block font-medium">{index + 1}. {variable.label}</span>
              <input
                value={props.params[index] || ''}
                onChange={(event) => {
                  const nextParams = [...props.params]
                  nextParams[index] = event.target.value
                  props.onParamsChange(nextParams)
                }}
                placeholder={variable.example}
                className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          ))}

          <div className="rounded-lg border border-emerald-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{t('conversations.whatsappTemplates.preview')}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{renderTemplatePreview(selectedTemplate.body_text, props.params)}</p>
            {selectedTemplate.rejection_reason ? <p className="mt-2 text-xs text-rose-600">{t('conversations.whatsappTemplates.rejectionReason')}: {selectedTemplate.rejection_reason}</p> : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-800">{t('conversations.whatsappTemplates.compatibilityPrefix')} <code>{t('conversations.whatsappTemplates.shortcutCode')}</code>{t('conversations.whatsappTemplates.compatibilitySuffix')}</p>
      )}
    </div>
  )
}

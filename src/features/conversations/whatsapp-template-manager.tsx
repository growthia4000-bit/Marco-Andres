'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Copy, Plus, RefreshCw, SendHorizonal, XCircle } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { buildDefaultVariablesSchema, countTemplateVariables, getBaseTemplateKey, slugifyTemplateKey } from './whatsapp-templates'
import { duplicateTenantWhatsAppTemplateAction, getTenantWhatsAppTemplatesAction, publishTenantWhatsAppTemplatesAction, saveTenantWhatsAppTemplateAction, syncTenantWhatsAppTemplatesAction, toggleTenantWhatsAppTemplateArchiveAction } from './actions'

type TemplateVariable = {
  key: string
  label: string
  example: string
  required: boolean
}

type TemplateRecord = {
  id: string
  template_key: string
  meta_template_name: string
  language_code: string
  locale: string
  category: string
  status: string
  meta_status: string | null
  meta_template_id: string | null
  body_text: string
  header_text: string | null
  footer_text: string | null
  variables_count: number
  variables_schema: TemplateVariable[]
  last_synced_at: string | null
  rejection_reason: string | null
  last_error: string | null
  is_active: boolean
  usable: boolean
}

type TemplateCatalogResponse = {
  templates: TemplateRecord[]
  activeConfig: {
    phoneNumberId: string
    displayPhoneNumber: string | null
    whatsappBusinessAccountId: string | null
    mode: string
    status: string
    canPublish: boolean
  } | null
}

type EditorState = {
  id: string | null
  template_key: string
  meta_template_name: string
  language_code: string
  locale: string
  category: string
  body_text: string
  header_text: string
  footer_text: string
  is_active: boolean
  variables_schema: TemplateVariable[]
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  template_key: '',
  meta_template_name: '',
  language_code: 'es',
  locale: 'es',
  category: 'utility',
  body_text: '',
  header_text: '',
  footer_text: '',
  is_active: true,
  variables_schema: [],
}

function syncVariableSchema(bodyText: string, current: TemplateVariable[]) {
  const detectedCount = countTemplateVariables(bodyText)
  const fallback = buildDefaultVariablesSchema(bodyText)
  return Array.from({ length: detectedCount }, (_, index) => current[index] || fallback[index])
}

function badgeClass(kind: 'usable' | 'pending' | 'rejected' | 'draft' | 'archived') {
  switch (kind) {
    case 'usable':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'pending':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'rejected':
      return 'bg-rose-100 text-rose-700 border-rose-200'
    case 'archived':
      return 'bg-slate-100 text-slate-600 border-slate-200'
    default:
      return 'bg-blue-100 text-blue-800 border-blue-200'
  }
}

type TemplateStateKind = 'archived' | 'usable' | 'rejected' | 'pendingMeta' | 'crmOnly'

function templateStateKind(template: TemplateRecord): { kind: TemplateStateKind; tone: 'usable' | 'pending' | 'rejected' | 'draft' | 'archived' } {
  if (!template.is_active || template.status === 'archived') return { kind: 'archived', tone: 'archived' }
  if (template.usable) return { kind: 'usable', tone: 'usable' }
  if (template.meta_status === 'REJECTED' || template.status === 'rejected') return { kind: 'rejected', tone: 'rejected' }
  if (template.meta_status || template.status === 'pending_meta' || template.status === 'in_review') return { kind: 'pendingMeta', tone: 'pending' }
  return { kind: 'crmOnly', tone: 'draft' }
}

export function WhatsAppTemplateManager() {
  const { t, localeCode } = useI18n()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [languageFilter, setLanguageFilter] = useState<string>(localeCode || 'es')
  const [hasManualLanguageFilter, setHasManualLanguageFilter] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | TemplateStateKind>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [catalog, setCatalog] = useState<TemplateCatalogResponse>({ templates: [], activeConfig: null })
  const [showEditor, setShowEditor] = useState(false)
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR)
  const sectionRef = useRef<HTMLDivElement | null>(null)
  const floatingScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const syncSourceRef = useRef<'floating' | 'table' | null>(null)
  const [tableScrollMetrics, setTableScrollMetrics] = useState({ scrollWidth: 0, clientWidth: 0 })
  const [floatingScrollbar, setFloatingScrollbar] = useState({ visible: false, width: 0, left: 0 })

  async function loadCatalog() {
    setLoading(true)
    try {
      const response = await getTenantWhatsAppTemplatesAction() as TemplateCatalogResponse
      setCatalog(response)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('conversations.templateManager.messages.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCatalog()
  }, [])

  useEffect(() => {
    if (!hasManualLanguageFilter && localeCode) {
      const normalizedLocale = localeCode.split('-')[0].toLowerCase()
      setLanguageFilter(normalizedLocale)
    }
  }, [localeCode, hasManualLanguageFilter])

  const filteredTemplates = useMemo(() => {
    const normalizedLanguageFilter = languageFilter === 'all' ? 'all' : languageFilter.toLowerCase()
    return catalog.templates.filter((template) => {
      const state = templateStateKind(template)
      const baseTemplateKey = getBaseTemplateKey(template.template_key)
      const matchesSearch = !search.trim()
        || template.template_key.toLowerCase().includes(search.toLowerCase())
        || baseTemplateKey.toLowerCase().includes(search.toLowerCase())
        || template.meta_template_name.toLowerCase().includes(search.toLowerCase())
        || template.body_text.toLowerCase().includes(search.toLowerCase())
      const matchesLanguage = normalizedLanguageFilter === 'all' || template.language_code.toLowerCase() === normalizedLanguageFilter
      const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter
      const matchesStatus = statusFilter === 'all' || state.kind === statusFilter
      return matchesSearch && matchesLanguage && matchesCategory && matchesStatus
    }).sort((a, b) => {
      const baseA = getBaseTemplateKey(a.template_key)
      const baseB = getBaseTemplateKey(b.template_key)
      if (baseA !== baseB) return baseA.localeCompare(baseB)
      return a.language_code.localeCompare(b.language_code)
    })
  }, [catalog.templates, search, languageFilter, categoryFilter, statusFilter])

  const languages = useMemo(() => Array.from(new Set(catalog.templates.map((template) => template.language_code))), [catalog.templates])
  const templateFamilies = useMemo(() => {
    const families = new Map<string, Set<string>>()
    for (const template of catalog.templates) {
      const baseKey = getBaseTemplateKey(template.template_key)
      const current = families.get(baseKey) || new Set<string>()
      current.add(template.language_code.toUpperCase())
      families.set(baseKey, current)
    }
    return families
  }, [catalog.templates])
  const hasHorizontalOverflow = tableScrollMetrics.scrollWidth > tableScrollMetrics.clientWidth + 1

  useEffect(() => {
    const tableScroll = tableScrollRef.current
    const floatingScroll = floatingScrollRef.current

    if (!tableScroll) return

    const syncMetrics = () => {
      setTableScrollMetrics((current) => {
        const next = {
          scrollWidth: tableScroll.scrollWidth,
          clientWidth: tableScroll.clientWidth,
        }
        return current.scrollWidth === next.scrollWidth && current.clientWidth === next.clientWidth ? current : next
      })
      if (floatingScroll) floatingScroll.scrollLeft = tableScroll.scrollLeft
    }

    const handleFloatingScroll = () => {
      if (!floatingScroll) return
      if (syncSourceRef.current === 'table') {
        syncSourceRef.current = null
        return
      }

      syncSourceRef.current = 'floating'
      tableScroll.scrollLeft = floatingScroll.scrollLeft
    }

    const handleTableScroll = () => {
      if (syncSourceRef.current === 'floating') {
        syncSourceRef.current = null
        return
      }

      syncSourceRef.current = 'table'
      if (floatingScroll) floatingScroll.scrollLeft = tableScroll.scrollLeft
    }

    syncMetrics()

    const resizeObserver = new ResizeObserver(() => {
      syncMetrics()
    })

    resizeObserver.observe(tableScroll)
    const table = tableScroll.querySelector('table')
    if (table) resizeObserver.observe(table)

    if (floatingScroll) floatingScroll.addEventListener('scroll', handleFloatingScroll)
    tableScroll.addEventListener('scroll', handleTableScroll)
    window.addEventListener('resize', syncMetrics)

    return () => {
      resizeObserver.disconnect()
      if (floatingScroll) floatingScroll.removeEventListener('scroll', handleFloatingScroll)
      tableScroll.removeEventListener('scroll', handleTableScroll)
      window.removeEventListener('resize', syncMetrics)
    }
  }, [filteredTemplates.length, floatingScrollbar.visible, hasHorizontalOverflow, loading])

  useEffect(() => {
    const syncFloatingScrollbar = () => {
      const section = sectionRef.current
      const tableScroll = tableScrollRef.current
      if (!section || !tableScroll || !hasHorizontalOverflow) {
        setFloatingScrollbar((current) => current.visible || current.width !== 0 || current.left !== 0
          ? { visible: false, width: 0, left: 0 }
          : current)
        return
      }

      const rect = tableScroll.getBoundingClientRect()
      const sectionRect = section.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const margin = 16
      const width = Math.max(Math.min(rect.width, viewportWidth - margin * 2), 0)
      const left = Math.min(Math.max(rect.left, margin), Math.max(viewportWidth - width - margin, margin))
      const visible = sectionRect.top < window.innerHeight - 120 && sectionRect.bottom > 140

      setFloatingScrollbar((current) => {
        const next = { visible, width, left }
        return current.visible === next.visible && current.width === next.width && current.left === next.left ? current : next
      })
    }

    syncFloatingScrollbar()
    window.addEventListener('scroll', syncFloatingScrollbar, { passive: true })
    window.addEventListener('resize', syncFloatingScrollbar)

    return () => {
      window.removeEventListener('scroll', syncFloatingScrollbar)
      window.removeEventListener('resize', syncFloatingScrollbar)
    }
  }, [hasHorizontalOverflow, filteredTemplates.length, loading])

  function openCreateModal() {
    setEditor(EMPTY_EDITOR)
    setShowEditor(true)
  }

  function openEditModal(template: TemplateRecord) {
    setEditor({
      id: template.id,
      template_key: template.template_key,
      meta_template_name: template.meta_template_name,
      language_code: template.language_code,
      locale: template.locale,
      category: template.category,
      body_text: template.body_text,
      header_text: template.header_text || '',
      footer_text: template.footer_text || '',
      is_active: template.is_active,
      variables_schema: template.variables_schema,
    })
    setShowEditor(true)
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function toggleSelectAll() {
    setSelectedIds((current) => current.length === filteredTemplates.length ? [] : filteredTemplates.map((template) => template.id))
  }

  async function handleSaveTemplate() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const fd = new FormData()
      if (editor.id) fd.set('id', editor.id)
      fd.set('template_key', editor.template_key)
      fd.set('meta_template_name', editor.meta_template_name)
      fd.set('language_code', editor.language_code)
      fd.set('locale', editor.locale)
      fd.set('category', editor.category)
      fd.set('body_text', editor.body_text)
      fd.set('header_text', editor.header_text)
      fd.set('footer_text', editor.footer_text)
      fd.set('is_active', String(editor.is_active))
      fd.set('variables_schema', JSON.stringify(editor.variables_schema))
      await saveTenantWhatsAppTemplateAction(fd)
      setMessage(editor.id ? t('conversations.templateManager.messages.saveSuccessUpdate') : t('conversations.templateManager.messages.saveSuccessCreate'))
      setShowEditor(false)
      await loadCatalog()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('conversations.templateManager.messages.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDuplicate(id: string) {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const fd = new FormData()
      fd.set('id', id)
      await duplicateTenantWhatsAppTemplateAction(fd)
      setMessage(t('conversations.templateManager.messages.duplicateSuccess'))
      await loadCatalog()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('conversations.templateManager.messages.duplicateError'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleArchive(id: string, archive: boolean) {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const fd = new FormData()
      fd.set('id', id)
      fd.set('archive', String(archive))
      await toggleTenantWhatsAppTemplateArchiveAction(fd)
      setMessage(archive ? t('conversations.templateManager.messages.archiveSuccess') : t('conversations.templateManager.messages.reactivateSuccess'))
      await loadCatalog()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('conversations.templateManager.messages.archiveError'))
    } finally {
      setSubmitting(false)
    }
  }

  async function runBatchAction(kind: 'publish' | 'sync', ids: string[]) {
    if (ids.length === 0) {
      setError(kind === 'publish'
        ? t('conversations.templateManager.messages.selectAtLeastOnePublish')
        : t('conversations.templateManager.messages.selectAtLeastOneSync'))
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const fd = new FormData()
      fd.set('ids', JSON.stringify(ids))
      const response = kind === 'publish'
        ? await publishTenantWhatsAppTemplatesAction(fd) as { results: Array<{ ok: boolean }> }
        : await syncTenantWhatsAppTemplatesAction(fd) as { results: Array<{ ok: boolean }> }
      const okCount = response.results.filter((result) => result.ok).length
      const failCount = response.results.length - okCount
      setMessage(kind === 'publish'
        ? t('conversations.templateManager.messages.publishCompleted', { ok: okCount, fail: failCount })
        : t('conversations.templateManager.messages.syncCompleted', { ok: okCount, fail: failCount }))
      setSelectedIds([])
      await loadCatalog()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('conversations.templateManager.messages.batchError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={sectionRef} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 pb-20 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t('conversations.templateManager.title')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('conversations.templateManager.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runBatchAction('publish', selectedIds)}
            disabled={submitting || selectedIds.length === 0 || !catalog.activeConfig?.canPublish}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <SendHorizonal size={14} />
            {t('conversations.templateManager.actions.publishSelected')}
          </button>
          <button
            onClick={() => runBatchAction('sync', selectedIds.length > 0 ? selectedIds : catalog.templates.map((template) => template.id))}
            disabled={submitting || !catalog.activeConfig?.canPublish}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            {t('conversations.templateManager.actions.syncStates')}
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={14} />
            {t('conversations.templateManager.actions.create')}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('conversations.templateManager.filters.searchPlaceholder')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
        />
        <select value={languageFilter} onChange={(event) => { setLanguageFilter(event.target.value); setHasManualLanguageFilter(true); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">{t('conversations.templateManager.filters.allLanguages')}</option>
          {languages.map((language) => (
            <option key={language} value={language}>
              {language.toLowerCase() === 'es' ? t('conversations.templateManager.filters.langEs') : language.toLowerCase() === 'en' ? t('conversations.templateManager.filters.langEn') : language.toLowerCase() === 'it' ? t('conversations.templateManager.filters.langIt') : language}
            </option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">{t('conversations.templateManager.filters.allCategories')}</option>
          <option value="marketing">{t('conversations.templateManager.filters.categoryMarketing')}</option>
          <option value="utility">{t('conversations.templateManager.filters.categoryUtility')}</option>
          <option value="authentication">{t('conversations.templateManager.filters.categoryAuthentication')}</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | TemplateStateKind)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">{t('conversations.templateManager.filters.allStatuses')}</option>
          <option value="usable">{t('conversations.templateManager.states.usable')}</option>
          <option value="pendingMeta">{t('conversations.templateManager.states.pendingMeta')}</option>
          <option value="rejected">{t('conversations.templateManager.states.rejected')}</option>
          <option value="crmOnly">{t('conversations.templateManager.states.crmOnly')}</option>
          <option value="archived">{t('conversations.templateManager.states.archived')}</option>
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1">{t('conversations.templateManager.stats.total', { count: catalog.templates.length })}</span>
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1">{t('conversations.templateManager.stats.baseKeys', { count: templateFamilies.size })}</span>
        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{t('conversations.templateManager.stats.usables', { count: catalog.templates.filter((template) => template.usable).length })}</span>
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">{t('conversations.templateManager.stats.pending', { count: catalog.templates.filter((template) => !template.usable && template.is_active).length })}</span>
        {catalog.activeConfig ? (
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            {t('conversations.templateManager.stats.activeSender', { sender: catalog.activeConfig.displayPhoneNumber || catalog.activeConfig.phoneNumberId })}
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">{t('conversations.templateManager.stats.noActiveConfig')}</span>
        )}
      </div>

      {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="mt-4 relative">
        <div
          ref={tableScrollRef}
          className="overflow-x-scroll rounded-t-xl border border-b-0 border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <table className="w-full min-w-[1480px] bg-white">
            <colgroup>
              <col className="w-14" />
              <col className="w-[17%]" />
              <col className="w-[24%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[15%] min-w-[520px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-center"><input type="checkbox" checked={filteredTemplates.length > 0 && selectedIds.length === filteredTemplates.length} onChange={toggleSelectAll} /></th>
                <th className="px-4 py-3 align-top">{t('conversations.templateManager.table.colBaseKey')}</th>
                <th className="px-4 py-3 align-top">{t('conversations.templateManager.table.colVariant')}</th>
                <th className="px-4 py-3 align-top">{t('conversations.templateManager.table.colVariables')}</th>
                <th className="px-4 py-3 align-top">{t('conversations.templateManager.table.colStatus')}</th>
                <th className="px-4 py-3 align-top">{t('conversations.templateManager.table.colMeta')}</th>
                <th className="px-4 py-3 align-top whitespace-nowrap">{t('conversations.templateManager.table.colLastSync')}</th>
                <th className="px-6 py-3 text-right align-top whitespace-nowrap">{t('conversations.templateManager.table.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">{t('conversations.templateManager.table.loading')}</td></tr>
              ) : filteredTemplates.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">{t('conversations.templateManager.table.empty')}</td></tr>
              ) : filteredTemplates.map((template) => {
                const state = templateStateKind(template)
                const baseKey = getBaseTemplateKey(template.template_key)
                const familyLanguages = Array.from(templateFamilies.get(baseKey) || []).sort().join(' / ')
                return (
                  <tr key={template.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-4 text-center"><input type="checkbox" checked={selectedIds.includes(template.id)} onChange={() => toggleSelected(template.id)} /></td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium text-slate-900">{baseKey}</div>
                      <div className="mt-1 text-xs text-slate-500">{t('conversations.templateManager.table.availableLanguages', { languages: familyLanguages || template.language_code.toUpperCase() })}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium text-slate-900">{template.template_key}</div>
                      <div className="mt-1 text-xs text-slate-500">{t('conversations.templateManager.table.metaLabel', { name: template.meta_template_name })}</div>
                      <div className="mt-2 text-xs text-slate-500">{template.language_code.toUpperCase()} · {template.category}</div>
                      <p className="mt-2 line-clamp-2 max-w-md text-sm text-slate-700">{template.body_text}</p>
                      {template.last_error ? <p className="mt-2 text-xs text-rose-600">{template.last_error}</p> : null}
                      {template.rejection_reason ? <p className="mt-2 text-xs text-rose-600">{t('conversations.templateManager.table.metaRejection', { reason: template.rejection_reason })}</p> : null}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-slate-700">
                      <div>{t('conversations.templateManager.table.parameters', { count: template.variables_count })}</div>
                      <div className="mt-2 flex max-w-xs flex-wrap gap-1">
                        {template.variables_schema.map((variable, index) => (
                          <span key={`${template.id}-${variable.key}-${index}`} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                            {index + 1}. {variable.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(state.tone)}`}>{t(`conversations.templateManager.states.${state.kind}`)}</span>
                      <div className="mt-2 text-xs text-slate-500">{t('conversations.templateManager.table.internal', { status: template.status === 'draft' ? t('conversations.channelsPanel.ui.statusDraft') : template.status })}</div>
                      <div className="mt-1 text-xs text-slate-500">{t('conversations.templateManager.table.active', { value: template.is_active ? t('conversations.templateManager.table.yes') : t('conversations.templateManager.table.no') })}</div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-slate-700">
                      <div>{template.meta_status || t('conversations.templateManager.table.notPublished')}</div>
                      <div className="mt-1 text-xs text-slate-500">{t('conversations.templateManager.table.metaId', { id: template.meta_template_id || '—' })}</div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-slate-700 whitespace-nowrap">{template.last_synced_at ? new Date(template.last_synced_at).toLocaleString() : t('conversations.templateManager.table.never')}</td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-nowrap justify-end gap-2 pr-1 whitespace-nowrap">
                        <button onClick={() => openEditModal(template)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{t('conversations.templateManager.actions.edit')}</button>
                        <button onClick={() => handleDuplicate(template.id)} disabled={submitting} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Copy size={12} />{t('conversations.templateManager.actions.duplicate')}</button>
                        <button onClick={() => runBatchAction('publish', [template.id])} disabled={submitting || !catalog.activeConfig?.canPublish} className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"><SendHorizonal size={12} />{t('conversations.templateManager.actions.publish')}</button>
                        <button onClick={() => runBatchAction('sync', [template.id])} disabled={submitting || !catalog.activeConfig?.canPublish} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={12} />{t('conversations.templateManager.actions.sync')}</button>
                        <button onClick={() => handleArchive(template.id, template.is_active)} disabled={submitting} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Archive size={12} />{template.is_active ? t('conversations.templateManager.actions.archive') : t('conversations.templateManager.actions.activate')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="sticky bottom-0 z-20 flex items-center gap-2 rounded-b-xl border border-t-0 border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 shrink-0">{t('conversations.templateManager.table.horizontalScroll')}</span>
          <div ref={floatingScrollRef} className="flex-1 cursor-grab overflow-x-auto overflow-y-hidden active:cursor-grabbing" aria-label={t('conversations.templateManager.table.horizontalScrollAria')}>
            <div style={{ width: Math.max(tableScrollMetrics.scrollWidth, 1480), height: 6 }} />
          </div>
        </div>
      </div>

      {showEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">{editor.id ? t('conversations.templateManager.editor.titleEdit') : t('conversations.templateManager.editor.titleCreate')}</h4>
                <p className="mt-1 text-sm text-slate-500">{t('conversations.templateManager.editor.subtitle')}</p>
              </div>
              <button onClick={() => setShowEditor(false)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><XCircle size={18} /></button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">{t('conversations.templateManager.editor.templateKey')}</span>
                <input value={editor.template_key} onChange={(event) => setEditor((current) => ({ ...current, template_key: slugifyTemplateKey(event.target.value) }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">{t('conversations.templateManager.editor.metaName')}</span>
                <input value={editor.meta_template_name} onChange={(event) => setEditor((current) => ({ ...current, meta_template_name: slugifyTemplateKey(event.target.value) }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">{t('conversations.templateManager.editor.language')}</span>
                <input value={editor.language_code} onChange={(event) => setEditor((current) => ({ ...current, language_code: event.target.value || 'es', locale: event.target.value || 'es' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">{t('conversations.templateManager.editor.category')}</span>
                <select value={editor.category} onChange={(event) => setEditor((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="utility">{t('conversations.templateManager.filters.categoryUtility')}</option>
                  <option value="marketing">{t('conversations.templateManager.filters.categoryMarketing')}</option>
                  <option value="authentication">{t('conversations.templateManager.filters.categoryAuthentication')}</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">{t('conversations.templateManager.editor.headerOptional')}</span>
                <input value={editor.header_text} onChange={(event) => setEditor((current) => ({ ...current, header_text: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">{t('conversations.templateManager.editor.body')}</span>
                <textarea
                  value={editor.body_text}
                  onChange={(event) => {
                    const bodyText = event.target.value
                    setEditor((current) => ({
                      ...current,
                      body_text: bodyText,
                      variables_schema: syncVariableSchema(bodyText, current.variables_schema),
                    }))
                  }}
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="mt-1 block text-xs text-slate-500">{t('conversations.templateManager.editor.bodyHint')}</span>
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">{t('conversations.templateManager.editor.footerOptional')}</span>
                <input value={editor.footer_text} onChange={(event) => setEditor((current) => ({ ...current, footer_text: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h5 className="text-sm font-semibold text-slate-900">{t('conversations.templateManager.editor.variablesTitle')}</h5>
                  <p className="text-xs text-slate-500">{t('conversations.templateManager.editor.variablesHint')}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{t('conversations.templateManager.editor.variablesCount', { count: editor.variables_schema.length })}</span>
              </div>
              <div className="mt-3 space-y-3">
                {editor.variables_schema.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('conversations.templateManager.editor.noVariables')}</p>
                ) : editor.variables_schema.map((variable, index) => (
                  <div key={`${variable.key}-${index}`} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-3">
                    <input
                      value={variable.key}
                      onChange={(event) => setEditor((current) => ({
                        ...current,
                        variables_schema: current.variables_schema.map((item, itemIndex) => itemIndex === index ? { ...item, key: slugifyTemplateKey(event.target.value) || `param_${index + 1}` } : item),
                      }))}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder={t('conversations.templateManager.editor.paramPlaceholder', { index: index + 1 })}
                    />
                    <input
                      value={variable.label}
                      onChange={(event) => setEditor((current) => ({
                        ...current,
                        variables_schema: current.variables_schema.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item),
                      }))}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder={t('conversations.templateManager.editor.labelPlaceholder', { index: index + 1 })}
                    />
                    <input
                      value={variable.example}
                      onChange={(event) => setEditor((current) => ({
                        ...current,
                        variables_schema: current.variables_schema.map((item, itemIndex) => itemIndex === index ? { ...item, example: event.target.value } : item),
                      }))}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder={t('conversations.templateManager.editor.examplePlaceholder', { index: index + 1 })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editor.is_active} onChange={(event) => setEditor((current) => ({ ...current, is_active: event.target.checked }))} />
                {t('conversations.templateManager.editor.activeInCrm')}
              </label>
              <div className="flex gap-2">
                <button onClick={() => setShowEditor(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{t('conversations.templateManager.editor.cancel')}</button>
                <button onClick={handleSaveTemplate} disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {submitting ? t('conversations.templateManager.editor.saving') : t('conversations.templateManager.editor.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

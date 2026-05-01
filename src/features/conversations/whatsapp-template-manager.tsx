'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Copy, Plus, RefreshCw, SendHorizonal, XCircle } from 'lucide-react'
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

function templateStateLabel(template: TemplateRecord) {
  if (!template.is_active || template.status === 'archived') return { label: 'Archivada', tone: 'archived' as const }
  if (template.usable) return { label: 'Usable', tone: 'usable' as const }
  if (template.meta_status === 'REJECTED' || template.status === 'rejected') return { label: 'Rechazada', tone: 'rejected' as const }
  if (template.meta_status || template.status === 'pending_meta' || template.status === 'in_review') return { label: 'Pendiente Meta', tone: 'pending' as const }
  return { label: 'Solo CRM', tone: 'draft' as const }
}

export function WhatsAppTemplateManager() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
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
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el catálogo de plantillas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCatalog()
  }, [])

  const filteredTemplates = useMemo(() => {
    return catalog.templates.filter((template) => {
      const state = templateStateLabel(template)
      const baseTemplateKey = getBaseTemplateKey(template.template_key)
      const matchesSearch = !search.trim()
        || template.template_key.toLowerCase().includes(search.toLowerCase())
        || baseTemplateKey.toLowerCase().includes(search.toLowerCase())
        || template.meta_template_name.toLowerCase().includes(search.toLowerCase())
        || template.body_text.toLowerCase().includes(search.toLowerCase())
      const matchesLanguage = languageFilter === 'all' || template.language_code === languageFilter
      const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter
      const matchesStatus = statusFilter === 'all' || state.label === statusFilter
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
      setMessage(editor.id ? 'Plantilla actualizada correctamente.' : 'Plantilla creada correctamente.')
      setShowEditor(false)
      await loadCatalog()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la plantilla')
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
      setMessage('Plantilla duplicada correctamente.')
      await loadCatalog()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo duplicar la plantilla')
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
      setMessage(archive ? 'Plantilla archivada.' : 'Plantilla reactivada.')
      await loadCatalog()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo actualizar la plantilla')
    } finally {
      setSubmitting(false)
    }
  }

  async function runBatchAction(kind: 'publish' | 'sync', ids: string[]) {
    if (ids.length === 0) {
      setError(`Selecciona al menos una plantilla para ${kind === 'publish' ? 'publicar' : 'sincronizar'}.`)
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
      setMessage(`${kind === 'publish' ? 'Publicación' : 'Sincronización'} completada. OK: ${okCount}. Fallos: ${failCount}.`)
      setSelectedIds([])
      await loadCatalog()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo ejecutar la acción masiva')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={sectionRef} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 pb-20 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Plantillas WhatsApp</h3>
          <p className="mt-1 text-sm text-slate-500">Gestiona el catálogo interno, publica en Meta y sincroniza estados reales sin trabajar a mano.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runBatchAction('publish', selectedIds)}
            disabled={submitting || selectedIds.length === 0 || !catalog.activeConfig?.canPublish}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <SendHorizonal size={14} />
            Publicar seleccionadas
          </button>
          <button
            onClick={() => runBatchAction('sync', selectedIds.length > 0 ? selectedIds : catalog.templates.map((template) => template.id))}
            disabled={submitting || !catalog.activeConfig?.canPublish}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Sincronizar estados
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={14} />
            Crear plantilla
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o texto"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
        />
        <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">Todos los idiomas</option>
          {languages.map((language) => <option key={language} value={language}>{language}</option>)}
        </select>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">Todas las categorías</option>
          <option value="marketing">Marketing</option>
          <option value="utility">Utility</option>
          <option value="authentication">Authentication</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">Todos los estados</option>
          <option value="Usable">Usable</option>
          <option value="Pendiente Meta">Pendiente Meta</option>
          <option value="Rechazada">Rechazada</option>
          <option value="Solo CRM">Solo CRM</option>
          <option value="Archivada">Archivada</option>
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1">Total: {catalog.templates.length}</span>
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1">Base keys: {templateFamilies.size}</span>
        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">Usables: {catalog.templates.filter((template) => template.usable).length}</span>
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">Pendientes: {catalog.templates.filter((template) => !template.usable && template.is_active).length}</span>
        {catalog.activeConfig ? (
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            Emisor activo: {catalog.activeConfig.displayPhoneNumber || catalog.activeConfig.phoneNumberId}
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">Sin configuración activa de WhatsApp para publicar</span>
        )}
      </div>

      {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <div
        ref={tableScrollRef}
        className="table-scrollbar-hidden mt-4 overflow-x-auto rounded-xl border border-slate-200"
      >
        <table className="w-full min-w-[1400px] bg-white">
          <colgroup>
            <col className="w-14" />
            <col className="w-[17%]" />
            <col className="w-[25%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[12%] min-w-[280px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-center"><input type="checkbox" checked={filteredTemplates.length > 0 && selectedIds.length === filteredTemplates.length} onChange={toggleSelectAll} /></th>
              <th className="px-4 py-3 align-top">Base key</th>
              <th className="px-4 py-3 align-top">Variante</th>
              <th className="px-4 py-3 align-top">Variables</th>
              <th className="px-4 py-3 align-top">Estado</th>
              <th className="px-4 py-3 align-top">Meta</th>
              <th className="px-4 py-3 align-top whitespace-nowrap">Último sync</th>
              <th className="px-6 py-3 text-right align-top whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">Cargando catálogo...</td></tr>
            ) : filteredTemplates.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No hay plantillas para los filtros seleccionados.</td></tr>
            ) : filteredTemplates.map((template) => {
              const state = templateStateLabel(template)
              const baseKey = getBaseTemplateKey(template.template_key)
              const familyLanguages = Array.from(templateFamilies.get(baseKey) || []).sort().join(' / ')
              return (
                <tr key={template.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-4 text-center"><input type="checkbox" checked={selectedIds.includes(template.id)} onChange={() => toggleSelected(template.id)} /></td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium text-slate-900">{baseKey}</div>
                    <div className="mt-1 text-xs text-slate-500">Idiomas disponibles: {familyLanguages || template.language_code.toUpperCase()}</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium text-slate-900">{template.template_key}</div>
                    <div className="mt-1 text-xs text-slate-500">Meta: {template.meta_template_name}</div>
                    <div className="mt-2 text-xs text-slate-500">{template.language_code.toUpperCase()} · {template.category}</div>
                    <p className="mt-2 line-clamp-2 max-w-md text-sm text-slate-700">{template.body_text}</p>
                    {template.last_error ? <p className="mt-2 text-xs text-rose-600">{template.last_error}</p> : null}
                    {template.rejection_reason ? <p className="mt-2 text-xs text-rose-600">Rechazo Meta: {template.rejection_reason}</p> : null}
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-slate-700">
                    <div>{template.variables_count} parámetros</div>
                    <div className="mt-2 flex max-w-xs flex-wrap gap-1">
                      {template.variables_schema.map((variable, index) => (
                        <span key={`${template.id}-${variable.key}-${index}`} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                          {index + 1}. {variable.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(state.tone)}`}>{state.label}</span>
                    <div className="mt-2 text-xs text-slate-500">Interno: {template.status}</div>
                    <div className="mt-1 text-xs text-slate-500">Activa: {template.is_active ? 'Sí' : 'No'}</div>
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-slate-700">
                    <div>{template.meta_status || 'Sin publicar'}</div>
                    <div className="mt-1 text-xs text-slate-500">ID: {template.meta_template_id || '—'}</div>
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-slate-700 whitespace-nowrap">{template.last_synced_at ? new Date(template.last_synced_at).toLocaleString() : 'Nunca'}</td>
                  <td className="px-6 py-4 align-top">
                    <div className="flex min-w-[280px] justify-end gap-2 pr-1">
                      <button onClick={() => openEditModal(template)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Editar</button>
                      <button onClick={() => handleDuplicate(template.id)} disabled={submitting} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Copy size={12} />Duplicar</button>
                      <button onClick={() => runBatchAction('publish', [template.id])} disabled={submitting || !catalog.activeConfig?.canPublish} className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"><SendHorizonal size={12} />Publicar</button>
                      <button onClick={() => runBatchAction('sync', [template.id])} disabled={submitting || !catalog.activeConfig?.canPublish} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={12} />Sync</button>
                      <button onClick={() => handleArchive(template.id, template.is_active)} disabled={submitting} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Archive size={12} />{template.is_active ? 'Archivar' : 'Activar'}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasHorizontalOverflow && floatingScrollbar.visible ? (
        <div className="pointer-events-none fixed bottom-4 z-40" style={{ left: floatingScrollbar.left, width: floatingScrollbar.width }}>
          <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Desplazamiento horizontal</div>
            <div ref={floatingScrollRef} className="overflow-x-auto overflow-y-hidden" aria-label="Control horizontal flotante de la tabla de plantillas WhatsApp">
              <div style={{ width: tableScrollMetrics.scrollWidth, height: 1 }} />
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .table-scrollbar-hidden {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .table-scrollbar-hidden::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {showEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">{editor.id ? 'Editar plantilla WhatsApp' : 'Crear plantilla WhatsApp'}</h4>
                <p className="mt-1 text-sm text-slate-500">El CRM guarda el catálogo interno y usa Meta como fuente de aprobación real.</p>
              </div>
              <button onClick={() => setShowEditor(false)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><XCircle size={18} /></button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Template key interno</span>
                <input value={editor.template_key} onChange={(event) => setEditor((current) => ({ ...current, template_key: slugifyTemplateKey(event.target.value) }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Nombre Meta</span>
                <input value={editor.meta_template_name} onChange={(event) => setEditor((current) => ({ ...current, meta_template_name: slugifyTemplateKey(event.target.value) }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Idioma</span>
                <input value={editor.language_code} onChange={(event) => setEditor((current) => ({ ...current, language_code: event.target.value || 'es', locale: event.target.value || 'es' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Categoría</span>
                <select value={editor.category} onChange={(event) => setEditor((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="utility">Utility</option>
                  <option value="marketing">Marketing</option>
                  <option value="authentication">Authentication</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Header opcional</span>
                <input value={editor.header_text} onChange={(event) => setEditor((current) => ({ ...current, header_text: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Body</span>
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
                <span className="mt-1 block text-xs text-slate-500">Usa variables Meta como {'{{1}}'}, {'{{2}}'}, {'{{3}}'}.</span>
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Footer opcional</span>
                <input value={editor.footer_text} onChange={(event) => setEditor((current) => ({ ...current, footer_text: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h5 className="text-sm font-semibold text-slate-900">Variables esperadas</h5>
                  <p className="text-xs text-slate-500">Define etiqueta y ejemplo para cada variable detectada en el body.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{editor.variables_schema.length} variables</span>
              </div>
              <div className="mt-3 space-y-3">
                {editor.variables_schema.length === 0 ? (
                  <p className="text-sm text-slate-500">Esta plantilla no requiere variables.</p>
                ) : editor.variables_schema.map((variable, index) => (
                  <div key={`${variable.key}-${index}`} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-3">
                    <input
                      value={variable.key}
                      onChange={(event) => setEditor((current) => ({
                        ...current,
                        variables_schema: current.variables_schema.map((item, itemIndex) => itemIndex === index ? { ...item, key: slugifyTemplateKey(event.target.value) || `param_${index + 1}` } : item),
                      }))}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder={`param_${index + 1}`}
                    />
                    <input
                      value={variable.label}
                      onChange={(event) => setEditor((current) => ({
                        ...current,
                        variables_schema: current.variables_schema.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item),
                      }))}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder={`Etiqueta ${index + 1}`}
                    />
                    <input
                      value={variable.example}
                      onChange={(event) => setEditor((current) => ({
                        ...current,
                        variables_schema: current.variables_schema.map((item, itemIndex) => itemIndex === index ? { ...item, example: event.target.value } : item),
                      }))}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder={`Ejemplo ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editor.is_active} onChange={(event) => setEditor((current) => ({ ...current, is_active: event.target.checked }))} />
                Plantilla activa dentro del CRM
              </label>
              <div className="flex gap-2">
                <button onClick={() => setShowEditor(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button onClick={handleSaveTemplate} disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {submitting ? 'Guardando...' : 'Guardar plantilla'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

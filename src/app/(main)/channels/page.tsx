'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Inbox, Mail, MessageCircle, SendHorizonal } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { getChannelDiagnosticsAction, syncEmailInboxAction, testEmailChannelAction, testWhatsAppChannelAction, saveWhatsAppConfigAction } from '@/features/conversations/actions'
import { WhatsAppTemplateManager } from '@/features/conversations/whatsapp-template-manager'

type LatestTest = {
  event_type: string
  created_at: string
  payload: Record<string, unknown> | null
}

type ChannelDiagnostics = {
  runtimeError: string | null
  email: {
    configured: boolean
    provider: string
    presentVars: string[]
    missingVars: string[]
    latestTest: LatestTest | null
    graph: {
      configured: boolean
      presentVars: string[]
      missingVars: string[]
      dbConfig: {
        activeConfig: boolean
        emailAddress: string | null
        status: string | null
        expiresAt: string | null
        lastSendAt: string | null
        lastSyncAt: string | null
        requiresReconnect: boolean
      } | null
    }
    demo: {
      enabled: boolean
    }
    inbound: {
      configured: boolean
      presentVars: string[]
      missingVars: string[]
      latestSync: LatestTest | null
      latestSyncManual: LatestTest | null
      latestSyncAuto: LatestTest | null
      latestSyncAutoImported: LatestTest | null
      scheduler: {
        started: boolean
        tickCount: number
        enabled: boolean
        mechanism: 'server_process' | 'external_scheduler_only' | 'disabled'
        intervalMs: number
        running: boolean
        startedAt: string | null
        lastStartedBy: string | null
        lastHeartbeatAt: string | null
        lastSuccessAt: string | null
        lastFailureAt: string | null
        lastSkipAt: string | null
        lastError: string | null
        lastRunSource: 'manual' | 'auto' | null
        lockFilePath: string
        routeEnabled: boolean
      }
    }
  }
  whatsapp: {
    configured: boolean
    provider: string
    mode: 'sandbox' | 'production'
    presentVars: string[]
    missingVars: string[]
    latestTest: LatestTest | null
    dbConfig: {
      activeConfig: boolean
      phoneNumberId: string | null
      displayPhoneNumber: string | null
      status: string | null
      verifiedAt: string | null
      mode: string | null
      businessAccountId: string | null
      accessTokenConfigured: boolean
      isComplete: boolean
      canTest: boolean
      productionChecklist: string[]
      productionReady: boolean
      metaPhoneNumber: {
        phoneNumberId: string | null
        displayPhoneNumber: string | null
        verifiedName: string | null
        qualityRating: string | null
        nameStatus: string | null
        codeVerificationStatus: string | null
        isOfficialBusinessAccount: boolean | null
      } | null
      metaWaba: {
        id: string | null
        name: string | null
      } | null
      metaDiagnosticsError: string | null
      displayNumberMismatch: boolean
      resolvedEnvironment: 'sandbox' | 'production'
      isTestNumber: boolean
    } | null
    configSource: 'none' | 'db_config' | 'env_fallback'
  }
}

function toneClass(kind: 'verified' | 'sandbox' | 'pending' | 'failed') {
  switch (kind) {
    case 'verified':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'sandbox':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

function environmentTone(environment: 'sandbox' | 'production', ready: boolean) {
  if (environment === 'production' && ready) return 'verified' as const
  if (environment === 'sandbox') return 'sandbox' as const
  return 'pending' as const
}

function summarizeLatestTest(t: (key: string, vars?: Record<string, string | number>) => string, formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string, test: LatestTest | null) {
  if (!test) return null
  const payload = test.payload || {}
  const status = test.event_type.endsWith('.sent') || test.event_type.endsWith('.completed') ? 'sent' : 'failed'
  return {
    status,
    provider: typeof payload.provider === 'string' ? payload.provider : null,
    error: typeof payload.reason === 'string' ? payload.reason : null,
    date: formatDate(test.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    line: t('conversations.channelsPanel.lastResult', {
      status: t(`conversations.delivery.status.${status}`),
      date: formatDate(test.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }),
    type: typeof payload.actual_type === 'string' ? payload.actual_type : null,
    sandbox: payload.sandbox === true,
    template: typeof payload.template_name === 'string' ? payload.template_name : null,
    fetched: typeof payload.fetched === 'number' ? payload.fetched : null,
    imported: typeof payload.imported === 'number' ? payload.imported : null,
    skipped: typeof payload.skipped === 'number' ? payload.skipped : null,
    failed: typeof payload.failed === 'number' ? payload.failed : null,
    threaded: typeof payload.threaded === 'number' ? payload.threaded : null,
    created: typeof payload.created === 'number' ? payload.created : null,
    irrelevant: typeof payload.irrelevant === 'number' ? payload.irrelevant : null,
    skippedReasons: payload.skipped_reasons && typeof payload.skipped_reasons === 'object' ? payload.skipped_reasons as Record<string, unknown> : null,
    failedReasons: payload.failed_reasons && typeof payload.failed_reasons === 'object' ? payload.failed_reasons as Record<string, unknown> : null,
    source: typeof payload.source === 'string' ? payload.source : null,
    lock: typeof payload.lock === 'string' ? payload.lock : null,
    conflict: payload.conflict === true,
  }
}

export default function ChannelsPage() {
  const { t, formatDate } = useI18n()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [diagnostics, setDiagnostics] = useState<ChannelDiagnostics | null>(null)
  const [emailTo, setEmailTo] = useState('')
  const [whatsAppTo, setWhatsAppTo] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [syncingInbox, setSyncingInbox] = useState(false)
  const [emailTestMessage, setEmailTestMessage] = useState('')
  const [whatsAppTestMessage, setWhatsAppTestMessage] = useState('')
  const [emailSyncMessage, setEmailSyncMessage] = useState('')
  const diagnosticsRequestRef = useRef(0)

  // WhatsApp config form
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('')
  const [waDisplayPhone, setWaDisplayPhone] = useState('')
  const [waBusinessAccountId, setWaBusinessAccountId] = useState('')
  const [waAccessToken, setWaAccessToken] = useState('')
  const [waVerifyToken, setWaVerifyToken] = useState('')
  const [waMode, setWaMode] = useState<'sandbox' | 'production'>('sandbox')
  const [waStatus, setWaStatus] = useState<'pending' | 'active' | 'suspended' | 'disconnected'>('pending')
  const [savingWaConfig, setSavingWaConfig] = useState(false)
  const [waConfigMessage, setWaConfigMessage] = useState('')

  const loadDiagnostics = useCallback(async (options?: { background?: boolean }) => {
    const requestId = diagnosticsRequestRef.current + 1
    diagnosticsRequestRef.current = requestId
    const background = options?.background === true

    if (!background) setLoading(true)

    try {
      const result = await getChannelDiagnosticsAction() as ChannelDiagnostics
      if (diagnosticsRequestRef.current !== requestId) return

      setError('')
      setDiagnostics(result)
    } catch (e: unknown) {
      if (diagnosticsRequestRef.current !== requestId) return

      setError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      if (diagnosticsRequestRef.current === requestId && !background) {
        setLoading(false)
      }
    }
  }, [t])

  useEffect(() => {
    void loadDiagnostics()
  }, [loadDiagnostics])

  useEffect(() => {
    if (diagnostics?.whatsapp.dbConfig) {
      setWaPhoneNumberId(diagnostics.whatsapp.dbConfig.phoneNumberId || '')
      setWaDisplayPhone(diagnostics.whatsapp.dbConfig.displayPhoneNumber || '')
      setWaBusinessAccountId(diagnostics.whatsapp.dbConfig.businessAccountId || '')
      setWaMode(diagnostics.whatsapp.dbConfig.mode as 'sandbox' | 'production' || 'sandbox')
      setWaStatus(diagnostics.whatsapp.dbConfig.status as 'pending' | 'active' | 'suspended' | 'disconnected' || 'pending')
    }
  }, [diagnostics])

  const emailLatest = diagnostics ? summarizeLatestTest(t, formatDate, diagnostics.email.latestTest) : null
  const emailInboundLatest = diagnostics ? summarizeLatestTest(t, formatDate, diagnostics.email.inbound.latestSync) : null
  const emailInboundManual = diagnostics ? summarizeLatestTest(t, formatDate, diagnostics.email.inbound.latestSyncManual) : null
  const emailInboundAuto = diagnostics ? summarizeLatestTest(t, formatDate, diagnostics.email.inbound.latestSyncAuto) : null
  const emailInboundAutoImported = diagnostics ? summarizeLatestTest(t, formatDate, diagnostics.email.inbound.latestSyncAutoImported) : null
  const whatsappLatest = diagnostics ? summarizeLatestTest(t, formatDate, diagnostics.whatsapp.latestTest) : null
  const whatsappDbConfig = diagnostics?.whatsapp.dbConfig || null
  const whatsappMetaPhone = whatsappDbConfig?.metaPhoneNumber || null
  const whatsappMetaWaba = whatsappDbConfig?.metaWaba || null
  const whatsappEnvironment = whatsappDbConfig?.resolvedEnvironment || 'sandbox'
  const whatsappProductionTone = environmentTone(whatsappEnvironment, whatsappDbConfig?.productionReady === true)
  const scheduler = diagnostics?.email.inbound.scheduler
  const schedulerStatusLine = !diagnostics
    ? t('common.loading')
    : scheduler?.started && scheduler?.mechanism === 'server_process'
    ? t('conversations.channelsPanel.email.schedulerServer')
    : scheduler?.mechanism === 'server_process'
    ? t('conversations.channelsPanel.email.schedulerDisabled')
    : scheduler?.mechanism === 'external_scheduler_only'
    ? t('conversations.channelsPanel.email.schedulerExternal')
    : diagnostics.runtimeError
    ? diagnostics.runtimeError
    : t('conversations.channelsPanel.email.schedulerDisabled')

  async function handleEmailTest() {
    if (!emailTo.trim()) return
    setSendingEmail(true)
    setEmailTestMessage('')
    try {
      const fd = new FormData()
      fd.set('to', emailTo.trim())
      await testEmailChannelAction(fd)
      setEmailTestMessage(t('conversations.channelsPanel.email.testSuccess'))
      await loadDiagnostics()
    } catch (e: unknown) {
      setEmailTestMessage(e instanceof Error ? e.message : t('common.error'))
      await loadDiagnostics()
    } finally {
      setSendingEmail(false)
    }
  }

  async function handleWhatsAppTest() {
    if (!whatsAppTo.trim()) return
    setSendingWhatsApp(true)
    setWhatsAppTestMessage('')
    try {
      const fd = new FormData()
      fd.set('to', whatsAppTo.trim())
      const result = await testWhatsAppChannelAction(fd) as { sandbox?: boolean; template?: string }
      setWhatsAppTestMessage(
        result?.sandbox
          ? t('conversations.channelsPanel.whatsapp.testSuccessSandbox', { template: result.template || 'visita_confirmacion_detalle_es' })
          : t('conversations.channelsPanel.whatsapp.testSuccess')
      )
      await loadDiagnostics()
    } catch (e: unknown) {
      setWhatsAppTestMessage(e instanceof Error ? e.message : t('common.error'))
      await loadDiagnostics()
    } finally {
      setSendingWhatsApp(false)
    }
  }

  async function handleEmailSync() {
    setSyncingInbox(true)
    setEmailSyncMessage('')
    try {
      const result = await syncEmailInboxAction() as { fetched: number; imported: number; skipped: number; duplicates: number; failed: number; threaded: number; created: number; irrelevant: number; reason?: string | null; simulated?: boolean }
      if (result.simulated) {
        setEmailSyncMessage(t('conversations.channelsPanel.demo.syncSuccess'))
      } else {
        setEmailSyncMessage(t('conversations.channelsPanel.email.syncSuccess', {
          fetched: result.fetched,
          imported: result.imported,
          skipped: result.skipped,
          failed: result.failed,
          threaded: result.threaded,
          created: result.created,
          irrelevant: result.irrelevant,
        }))
      }
      await loadDiagnostics()
    } catch (e: unknown) {
      setEmailSyncMessage(e instanceof Error ? e.message : t('common.error'))
      await loadDiagnostics()
    } finally {
      setSyncingInbox(false)
    }
  }

  async function handleSaveWhatsAppConfig() {
    if (!waPhoneNumberId.trim()) return
    setSavingWaConfig(true)
    setWaConfigMessage('')
    try {
      const fd = new FormData()
      fd.set('phone_number_id', waPhoneNumberId.trim())
      fd.set('display_phone_number', waDisplayPhone.trim())
      fd.set('whatsapp_business_account_id', waBusinessAccountId.trim())
      fd.set('access_token', waAccessToken.trim())
      fd.set('verify_token', waVerifyToken.trim())
      fd.set('mode', waMode)
      fd.set('status', waStatus)
      await saveWhatsAppConfigAction(fd)
      setWaConfigMessage(t('conversations.channelsPanel.whatsapp.configSaved'))
      await loadDiagnostics()
    } catch (e: unknown) {
      setWaConfigMessage(e instanceof Error ? e.message : t('common.error'))
      await loadDiagnostics()
    } finally {
      setSavingWaConfig(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-700">{t('dashboard.title')}</Link>
          <ChevronRight size={14} />
          <span className="font-medium text-slate-900">{t('conversations.channelsPanel.title')}</span>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{t('conversations.channelsPanel.title')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('conversations.channelsPanel.subtitle')}</p>
          </div>
          <Link href="/conversations" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeft size={16} />
            {t('conversations.channelsPanel.back')}
          </Link>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {diagnostics?.runtimeError ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {diagnostics.runtimeError}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail size={18} className="text-emerald-600" />
                  <h2 className="text-lg font-semibold text-slate-900">{t('conversations.channelsPanel.email.title')}</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">{t('conversations.channelsPanel.email.copy')}</p>
              </div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${toneClass(diagnostics?.email.configured ? 'verified' : 'pending')}`}>
                {diagnostics?.email.configured ? t('conversations.channelsPanel.email.badge') : t('conversations.channelsPanel.badges.incomplete')}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.provider')}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{diagnostics?.email.provider || 'SMTP'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.validation')}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {diagnostics?.email.configured ? t('conversations.channelsPanel.email.validation') : t('conversations.channelsPanel.incomplete')}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.envStatus')}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {diagnostics?.email.presentVars.map((key) => (
                    <span key={key} className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">{key}</span>
                  ))}
                  {diagnostics?.email.missingVars.map((key) => (
                    <span key={key} className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-rose-700">{key}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.inboundConfig')}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {diagnostics?.email.inbound.presentVars.map((key) => (
                    <span key={key} className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">{key}</span>
                  ))}
                  {diagnostics?.email.inbound.missingVars.map((key) => (
                    <span key={key} className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-rose-700">{key}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.graphTitle')}</p>
                    <p className="mt-1 text-sm text-slate-900">
                      {diagnostics?.email.graph?.dbConfig?.activeConfig
                        ? t('conversations.channelsPanel.graphConnected', { email: diagnostics.email.graph.dbConfig.emailAddress || 'outlook.com' })
                        : t('conversations.channelsPanel.graphNotConnected')}
                    </p>
                    {diagnostics?.email.graph?.dbConfig?.expiresAt && (
                      <p className="mt-1 text-xs text-slate-500">
                        {t('conversations.channelsPanel.graphTokenExpires', { date: formatDate(diagnostics.email.graph.dbConfig.expiresAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) })}
                      </p>
                    )}
                    {diagnostics?.email.graph?.dbConfig?.requiresReconnect && (
                      <p className="mt-1 text-xs text-rose-600">{t('conversations.channelsPanel.graphRequiresReconnect')}</p>
                    )}
                  </div>
                  {diagnostics?.email.graph?.configured && (
                    <a
                      href="/api/email/microsoft/connect"
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      {t('conversations.channelsPanel.graphConnectButton')}
                    </a>
                  )}
                </div>
                {(!diagnostics?.email.graph?.configured) && diagnostics?.email.graph && (
                  <p className="mt-2 text-xs text-slate-500">
                    {diagnostics.email.graph.missingVars?.length > 0
                      ? t('conversations.channelsPanel.graphMissingVars', { vars: diagnostics.email.graph.missingVars.join(', ') })
                      : t('conversations.channelsPanel.graphNotEnabled')}
                  </p>
                )}
              </div>
              {diagnostics?.email.demo?.enabled && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-amber-700">{t('conversations.channelsPanel.demo.title')}</p>
                      <p className="mt-1 text-sm text-slate-900">
                        {t('conversations.channelsPanel.demo.active')}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {t('conversations.channelsPanel.demo.description')}
                      </p>
                    </div>
                    <button
                      onClick={handleEmailSync}
                      disabled={syncingInbox}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {syncingInbox ? '...' : t('conversations.channelsPanel.demo.syncButton')}
                    </button>
                  </div>
                  {emailSyncMessage?.includes('demo') ? (
                    <p className="mt-2 text-xs text-amber-700">{emailSyncMessage}</p>
                  ) : null}
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.test')}</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder={t('conversations.channelsPanel.email.testPlaceholder')}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={handleEmailTest}
                    disabled={sendingEmail || !emailTo.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <SendHorizonal size={14} />
                    {sendingEmail ? '...' : t('conversations.channelsPanel.email.testButton')}
                  </button>
                </div>
                {emailTestMessage ? <p className="mt-2 text-xs text-slate-600">{emailTestMessage}</p> : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.inboundSync')}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleEmailSync}
                    disabled={syncingInbox}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Inbox size={14} />
                    {syncingInbox ? '...' : t('conversations.channelsPanel.email.syncButton')}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">{t('conversations.channelsPanel.email.syncHint')}</p>
                {emailSyncMessage ? <p className="mt-2 text-xs text-slate-600">{emailSyncMessage}</p> : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.schedulerStatus')}</p>
                <p className="mt-1 text-sm text-slate-900">
                  {schedulerStatusLine}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('conversations.channelsPanel.email.schedulerState', {
                    status: scheduler?.running ? t('conversations.channelsPanel.email.schedulerRunning') : t('conversations.channelsPanel.email.schedulerIdle'),
                    interval: String(Math.round((scheduler?.intervalMs || 0) / 60000)),
                  })}
                </p>
                {scheduler?.startedAt ? <p className="mt-1 text-xs text-slate-500">{t('conversations.channelsPanel.schedulerStarted', { date: formatDate(scheduler.startedAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}</p> : null}
                {scheduler?.lastStartedBy ? <p className="mt-1 text-xs text-slate-500">{t('conversations.channelsPanel.schedulerTrigger', { source: scheduler.lastStartedBy })}</p> : null}
                <p className="mt-1 text-xs text-slate-500">{t('conversations.channelsPanel.schedulerTicks', { count: String(scheduler?.tickCount || 0) })}</p>
                {scheduler?.lastHeartbeatAt ? <p className="mt-1 text-xs text-slate-500">{t('conversations.channelsPanel.email.schedulerHeartbeat', { date: formatDate(scheduler.lastHeartbeatAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p> : null}
                {scheduler?.lastError ? <p className="mt-2 text-xs text-rose-600">{scheduler.lastError}</p> : null}
              </div>
              {diagnostics?.email.demo?.enabled ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:col-span-2">
                  <p className="text-sm font-medium text-emerald-800">{t('conversations.channelsPanel.demoMainMessage')}</p>
                </div>
              ) : null}

              {diagnostics?.email.demo?.enabled ? (
                <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2 opacity-60">
                  <summary className="cursor-pointer text-xs uppercase tracking-wide text-slate-500 select-none">{t('conversations.channelsPanel.technicalHistory')}</summary>
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastTest')}</p>
                      <p className="mt-1 text-sm text-slate-900">{emailLatest?.line || t('conversations.channelsPanel.noData')}</p>
                      {emailLatest?.provider ? <p className="mt-1 text-xs text-slate-500">{t('conversations.delivery.provider', { provider: emailLatest.provider })}</p> : null}
                      {emailLatest?.error ? <p className="mt-2 text-xs text-rose-600">{emailLatest.error}</p> : null}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastInboundSyncAuto')}</p>
                      <p className="mt-1 text-sm text-slate-900">{emailInboundAuto?.line || t('conversations.channelsPanel.noData')}</p>
                      {emailInboundAuto?.error ? <p className="mt-2 text-xs text-rose-600">{emailInboundAuto.error}</p> : null}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastInboundSyncManual')}</p>
                      <p className="mt-1 text-sm text-slate-900">{emailInboundManual?.line || t('conversations.channelsPanel.noData')}</p>
                      {emailInboundManual?.error ? <p className="mt-2 text-xs text-rose-600">{emailInboundManual.error}</p> : null}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastInboundSync')}</p>
                      <p className="mt-1 text-sm text-slate-900">{emailInboundLatest?.line || t('conversations.channelsPanel.noData')}</p>
                    </div>
                  </div>
                </details>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastTest')}</p>
                    <p className="mt-1 text-sm text-slate-900">{emailLatest?.line || t('conversations.channelsPanel.noData')}</p>
                    {emailLatest?.provider ? <p className="mt-1 text-xs text-slate-500">{t('conversations.delivery.provider', { provider: emailLatest.provider })}</p> : null}
                    {emailLatest?.error ? <p className="mt-2 text-xs text-rose-600">{emailLatest.error}</p> : null}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastInboundSyncAuto')}</p>
                    <p className="mt-1 text-sm text-slate-900">{emailInboundAuto?.line || t('conversations.channelsPanel.noData')}</p>
                    {emailInboundAuto?.source ? <p className="mt-1 text-xs text-slate-500">{t(`conversations.channelsPanel.email.source.${emailInboundAuto.source}`)}</p> : null}
                    {emailInboundAuto?.fetched !== null ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {t('conversations.channelsPanel.email.syncStats', {
                          fetched: emailInboundAuto?.fetched || 0,
                          imported: emailInboundAuto?.imported || 0,
                          skipped: emailInboundAuto?.skipped || 0,
                          failed: emailInboundAuto?.failed || 0,
                          threaded: emailInboundAuto?.threaded || 0,
                          created: emailInboundAuto?.created || 0,
                          irrelevant: emailInboundAuto?.irrelevant || 0,
                        })}
                      </p>
                    ) : null}
                    {emailInboundAutoImported && emailInboundAutoImported.date !== emailInboundAuto?.date ? (
                      <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <p className="font-medium">{t('conversations.channelsPanel.lastAutoImport')}</p>
                        <p className="mt-1">{emailInboundAutoImported.line}</p>
                        <p className="mt-1">
                          {t('conversations.channelsPanel.email.syncStats', {
                            fetched: emailInboundAutoImported.fetched || 0,
                            imported: emailInboundAutoImported.imported || 0,
                            skipped: emailInboundAutoImported.skipped || 0,
                            failed: emailInboundAutoImported.failed || 0,
                            threaded: emailInboundAutoImported.threaded || 0,
                            created: emailInboundAutoImported.created || 0,
                            irrelevant: emailInboundAutoImported.irrelevant || 0,
                          })}
                        </p>
                      </div>
                    ) : null}
                    {emailInboundAuto?.skippedReasons && Object.keys(emailInboundAuto.skippedReasons).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {Object.entries(emailInboundAuto.skippedReasons).map(([reason, count]) => (
                          <span key={reason} className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                            {reason}: {String(count)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {emailInboundAuto?.failedReasons && Object.keys(emailInboundAuto.failedReasons).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {Object.entries(emailInboundAuto.failedReasons).map(([reason, count]) => (
                          <span key={reason} className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-rose-700">
                            {reason}: {String(count)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {emailInboundAuto?.error ? <p className="mt-2 text-xs text-rose-600">{emailInboundAuto.error}</p> : null}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastInboundSyncManual')}</p>
                    <p className="mt-1 text-sm text-slate-900">{emailInboundManual?.line || t('conversations.channelsPanel.noData')}</p>
                    {emailInboundManual?.source ? <p className="mt-1 text-xs text-slate-500">{t(`conversations.channelsPanel.email.source.${emailInboundManual.source}`)}</p> : null}
                    {emailInboundManual?.fetched !== null ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {t('conversations.channelsPanel.email.syncStats', {
                          fetched: emailInboundManual?.fetched || 0,
                          imported: emailInboundManual?.imported || 0,
                          skipped: emailInboundManual?.skipped || 0,
                          failed: emailInboundManual?.failed || 0,
                          threaded: emailInboundManual?.threaded || 0,
                          created: emailInboundManual?.created || 0,
                          irrelevant: emailInboundManual?.irrelevant || 0,
                        })}
                      </p>
                    ) : null}
                    {emailInboundManual?.error ? <p className="mt-2 text-xs text-rose-600">{emailInboundManual.error}</p> : null}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastInboundSync')}</p>
                    <p className="mt-1 text-sm text-slate-900">{emailInboundLatest?.line || t('conversations.channelsPanel.noData')}</p>
                    {emailInboundLatest?.source ? <p className="mt-1 text-xs text-slate-500">{t(`conversations.channelsPanel.email.source.${emailInboundLatest.source}`)}</p> : null}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-slate-700">
                  <MessageCircle size={18} className="text-amber-600" />
                  <h2 className="text-lg font-semibold text-slate-900">{t('conversations.channelsPanel.whatsapp.title')}</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">{t('conversations.channelsPanel.whatsapp.copy')}</p>
              </div>
              {diagnostics?.whatsapp.configSource === 'db_config' && diagnostics?.whatsapp.dbConfig ? (
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${toneClass(whatsappProductionTone)}`}>
                  {whatsappEnvironment === 'production'
                    ? (diagnostics.whatsapp.dbConfig.productionReady ? t('conversations.channelsPanel.whatsapp.productionReady') : t('conversations.channelsPanel.whatsapp.productionPending'))
                    : t('conversations.channelsPanel.whatsapp.testEnvironment')}
                </span>
              ) : diagnostics?.whatsapp.configSource === 'db_config' && diagnostics?.whatsapp.dbConfig?.canTest ? (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {t('conversations.channelsPanel.whatsapp.activeActive')}
                </span>
              ) : diagnostics?.whatsapp.configSource === 'env_fallback' ? (
                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  {t('conversations.channelsPanel.whatsapp.fallback')}
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                  {t('conversations.channelsPanel.whatsapp.notConfigured')}
                </span>
              )}
            </div>

            {diagnostics?.whatsapp.configSource === 'env_fallback' ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>{t('conversations.channelsPanel.whatsapp.compatibilityModeTitle')}:</strong>{' '}
                {t('conversations.channelsPanel.whatsapp.compatibilityModeDesc')}
              </div>
            ) : null}

            {diagnostics?.whatsapp.configSource === 'db_config' && !diagnostics?.whatsapp.dbConfig?.isComplete ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <strong>{t('conversations.channelsPanel.whatsapp.incompleteConfigTitle')}:</strong>{' '}
                {t('conversations.channelsPanel.whatsapp.incompleteConfigDesc')}
              </div>
            ) : null}

            {diagnostics?.whatsapp.dbConfig ? (
              <div className={`mt-3 rounded-lg border px-4 py-3 text-sm ${toneClass(whatsappProductionTone)}`}>
                <strong>{t('conversations.channelsPanel.whatsapp.productionStatusTitle')}:</strong>{' '}
                {whatsappEnvironment === 'production'
                  ? (diagnostics.whatsapp.dbConfig.productionReady
                    ? t('conversations.channelsPanel.whatsapp.productionStatusDescReady')
                    : t('conversations.channelsPanel.whatsapp.productionStatusDescPending'))
                  : t('conversations.channelsPanel.whatsapp.productionStatusDescSandbox')}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {diagnostics?.whatsapp.dbConfig ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.productionStatusTitle')}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {whatsappEnvironment === 'production' ? t('conversations.channelsPanel.whatsapp.productionStatusReal') : t('conversations.channelsPanel.whatsapp.productionStatusSandbox')}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${toneClass(whatsappProductionTone)}`}>
                      {diagnostics.whatsapp.dbConfig.productionReady ? t('conversations.channelsPanel.whatsapp.productionReadyBadge') : t('conversations.channelsPanel.whatsapp.productionNotReadyBadge')}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.numberSavedLabel')}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{diagnostics.whatsapp.dbConfig.displayPhoneNumber || t('conversations.channelsPanel.whatsapp.notConfiguredShort')}</p>
                      <p className="mt-1 text-xs text-slate-500">Phone Number ID: {diagnostics.whatsapp.dbConfig.phoneNumberId || t('conversations.channelsPanel.whatsapp.notConfiguredShort')}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.numberMetaLabel')}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{whatsappMetaPhone?.displayPhoneNumber || t('conversations.channelsPanel.whatsapp.notAvailable')}</p>
                      <p className="mt-1 text-xs text-slate-500">{t('conversations.channelsPanel.whatsapp.verifiedNameLabel')}: {whatsappMetaPhone?.verifiedName || t('conversations.channelsPanel.whatsapp.notAvailable')}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.wabaActiveLabel')}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{whatsappMetaWaba?.name || diagnostics.whatsapp.dbConfig.businessAccountId || t('conversations.channelsPanel.whatsapp.notConfiguredShort')}</p>
                      <p className="mt-1 text-xs text-slate-500">ID: {whatsappMetaWaba?.id || diagnostics.whatsapp.dbConfig.businessAccountId || t('conversations.channelsPanel.whatsapp.notConfiguredShort')}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.qualityLabel')}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{whatsappMetaPhone?.qualityRating || t('conversations.channelsPanel.whatsapp.notAvailable')}</p>
                      <p className="mt-1 text-xs text-slate-500">{t('conversations.channelsPanel.whatsapp.codeVerification')}: {whatsappMetaPhone?.codeVerificationStatus || t('conversations.channelsPanel.whatsapp.notAvailable')}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.nameStatusLabel')}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{whatsappMetaPhone?.verifiedName || t('conversations.channelsPanel.whatsapp.notAvailable')}</p>
                      <p className="mt-1 text-xs text-slate-500">{t('conversations.channelsPanel.whatsapp.nameStatus')}: {whatsappMetaPhone?.nameStatus || t('conversations.channelsPanel.whatsapp.notAvailable')}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.environmentType')}</p>
                      <p className={`mt-1 text-sm font-medium ${diagnostics.whatsapp.dbConfig.isTestNumber ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {diagnostics.whatsapp.dbConfig.isTestNumber ? t('conversations.channelsPanel.whatsapp.testNumberLabel') : t('conversations.channelsPanel.whatsapp.realNumberLabel')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{t('conversations.channelsPanel.whatsapp.accessTokenStatus')}: {diagnostics.whatsapp.dbConfig.accessTokenConfigured ? t('conversations.channelsPanel.whatsapp.configured') : t('conversations.channelsPanel.whatsapp.pendingConfig')}</p>
                    </div>
                  </div>
                  {diagnostics.whatsapp.dbConfig.displayNumberMismatch ? (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {t('conversations.channelsPanel.whatsapp.numberMismatchWarning')}
                    </div>
                  ) : null}
                  {diagnostics.whatsapp.dbConfig.metaDiagnosticsError ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {t('conversations.channelsPanel.whatsapp.metaDiagnosticsError')}: {diagnostics.whatsapp.dbConfig.metaDiagnosticsError}
                    </div>
                  ) : null}
                  {diagnostics.whatsapp.dbConfig.productionChecklist.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
                      <p className="font-medium uppercase tracking-wide">{t('conversations.channelsPanel.whatsapp.pendingForProduction')}</p>
                      <div className="mt-2 space-y-1">
                        {diagnostics.whatsapp.dbConfig.productionChecklist.map((item) => (
                          <p key={item}>- {item}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.configSourceLabel')}</p>
                <p className="mt-1 text-sm font-medium">
                  {diagnostics?.whatsapp.configSource === 'db_config' ? (
                    <span className="text-emerald-700">{t('conversations.channelsPanel.whatsapp.tenantConfig')}</span>
                  ) : diagnostics?.whatsapp.configSource === 'env_fallback' ? (
                    <span className="text-amber-700">{t('conversations.channelsPanel.whatsapp.envVarsCompat')}</span>
                  ) : (
                    <span className="text-slate-500">{t('conversations.channelsPanel.whatsapp.notConfigured')}</span>
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.statusLabel')}</p>
                <p className="mt-1 text-sm font-medium">
                  {!diagnostics?.whatsapp.dbConfig ? (
                    <span className="text-slate-500">{t('conversations.channelsPanel.whatsapp.noRecord')}</span>
                  ) : diagnostics?.whatsapp.dbConfig.status === 'active' ? (
                    <span className="text-emerald-700">{t('conversations.channelsPanel.whatsapp.active')}</span>
                  ) : diagnostics?.whatsapp.dbConfig.status === 'pending' ? (
                    <span className="text-amber-700">{t('conversations.channelsPanel.whatsapp.pending')}</span>
                  ) : (
                    <span className="text-rose-700">{diagnostics?.whatsapp.dbConfig.status}</span>
                  )}
                </p>
              </div>
              {diagnostics?.whatsapp.dbConfig?.activeConfig ? (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.phoneNumberId')}</p>
                    <p className="mt-1 text-xs font-mono text-slate-900 truncate">{diagnostics?.whatsapp.dbConfig.phoneNumberId}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.displayNumber')}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{diagnostics?.whatsapp.dbConfig.displayPhoneNumber || t('conversations.channelsPanel.whatsapp.notConfiguredShort')}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.modeLabel')}</p>
                    <p className={`mt-1 text-sm font-medium ${diagnostics?.whatsapp.dbConfig.mode === 'production' ? 'text-emerald-700' : 'text-amber-700'}`}>{diagnostics?.whatsapp.dbConfig.mode === 'production' ? t('conversations.channelsPanel.whatsapp.production') : t('conversations.channelsPanel.whatsapp.sandboxTest')}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.readyForTest')}</p>
                    <p className="mt-1 text-sm font-medium">
                      {diagnostics?.whatsapp.dbConfig.canTest ? (
                        <span className="text-emerald-700">✓ {t('conversations.channelsPanel.whatsapp.yes')}</span>
                      ) : (
                        <span className="text-rose-700">✗ {t('conversations.channelsPanel.whatsapp.no')}</span>
                      )}
                    </p>
                  </div>
                </>
              ) : null}
              {!diagnostics?.whatsapp.dbConfig ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.envStatus')}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {diagnostics?.whatsapp.presentVars.map((key) => (
                      <span key={key} className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">{key}</span>
                    ))}
                    {diagnostics?.whatsapp.missingVars.map((key) => (
                      <span key={key} className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-rose-700">{key}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.test')}</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={whatsAppTo}
                    onChange={(e) => setWhatsAppTo(e.target.value)}
                    placeholder={t('conversations.channelsPanel.whatsapp.testPlaceholder')}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    onClick={handleWhatsAppTest}
                    disabled={sendingWhatsApp || !whatsAppTo.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    <SendHorizonal size={14} />
                    {sendingWhatsApp ? '...' : t('conversations.channelsPanel.whatsapp.testButton')}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {diagnostics?.whatsapp.configSource === 'db_config' 
                    ? t('conversations.channelsPanel.whatsapp.testingWith', { mode: diagnostics?.whatsapp.dbConfig?.mode || 'sandbox' })
                    : t('conversations.channelsPanel.whatsapp.testingWithEnv')}
                </p>
                {whatsAppTestMessage ? <p className="mt-2 text-xs text-slate-600">{whatsAppTestMessage}</p> : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.fields.lastTest')}</p>
                <p className="mt-1 text-sm text-slate-900">{whatsappLatest?.line || t('conversations.channelsPanel.noData')}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {whatsappLatest?.provider ? <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-amber-800">{t('conversations.delivery.provider', { provider: whatsappLatest.provider })}</span> : null}
                  {whatsappLatest?.type ? <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-amber-800">{t(`conversations.delivery.type.${whatsappLatest.type}`)}</span> : null}
                  {whatsappLatest?.template ? <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-amber-800">{whatsappLatest.template}</span> : null}
                  {whatsappLatest?.sandbox ? <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-amber-800">{t('conversations.delivery.sandbox')}</span> : null}
                </div>
                {whatsappLatest?.error ? <p className="mt-2 text-xs text-rose-600">{whatsappLatest.error}</p> : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('conversations.channelsPanel.whatsapp.configPerTenant')}</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className={`inline-flex rounded-full px-2 py-1 ${diagnostics?.whatsapp.configSource === 'db_config' ? 'bg-emerald-100 text-emerald-800' : diagnostics?.whatsapp.configSource === 'env_fallback' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                    {diagnostics?.whatsapp.configSource === 'db_config' ? t('conversations.channelsPanel.whatsapp.configDb') : diagnostics?.whatsapp.configSource === 'env_fallback' ? t('conversations.channelsPanel.whatsapp.configEnv') : t('conversations.channelsPanel.whatsapp.configNone')}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={waPhoneNumberId}
                    onChange={(e) => setWaPhoneNumberId(e.target.value)}
                    placeholder={t('conversations.channelsPanel.whatsapp.phoneNumberIdPlaceholder')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <input
                    value={waDisplayPhone}
                    onChange={(e) => setWaDisplayPhone(e.target.value)}
                    placeholder={t('conversations.channelsPanel.whatsapp.displayPhonePlaceholder')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <input
                    value={waBusinessAccountId}
                    onChange={(e) => setWaBusinessAccountId(e.target.value)}
                    placeholder={t('conversations.channelsPanel.whatsapp.businessAccountPlaceholder')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <input
                    value={waAccessToken}
                    onChange={(e) => setWaAccessToken(e.target.value)}
                    placeholder={t('conversations.channelsPanel.whatsapp.accessToken')}
                    type="password"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <input
                    value={waVerifyToken}
                    onChange={(e) => setWaVerifyToken(e.target.value)}
                    placeholder={t('conversations.channelsPanel.whatsapp.verifyToken')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <select
                    value={waMode}
                    onChange={(e) => setWaMode(e.target.value as 'sandbox' | 'production')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="sandbox">{t('conversations.channelsPanel.whatsapp.modeSandbox')}</option>
                    <option value="production">{t('conversations.channelsPanel.whatsapp.modeProduction')}</option>
                  </select>
                  <select
                    value={waStatus}
                    onChange={(e) => setWaStatus(e.target.value as 'pending' | 'active' | 'suspended' | 'disconnected')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="pending">{t('conversations.channelsPanel.whatsapp.statusPending')}</option>
                    <option value="active">{t('conversations.channelsPanel.whatsapp.statusActive')}</option>
                    <option value="suspended">{t('conversations.channelsPanel.whatsapp.statusSuspended')}</option>
                    <option value="disconnected">{t('conversations.channelsPanel.whatsapp.statusDisconnected')}</option>
                  </select>
                </div>
                <div className="mt-3">
                  <button
                    onClick={handleSaveWhatsAppConfig}
                    disabled={savingWaConfig || !waPhoneNumberId.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {savingWaConfig ? '...' : t('conversations.channelsPanel.whatsapp.saveConfig')}
                  </button>
                </div>
                {waConfigMessage ? <p className="mt-2 text-xs text-slate-600">{waConfigMessage}</p> : null}
              </div>
            </div>
          </section>
        </div>

        {loading ? <div className="mt-4 text-sm text-slate-500">{t('common.loading')}</div> : null}
      </div>

      <div className="mx-auto mt-6 w-full max-w-[96rem]">
        <WhatsAppTemplateManager />
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/I18nProvider'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  Filter,
  Home,
  Layers3,
  MessageSquare,
  RefreshCcw,
  Search,
  X,
  UserRound,
} from 'lucide-react'
import { TASK_ACTION_TYPES, type TaskActionStatus, type TaskRecord } from '@/features/tasks/types'
import { getTaskPresentation } from '@/features/tasks/presentation'

const TASK_ACTION_STATUSES: TaskActionStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']

const STATUS_STYLES: Record<TaskActionStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  in_progress: 'border-sky-200 bg-sky-50 text-sky-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-slate-200 bg-slate-100 text-slate-600',
}

function labelizeActionType(value: string, t: (key: string) => string) {
  const label = t(`tasksPage.actionTypes.${value}`)
  return label !== `tasksPage.actionTypes.${value}` ? label : value
}

function getSourceTone(source: string) {
  return source === 'manual'
    ? 'border-violet-200 bg-violet-50 text-violet-700'
    : 'border-cyan-200 bg-cyan-50 text-cyan-700'
}

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function TasksPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, formatDate, formatCurrency } = useI18n()
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [actionTypeFilter, setActionTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)

  useEffect(() => {
    loadTasks()
  }, [])

  useEffect(() => {
    const source = searchParams.get('source')
    const actionType = searchParams.get('action_type')
    const status = searchParams.get('status')

    setSourceFilter(source || 'all')
    setActionTypeFilter(actionType || 'all')
    setStatusFilter(status || 'all')
  }, [searchParams])

  async function loadTasks() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile?.tenant_id) {
        setError(t('tasksPage.errors.profile'))
        return
      }

      const { data, error: tasksError } = await supabase
        .from('tasks')
        .select('*, leads(id, first_name, last_name, phone, email), properties(id, title), conversations(id, subject, status, channel), users(id, full_name, email)')
        .eq('tenant_id', profile.tenant_id)
        .order('updated_at', { ascending: false })

      if (tasksError) {
        setError(t('tasksPage.errors.load'))
        return
      }

      setTasks((data || []).map((task) => ({
        ...task,
        leads: Array.isArray(task.leads) ? task.leads[0] || null : task.leads,
        properties: Array.isArray(task.properties) ? task.properties[0] || null : task.properties,
        conversations: Array.isArray(task.conversations) ? task.conversations[0] || null : task.conversations,
        users: Array.isArray(task.users) ? task.users[0] || null : task.users,
      })))
    } catch (err) {
      console.error(err)
      setError(t('tasksPage.errors.connection'))
    } finally {
      setLoading(false)
    }
  }

  async function updateTaskState(task: TaskRecord, nextStatus: TaskActionStatus) {
    setUpdatingTaskId(task.id)
    setError('')
    try {
      const completed = nextStatus === 'completed'
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          action_status: nextStatus,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', task.id)

      if (updateError) {
        setError(t('tasksPage.errors.update'))
        return
      }

      await loadTasks()
    } catch (err) {
      console.error(err)
      setError(t('tasksPage.errors.update'))
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const scopedTasks = useMemo(() => {
    return tasks.filter((task) => {
      const presentation = getTaskPresentation(task, t, formatCurrency)
      const sourceMatches = sourceFilter === 'all' || task.source === sourceFilter
      const actionMatches = actionTypeFilter === 'all' || task.action_type === actionTypeFilter
      const normalizedQuery = normalizeSearchText(searchQuery.trim())
      const metadataText = task.metadata ? JSON.stringify(task.metadata) : ''
      const searchHaystack = normalizeSearchText([
        presentation.title,
        presentation.summary,
        presentation.nextStep,
        labelizeActionType(task.action_type, t),
        t(`tasksPage.priorities.${task.priority ?? 'low'}`),
        t(`tasksPage.statuses.${task.action_status}`),
        task.source,
        task.title,
        task.description,
        task.reason,
        task.next_step,
        task.leads?.first_name,
        task.leads?.last_name,
        task.leads?.phone,
        task.leads?.email,
        task.conversations?.subject,
        task.properties?.title,
        task.users?.full_name,
        task.users?.email,
        metadataText,
      ]
        .filter(Boolean)
        .join(' '))

      const searchMatches = !normalizedQuery || searchHaystack.includes(normalizedQuery)
      return sourceMatches && actionMatches && searchMatches
    })
  }, [tasks, sourceFilter, actionTypeFilter, searchQuery, t, formatCurrency])

  const filteredTasks = useMemo(() => {
    return scopedTasks.filter((task) => {
      const statusMatches = statusFilter === 'all'
        || (statusFilter === 'open' && task.action_status !== 'completed')
        || task.action_status === statusFilter

      return statusMatches
    })
  }, [scopedTasks, statusFilter])

  const stats = useMemo(() => {
    const pending = scopedTasks.filter((task) => task.action_status === 'pending').length
    const inProgress = scopedTasks.filter((task) => task.action_status === 'in_progress').length
    const completed = scopedTasks.filter((task) => task.action_status === 'completed').length
    return [
      {
        key: 'total',
        label: t('tasksPage.stats.total'),
        value: scopedTasks.length,
        icon: Layers3,
        shell: 'border-slate-200 bg-white',
        iconShell: 'bg-slate-900 text-white',
        valueTone: 'text-slate-900',
      },
      {
        key: 'pending',
        label: t('tasksPage.stats.pending'),
        value: pending,
        icon: Clock3,
        shell: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
        iconShell: 'bg-amber-500 text-white',
        valueTone: 'text-amber-700',
      },
      {
        key: 'in_progress',
        label: t('tasksPage.stats.inProgress'),
        value: inProgress,
        icon: CircleDot,
        shell: 'border-sky-200 bg-gradient-to-br from-sky-50 to-white',
        iconShell: 'bg-sky-500 text-white',
        valueTone: 'text-sky-700',
      },
      {
        key: 'completed',
        label: t('tasksPage.stats.completed'),
        value: completed,
        icon: CheckCircle2,
        shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
        iconShell: 'bg-emerald-500 text-white',
        valueTone: 'text-emerald-700',
      },
    ]
  }, [scopedTasks, t])

  const hasFilterAdjustments = sourceFilter !== 'all' || actionTypeFilter !== 'all' || statusFilter !== 'all' || searchQuery.trim().length > 0
  function resetFilters() {
    setSourceFilter('all')
    setActionTypeFilter('all')
    setStatusFilter('all')
    setSearchQuery('')
  }

  function setQuickStatusFilter(nextStatus: string) {
    setStatusFilter(nextStatus)
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.1),_transparent_42%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                    <Home size={14} />
                    {t('dashboard.title')}
                  </Link>
                  <ArrowRight size={14} className="text-slate-300" />
                  <span className="font-medium text-slate-900">{t('tasksPage.title')}</span>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('tasksPage.title')}</h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('tasksPage.subtitle')}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                >
                  <ArrowLeft size={16} />
                  {t('tasksPage.navigation.backToDashboard')}
                </Link>
                <button
                  onClick={loadTasks}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <RefreshCcw size={16} />
                  {t('tasksPage.refresh')}
                </button>
              </div>
            </div>
          </div>
        </section>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 flex items-start gap-2"><AlertCircle size={18} className="mt-0.5 flex-shrink-0" /><span>{error}</span></div>}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            const isActive = statusFilter === stat.key || (stat.key === 'total' && statusFilter === 'all')
            return (
              <button
                key={stat.key}
                type="button"
                onClick={() => setQuickStatusFilter(stat.key === 'total' ? 'all' : stat.key)}
                aria-pressed={isActive}
                className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${stat.shell} ${isActive ? 'ring-2 ring-sky-400 ring-offset-2' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                      {isActive && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">{t('tasksPage.filters.active')}</span>}
                    </div>
                    <p className={`text-3xl font-semibold tracking-tight ${stat.valueTone}`}>{stat.value}</p>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm ${stat.iconShell}`}>
                    <Icon size={20} />
                  </div>
                </div>
              </button>
            )
          })}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <Filter size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">{t('tasksPage.filters.title')}</h2>
                <p className="text-sm text-slate-500">{t('tasksPage.filters.subtitle')}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <label className="space-y-2 lg:col-span-12 xl:col-span-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('tasksPage.filters.search')}</span>
                <div className="relative">
                  <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('tasksPage.filters.searchPlaceholder')}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-11 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      aria-label={t('tasksPage.filters.clearSearch')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </label>
              <label className="space-y-2 lg:col-span-4 xl:col-span-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('tasksPage.filters.source')}</span>
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100">
                  <option value="all">{t('tasksPage.filters.allSources')}</option>
                  <option value="chatbot">chatbot</option>
                  <option value="manual">manual</option>
                </select>
              </label>
              <label className="space-y-2 lg:col-span-4 xl:col-span-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('tasksPage.filters.actionType')}</span>
                <select value={actionTypeFilter} onChange={(e) => setActionTypeFilter(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100">
                  <option value="all">{t('tasksPage.filters.allActionTypes')}</option>
                  {TASK_ACTION_TYPES.map((actionType) => <option key={actionType} value={actionType}>{labelizeActionType(actionType, t)}</option>)}
                </select>
              </label>
              <label className="space-y-2 lg:col-span-4 xl:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('tasksPage.filters.status')}</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100">
                  <option value="all">{t('tasksPage.filters.allStatuses')}</option>
                  <option value="open">{t('tasksPage.filters.open')}</option>
                  {TASK_ACTION_STATUSES.map((status) => <option key={status} value={status}>{t(`tasksPage.statuses.${status}`)}</option>)}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">{t('tasksPage.listTitle')}</h2>
                <p className="text-sm text-slate-500">{t('tasksPage.listSubtitle')}</p>
              </div>
              <p className="text-sm text-slate-500">{t('tasksPage.resultsCount', { count: filteredTasks.length })}</p>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 shadow-inner">
                <MessageSquare size={32} />
              </div>
              <p className="mt-5 text-lg font-semibold text-slate-800">
                {tasks.length === 0 && !hasFilterAdjustments ? t('tasksPage.emptyQueueTitle') : t('tasksPage.emptySearch')}
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                {tasks.length === 0 && !hasFilterAdjustments ? t('tasksPage.emptyQueueSubtitle') : t('tasksPage.emptySearchSubtitle')}
              </p>
              {tasks.length === 0 && !hasFilterAdjustments && (
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{t('tasksPage.emptyQueueHint')}</p>
              )}
              {tasks.length > 0 && hasFilterAdjustments && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  <X size={16} />
                  {t('tasksPage.filters.clearAll')}
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredTasks.map((task) => {
                const presentation = getTaskPresentation(task, t, formatCurrency)
                const assignedTo = task.users ? (task.users.full_name || task.users.email) : t('tasksPage.unassigned')
                const propertyLabel = task.properties?.title || t('tasksPage.noProperty')
                const conversationLabel = presentation.conversationLabel === '-' ? t('tasksPage.noConversation') : presentation.conversationLabel
                const leadLabel = presentation.leadLabel === '-' ? t('tasksPage.noLead') : presentation.leadLabel
                return (
                  <article key={task.id} className="px-5 py-5 transition hover:bg-slate-50/80 sm:px-6">
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)_auto] xl:items-start">
                      <div className="space-y-4 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${PRIORITY_STYLES[task.priority ?? 'low']}`}>{t(`tasksPage.priorities.${task.priority ?? 'low'}`)}</span>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[task.action_status]}`}>{t(`tasksPage.statuses.${task.action_status}`)}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${getSourceTone(task.source || 'chatbot')}`}><Bot size={12} />{presentation.sourceLabel}</span>
                        </div>

                        <div className="space-y-2 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            <span>{labelizeActionType(task.action_type, t)}</span>
                            {presentation.nextStep !== '-' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] tracking-normal text-slate-600">{t('tasksPage.columns.nextStep')}</span>}
                          </div>
                          <Link href={`/tasks/${task.id}`} className="block text-lg font-semibold leading-7 text-slate-950 transition hover:text-sky-700">
                            {presentation.title}
                          </Link>
                          <p className="line-clamp-2 text-sm leading-6 text-slate-600">{presentation.summary}</p>
                          {presentation.nextStep !== '-' && <p className="line-clamp-2 text-sm text-slate-500">{presentation.nextStep}</p>}
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('tasksPage.columns.context')}</p>
                          <div className="space-y-2.5 text-sm text-slate-600">
                            <div className="flex items-start gap-2">
                              <UserRound size={15} className="mt-0.5 text-slate-400" />
                              <div className="min-w-0">
                                <p className="text-xs text-slate-400">{t('tasksPage.columns.lead')}</p>
                                <p className="truncate font-medium text-slate-700">{leadLabel}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <MessageSquare size={15} className="mt-0.5 text-slate-400" />
                              <div className="min-w-0">
                                <p className="text-xs text-slate-400">{t('tasksPage.columns.conversation')}</p>
                                <p className="truncate font-medium text-slate-700">{conversationLabel}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Layers3 size={15} className="mt-0.5 text-slate-400" />
                              <div className="min-w-0">
                                <p className="text-xs text-slate-400">{t('tasksPage.columns.property')}</p>
                                <p className="truncate font-medium text-slate-700">{propertyLabel}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('tasksPage.metaTitle')}</p>
                          <dl className="space-y-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <dt className="text-slate-400">{t('tasksPage.columns.user')}</dt>
                              <dd className="text-right font-medium text-slate-700">{assignedTo}</dd>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <dt className="text-slate-400">{t('tasksPage.columns.dueDate')}</dt>
                              <dd className="text-right font-medium text-slate-700">{task.due_date ? formatDate(task.due_date, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('tasksPage.noDueDate')}</dd>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <dt className="text-slate-400">{t('tasksPage.columns.createdAt')}</dt>
                              <dd className="text-right font-medium text-slate-700">{task.created_at ? formatDate(task.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</dd>
                            </div>
                          </dl>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 xl:min-w-[172px] xl:items-stretch">
                        <Link href={`/tasks/${task.id}`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                          <ExternalLink size={15} />
                          {t('tasksPage.actions.open')}
                        </Link>
                        {task.action_status !== 'completed' && (
                          <button
                            onClick={() => updateTaskState(task, 'completed')}
                            disabled={updatingTaskId === task.id}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                          >
                            <CheckCircle2 size={15} />
                            {t('tasksPage.actions.complete')}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

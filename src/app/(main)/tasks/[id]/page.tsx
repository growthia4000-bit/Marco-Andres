'use client'

import { type ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/I18nProvider'
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  Home,
  Layers3,
  MessageSquare,
  RefreshCcw,
  User,
} from 'lucide-react'
import { type TaskActionStatus, type TaskRecord } from '@/features/tasks/types'
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

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { t, formatDate, formatCurrency } = useI18n()
  const [task, setTask] = useState<TaskRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  useEffect(() => {
    loadTask()
  }, [params.id])

  async function loadTask() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id, global_role')
        .eq('id', user.id)
        .single()

      if (!profile?.tenant_id) {
        setError(t('tasksPage.errors.profile'))
        return
      }

      setIsSuperadmin(profile.global_role === 'superadmin')

      const { data, error: taskError } = await supabase
        .from('tasks')
        .select('*, leads(id, first_name, last_name, phone), properties(id, title), conversations(id, subject, status, channel), users(id, full_name, email)')
        .eq('tenant_id', profile.tenant_id)
        .eq('id', params.id)
        .single()

      if (taskError || !data) {
        setError(t('tasksPage.errors.notFound'))
        return
      }

      setTask({
        ...data,
        leads: Array.isArray(data.leads) ? data.leads[0] || null : data.leads,
        properties: Array.isArray(data.properties) ? data.properties[0] || null : data.properties,
        conversations: Array.isArray(data.conversations) ? data.conversations[0] || null : data.conversations,
        users: Array.isArray(data.users) ? data.users[0] || null : data.users,
      })
    } catch (err) {
      console.error(err)
      setError(t('tasksPage.errors.connection'))
    } finally {
      setLoading(false)
    }
  }

  async function updateTask(nextStatus: TaskActionStatus) {
    if (!task) return
    setSaving(true)
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

      await loadTask()
    } catch (err) {
      console.error(err)
      setError(t('tasksPage.errors.update'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-500">{t('common.loading')}</div></div>
  }

  const presentation = task ? getTaskPresentation(task, t, formatCurrency) : null

  if (!task) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('tasksPage.errors.notFound')}</h2>
          <p className="text-slate-500 mb-4">{error}</p>
          <Link href="/tasks" className="text-blue-500 hover:underline">{t('tasksPage.back')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.1),_transparent_42%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Link href="/tasks" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                    <ArrowLeft size={14} />
                    {t('tasksPage.back')}
                  </Link>
                  <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                    <Home size={14} />
                    {t('tasksPage.navigation.backToDashboard')}
                  </Link>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('tasksPage.detailEyebrow')}</p>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{presentation?.title || task.title}</h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{presentation?.summary || task.reason || task.description || '-'}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row xl:flex-col xl:items-stretch">
                <button onClick={() => updateTask('completed')} disabled={saving || task.action_status === 'completed'} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:opacity-50 disabled:hover:translate-y-0">
                  <CheckCircle2 size={16} />
                  {t('tasksPage.actions.complete')}
                </button>
                <button onClick={loadTask} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                  <RefreshCcw size={16} />
                  {t('tasksPage.refresh')}
                </button>
              </div>
            </div>
          </div>
        </section>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 flex items-start gap-2"><AlertCircle size={18} className="mt-0.5 flex-shrink-0" /><span>{error}</span></div>}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[task.action_status]}`}>{t(`tasksPage.statuses.${task.action_status}`)}</span>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${PRIORITY_STYLES[task.priority ?? 'low']}`}>{t(`tasksPage.priorities.${task.priority ?? 'low'}`)}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700"><Bot size={12} />{presentation?.sourceLabel || task.source}</span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InfoCard label={t('tasksPage.columns.actionType')} value={t(`tasksPage.actionTypes.${task.action_type}`) || task.action_type} />
                <InfoCard label={t('tasksPage.columns.user')} value={task.users ? (task.users.full_name || task.users.email || t('tasksPage.unassigned')) : t('tasksPage.unassigned')} />
                <InfoCard label={t('tasksPage.columns.dueDate')} value={task.due_date ? formatDate(task.due_date, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('tasksPage.noDueDate')} />
                <InfoCard label={t('tasksPage.columns.createdAt')} value={task.created_at ? formatDate(task.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'} />
                <InfoCard className="md:col-span-2" label={t('tasksPage.columns.nextStep')} value={presentation?.nextStep || task.next_step || '-'} />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white"><Layers3 size={18} /></div>
                <div>
                  <h2 className="text-base font-semibold text-slate-950">{t('tasksPage.columns.context')}</h2>
                  <p className="text-sm text-slate-500">{t('tasksPage.detailContextSubtitle')}</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <ContextCard
                  icon={<User size={16} className="text-slate-400" />}
                  label={t('tasksPage.columns.lead')}
                  title={task.leads ? `${task.leads.first_name} ${task.leads.last_name || ''}`.trim() : t('tasksPage.noLead')}
                  subtitle={task.leads?.phone || null}
                  href={task.leads?.id ? `/leads/${task.leads.id}` : null}
                  cta={t('tasksPage.actions.openLead')}
                />
                <ContextCard
                  icon={<MessageSquare size={16} className="text-slate-400" />}
                  label={t('tasksPage.columns.conversation')}
                  title={task.conversations?.subject || task.conversations?.id || t('tasksPage.noConversation')}
                  subtitle={task.conversations ? `${t(`conversations.status.${task.conversations.status}`)} · ${t(`conversations.channels.${task.conversations.channel}`)}` : null}
                  href={task.conversations?.id ? `/conversations?conversationId=${task.conversations.id}` : null}
                  cta={t('tasksPage.actions.openConversation')}
                />
                <ContextCard
                  icon={<Layers3 size={16} className="text-slate-400" />}
                  label={t('tasksPage.columns.property')}
                  title={task.properties?.title || t('tasksPage.noProperty')}
                  subtitle={null}
                  href={task.properties?.id ? `/properties/${task.properties.id}` : null}
                  cta={t('tasksPage.actions.openProperty')}
                />
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">{t('tasksPage.detailSidebarTitle')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('tasksPage.detailSidebarSubtitle')}</p>
              <div className="mt-5 space-y-3">
                <Link href="/tasks" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  <ArrowLeft size={16} />
                  {t('tasksPage.back')}
                </Link>
                <Link href="/dashboard" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  <Home size={16} />
                  {t('tasksPage.navigation.backToDashboard')}
                </Link>
              </div>
              <div className="mt-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('tasksPage.columns.status')}</label>
                <select
                  value={task.action_status}
                  onChange={(e) => updateTask(e.target.value as TaskActionStatus)}
                  disabled={saving}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
                >
                  {TASK_ACTION_STATUSES.map((status) => <option key={status} value={status}>{t(`tasksPage.statuses.${status}`)}</option>)}
                </select>
              </div>
            </section>

            {isSuperadmin && (
              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-3 py-3 transition hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{t('tasksPage.traceability.title')}</p>
                      <p className="mt-1 text-xs text-slate-500">{t('tasksPage.traceability.subtitle')}</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                      {t('tasksPage.traceability.rawJson')}
                      <ChevronDown size={14} className="transition group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <pre className="max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 whitespace-pre-wrap">{JSON.stringify(task.metadata, null, 2)}</pre>
                  </div>
                </details>
              </section>
            )}
          </aside>
        </section>
      </main>
    </div>
  )
}

function InfoCard({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50/70 p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-900">{value}</p>
    </div>
  )
}

function ContextCard({
  icon,
  label,
  title,
  subtitle,
  href,
  cta,
}: {
  icon: ReactNode
  label: string
  title: string
  subtitle: string | null
  href: string | null
  cta: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="text-sm font-medium text-slate-900 break-words">{title}</p>
          {subtitle && <p className="text-sm text-slate-500 break-words">{subtitle}</p>}
          {href && <Link href={href} className="inline-flex text-sm font-medium text-sky-700 transition hover:text-sky-800">{cta}</Link>}
        </div>
      </div>
    </div>
  )
}

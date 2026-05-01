'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, X, Plus, Home, Users, Calendar, DollarSign,
  TrendingUp, Clock, CheckCircle, BarChart3, PieChart, ArrowRight,
  Building2, UserPlus, FileText, Activity, LogOut, ShieldAlert, BadgeCheck, AlertTriangle,
  MessageSquareText, Upload, Radio, RotateCcw
} from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'

interface Widget {
  id: string
  type: 'stats' | 'chart' | 'list' | 'activity'
  title: string
  size: 'small' | 'medium' | 'large'
  visible: boolean
}

type ChatbotActionType = 'human_followup_action' | 'visit_action' | 'seller_valuation_action' | 'financing_followup_action' | 'buyer_contact_action'

type ChatbotTask = {
  action_type: ChatbotActionType | 'general_task'
  action_status: string
}

type UserIdentity = {
  fullName: string
  email: string
  role: string | null
}

function getChatbotActionLabel(type: ChatbotActionType, t: (key: string) => string) {
  switch (type) {
    case 'human_followup_action':
      return t('dashboard.chatbotActions.types.human_followup_action')
    case 'visit_action':
      return t('dashboard.chatbotActions.types.visit_action')
    case 'seller_valuation_action':
      return t('dashboard.chatbotActions.types.seller_valuation_action')
    case 'financing_followup_action':
      return t('dashboard.chatbotActions.types.financing_followup_action')
    case 'buyer_contact_action':
      return t('dashboard.chatbotActions.types.buyer_contact_action')
  }
}

function getLocalizedAppointmentTitle(title: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const trimmedTitle = title.trim()
  const prefillMatch = trimmedTitle.match(/^Cita con\s+(.+)$/)

  if (prefillMatch) {
    return t('appointmentForm.prefillTitle', { name: prefillMatch[1] })
  }

  if (trimmedTitle === 'Cita desde chatbot') {
    return t('dashboard.labels.chatbotAppointmentTitle')
  }

  return title
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'recent-leads', type: 'list', title: 'Leads Recientes', size: 'medium', visible: true },
  { id: 'upcoming-appointments', type: 'list', title: 'Proximas Citas', size: 'medium', visible: true },
  { id: 'conversion-rate', type: 'chart', title: 'Tasa Conversion', size: 'medium', visible: true },
  { id: 'properties-by-type', type: 'chart', title: 'Por Tipo', size: 'medium', visible: true },
]

const STORAGE_KEY = 'crm_dashboard_widgets'
const PERSONALIZABLE_WIDGET_PREFIXES = DEFAULT_WIDGETS.map((widget) => widget.id)

function isPersonalizableWidgetId(id: string) {
  return PERSONALIZABLE_WIDGET_PREFIXES.some((prefix) => id.startsWith(prefix))
}

interface SortableWidgetProps {
  widget: Widget
  onRemove: (id: string) => void
  stats: any
}

function SortableWidget({ widget, onRemove, stats }: SortableWidgetProps) {
  const { t, formatCurrency, formatDate } = useI18n()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getWidgetTitle = (id: string) => {
    if (id.startsWith('properties-count')) return t('dashboard.widgets.propertiesCount')
    if (id.startsWith('leads-count')) return t('dashboard.widgets.leadsCount')
    if (id.startsWith('appointments-today')) return t('dashboard.widgets.appointmentsToday')
    if (id.startsWith('revenue')) return t('dashboard.widgets.revenue')
    if (id.startsWith('recent-leads')) return t('dashboard.widgets.recentLeads')
    if (id.startsWith('upcoming-appointments')) return t('dashboard.widgets.upcomingAppointments')
    if (id.startsWith('conversion-rate')) return t('dashboard.widgets.conversionRate')
    if (id.startsWith('properties-by-type')) return t('dashboard.widgets.propertiesByType')
    return widget.title
  }

  const renderContent = () => {
    switch (widget.id) {
      case 'properties-count':
        return (
          <Link href="/properties" className="-m-2 flex items-center justify-between gap-3 rounded-2xl p-3 transition hover:bg-blue-50/70">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Home className="text-blue-500" size={24} />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{stats.properties.total}</p>
                 <p className="text-sm text-slate-500">{t('dashboard.widgets.propertiesCount')}</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>
        )
      case 'leads-count':
        return (
          <Link href="/leads" className="-m-2 flex items-center justify-between gap-3 rounded-2xl p-3 transition hover:bg-amber-50/70">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <Users className="text-amber-500" size={24} />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{stats.leads.total}</p>
                 <p className="text-sm text-slate-500">{t('dashboard.widgets.leadsCount')}</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>
        )
      case 'appointments-today':
        return (
          <Link href="/appointments" className="-m-2 flex items-center justify-between gap-3 rounded-2xl p-3 transition hover:bg-emerald-50/70">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <Calendar className="text-green-500" size={24} />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{stats.appointments.today}</p>
                 <p className="text-sm text-slate-500">{t('dashboard.widgets.appointmentsToday')}</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>
        )
      case 'revenue':
        return (
          <Link href="/reports" className="-m-2 flex items-center justify-between gap-3 rounded-2xl p-3 transition hover:bg-emerald-50/70">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <DollarSign className="text-emerald-500" size={24} />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">
                  {stats.revenue.mixed ? t('common.mixedCurrencies') : formatCurrency(stats.revenue.total, stats.revenue.currencyCode)}
                </p>
                 <p className="text-sm text-slate-500">{stats.revenue.mixed ? t('dashboard.labels.revenueMixed') : t('dashboard.labels.soldEur')}</p>
                {stats.revenue.breakdown?.length > 0 && (
                  <p className="text-xs text-slate-400">
                    {stats.revenue.breakdown.map((item: any) => formatCurrency(item.total, item.currencyCode)).join(' · ')}
                  </p>
                )}
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>
        )
      case 'recent-leads':
        return (
          <div className="space-y-2">
            {stats.recentLeads.length === 0 ? (
               <p className="text-slate-400 text-sm text-center py-4">{t('dashboard.labels.noRecentLeads')}</p>
            ) : (
              stats.recentLeads.slice(0, 5).map((lead: any) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-2xl p-3 transition hover:bg-blue-50/60">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
                      <span className="text-xs font-medium text-slate-600">
                        {lead.first_name?.[0]}{lead.last_name?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{lead.first_name} {lead.last_name}</p>
                      <p className="text-xs text-slate-500">{lead.phone}</p>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-slate-400" />
                </Link>
              ))
            )}
            <Link href="/leads" className="flex items-center justify-center gap-1 border-t border-slate-100 pt-3 text-sm font-medium text-blue-500 hover:text-blue-600">
               {t('dashboard.labels.viewAll')} <ArrowRight size={14} />
            </Link>
          </div>
        )
      case 'upcoming-appointments':
        return (
          <div className="space-y-2">
            {stats.upcomingAppointments.length === 0 ? (
               <p className="text-slate-400 text-sm text-center py-4">{t('dashboard.labels.noUpcomingAppointments')}</p>
            ) : (
              stats.upcomingAppointments.slice(0, 5).map((apt: any) => (
                <Link key={apt.id} href={`/appointments/${apt.id}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-emerald-50/60">
                  <div className={`w-2 h-2 rounded-full ${
                    apt.status === 'confirmed' ? 'bg-green-500' : 
                    apt.status === 'scheduled' ? 'bg-blue-500' : 'bg-slate-300'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{getLocalizedAppointmentTitle(apt.title, t)}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(apt.start_time, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </Link>
              ))
            )}
            <Link href="/appointments" className="flex items-center justify-center gap-1 border-t border-slate-100 pt-3 text-sm font-medium text-blue-500 hover:text-blue-600">
               {t('dashboard.labels.viewAllAppointments')} <ArrowRight size={14} />
            </Link>
          </div>
        )
      case 'conversion-rate': {
        const rate = stats.leads.total > 0 ? ((stats.leads.won / stats.leads.total) * 100).toFixed(1) : 0
        return (
          <div className="flex h-full flex-col items-center justify-center rounded-[24px] bg-gradient-to-br from-slate-50 to-blue-50/60 p-4">
            <div className="relative h-32 w-32">
              <svg className="h-32 w-32 -rotate-90 transform">
                <circle cx="64" cy="64" r="56" stroke="#E2E8F0" strokeWidth="12" fill="none" />
                <circle 
                  cx="64" cy="64" r="56" 
                  stroke="#3B82F6" strokeWidth="12" fill="none"
                  strokeDasharray={`${(parseFloat(rate as string) / 100) * 352} 352`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-slate-900">{rate}%</span>
              </div>
            </div>
             <p className="text-sm text-slate-500 mt-2">{t('dashboard.labels.conversionRate')}</p>
             <p className="text-xs text-slate-400">{t('dashboard.labels.leadsWon', { won: stats.leads.won, total: stats.leads.total })}</p>
          </div>
        )
      }
      case 'properties-by-type': {
        const types = [
           { name: t('dashboard.labels.apartments'), count: stats.propertiesByType.apartment, color: 'bg-blue-500' },
           { name: t('dashboard.labels.houses'), count: stats.propertiesByType.house, color: 'bg-green-500' },
           { name: t('dashboard.labels.land'), count: stats.propertiesByType.land, color: 'bg-amber-500' },
           { name: t('dashboard.labels.commercial'), count: stats.propertiesByType.commercial, color: 'bg-purple-500' },
        ]
        const maxCount = Math.max(...types.map(t => t.count), 1)
        return (
          <div className="space-y-3 rounded-[24px] bg-gradient-to-br from-slate-50 to-indigo-50/50 p-4">
            {types.map(type => (
              <div key={type.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{type.name}</span>
                  <span className="font-medium text-slate-900">{type.count}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${type.color} rounded-full transition-all`}
                    style={{ width: `${(type.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      }
      default:
        return <p className="text-slate-400">{t('dashboard.labels.widget')}</p>
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{t(`dashboard.widgetType.${widget.type}`)}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{getWidgetTitle(widget.id)}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab rounded-full p-1.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing group-hover:opacity-100"
          >
            <GripVertical size={16} />
          </button>
          <button
            onClick={() => onRemove(widget.id)}
            className="rounded-full p-1.5 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {renderContent()}
    </div>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<UserIdentity>({
    fullName: '',
    email: '',
    role: null,
  })
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS)
  const [stats, setStats] = useState<any>({
    properties: { total: 0, apartment: 0, house: 0, land: 0, commercial: 0 },
    propertiesByType: { apartment: 0, house: 0, land: 0, commercial: 0 },
    leads: { total: 0, won: 0 },
    appointments: { today: 0 },
    revenue: { total: 0, mixed: false, currencyCode: null, breakdown: [] },
    recentLeads: [],
    upcomingAppointments: [],
  })
  const [commercial, setCommercial] = useState<{
    tenantName: string
    tenantStatus: string | null
    subscriptionStatus: string | null
    planName: string | null
    planSlug: string | null
    billingCycle: string | null
    billableUsers: number
    maxUsers: number | null
    maxProperties: number | null
    maxLeads: number | null
    canCreateMoreUsers: boolean
    isOperational: boolean
    trialEndsAt: string | null
    currentPeriodEnd: string | null
  }>({
    tenantName: '',
    tenantStatus: null,
    subscriptionStatus: null,
    planName: null,
    planSlug: null,
    billingCycle: null,
    billableUsers: 0,
    maxUsers: null,
    maxProperties: null,
    maxLeads: null,
    canCreateMoreUsers: true,
    isOperational: true,
    trialEndsAt: null,
    currentPeriodEnd: null,
  })
  const [showWidgetMenu, setShowWidgetMenu] = useState(false)
  const [chatbotTasks, setChatbotTasks] = useState<ChatbotTask[]>([])
  const router = useRouter()
  const supabase = createClient()
  const { t, currencyCode, formatDate, formatCurrency } = useI18n()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    loadData()
    loadWidgetConfig()
  }, [])

  const loadData = async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('tenant_id, global_role, role, full_name, email')
        .eq('id', user.id)
        .single()

      if (profileError) {
        setError(t('dashboard.errors.profile'))
        setLoading(false)
        return
      }

      if (!profile?.tenant_id) {
        setError(t('dashboard.errors.tenant'))
        setLoading(false)
        return
      }

      setIsSuperadmin(profile.global_role === 'superadmin')
      setCurrentUser({
        fullName: profile.full_name || user.user_metadata?.full_name || user.email || 'Usuario',
        email: profile.email || user.email || '',
        role: profile.role || null,
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const [tenantRes, subscriptionRes, capacityRes, propertiesRes, leadsRes, appointmentsRes, chatbotTasksRes] = await Promise.all([
          supabase
            .from('tenants')
            .select('name, slug, status, trial_ends_at')
            .eq('id', profile.tenant_id)
            .single(),
          supabase
            .from('subscriptions')
            .select('status, billing_cycle, current_period_end, trial_ends_at, plans(name, slug, max_users, max_properties, max_leads)')
            .eq('tenant_id', profile.tenant_id)
            .eq('is_current', true)
            .maybeSingle(),
          supabase.rpc('app_tenant_capacity_snapshot', { target_tenant_id: profile.tenant_id }),
          supabase.from('properties').select('*').eq('tenant_id', profile.tenant_id),
          supabase.from('leads').select('*').eq('tenant_id', profile.tenant_id),
          supabase.from('appointments')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .gte('start_time', today.toISOString())
          .lt('start_time', tomorrow.toISOString()),
          supabase
            .from('tasks')
            .select('action_type, action_status')
            .eq('tenant_id', profile.tenant_id)
            .eq('source', 'chatbot')
            .neq('action_status', 'completed')
            .neq('action_status', 'cancelled'),
      ])

      const allAppointments = await supabase
        .from('appointments')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .gte('start_time', new Date().toISOString())
        .order('start_time')
        .limit(10)

      if (tenantRes.error || propertiesRes.error || leadsRes.error || appointmentsRes.error || capacityRes.error) {
        setError(t('dashboard.errors.load'))
        setLoading(false)
        return
      }

      const properties = propertiesRes.data || []
      const leads = leadsRes.data || []
      setTenantSlug(tenantRes.data?.slug || null)
      setChatbotTasks(chatbotTasksRes.error ? [] : ((chatbotTasksRes.data as ChatbotTask[] | null) || []))
      const subscriptionPlan = Array.isArray(subscriptionRes.data?.plans) ? subscriptionRes.data?.plans[0] : subscriptionRes.data?.plans
      const capacity = capacityRes.data?.[0] || null

      setCommercial({
        tenantName: tenantRes.data?.name || '',
        tenantStatus: tenantRes.data?.status || capacity?.tenant_status || null,
        subscriptionStatus: subscriptionRes.data?.status || capacity?.subscription_status || null,
        planName: subscriptionPlan?.name || null,
        planSlug: subscriptionPlan?.slug || capacity?.plan_slug || null,
        billingCycle: subscriptionRes.data?.billing_cycle || null,
        billableUsers: capacity?.billable_user_count || 0,
        maxUsers: capacity?.max_users ?? subscriptionPlan?.max_users ?? null,
        maxProperties: subscriptionPlan?.max_properties ?? null,
        maxLeads: subscriptionPlan?.max_leads ?? null,
        canCreateMoreUsers: capacity?.can_create_more_users ?? true,
        isOperational: capacity?.is_operational ?? tenantRes.data?.status !== 'suspended',
        trialEndsAt: subscriptionRes.data?.trial_ends_at || tenantRes.data?.trial_ends_at || null,
        currentPeriodEnd: subscriptionRes.data?.current_period_end || null,
      })

      const soldProperties = properties.filter(p => p.status === 'sold')
      const revenueGroups = new Map<string, number>()
      soldProperties.forEach((property) => {
        const code = property.currency_code || currencyCode
        const amount = property.price_amount ?? property.price ?? 0
        revenueGroups.set(code, (revenueGroups.get(code) || 0) + amount)
      })
      const revenueBreakdown = Array.from(revenueGroups.entries()).map(([code, total]) => ({ currencyCode: code, total }))

      setStats({
        properties: {
          total: properties.length,
          apartment: properties.filter(p => p.property_type === 'apartment').length,
          house: properties.filter(p => p.property_type === 'house').length,
          land: properties.filter(p => p.property_type === 'land').length,
          commercial: properties.filter(p => p.property_type === 'commercial').length,
        },
        propertiesByType: {
          apartment: properties.filter(p => p.property_type === 'apartment').length,
          house: properties.filter(p => p.property_type === 'house').length,
          land: properties.filter(p => p.property_type === 'land').length,
          commercial: properties.filter(p => p.property_type === 'commercial').length,
        },
        leads: {
          total: leads.length,
          won: leads.filter(l => l.status === 'won').length,
        },
        appointments: {
          today: appointmentsRes.data?.length || 0,
        },
        revenue: {
          total: revenueBreakdown[0]?.total || 0,
          mixed: revenueBreakdown.length > 1,
          currencyCode: revenueBreakdown[0]?.currencyCode || currencyCode,
          breakdown: revenueBreakdown,
        },
        recentLeads: leads.slice(0, 5),
        upcomingAppointments: allAppointments.data || [],
      })
    } catch (error) {
      console.error('Error loading:', error)
      setError(t('dashboard.errors.connection'))
    } finally {
      setLoading(false)
    }
  }

  const loadWidgetConfig = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const config = JSON.parse(stored)
        const filteredConfig = Array.isArray(config)
          ? config.filter((widget) => widget?.id && isPersonalizableWidgetId(widget.id))
          : []
        setWidgets(filteredConfig.length > 0 ? filteredConfig : DEFAULT_WIDGETS)
      } catch {
        // Use default
      }
    }
  }

  const saveWidgetConfig = (newWidgets: Widget[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newWidgets))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setWidgets(items => {
        const oldIndex = items.findIndex(i => i.id === active.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        const newItems = arrayMove(items, oldIndex, newIndex)
        saveWidgetConfig(newItems)
        return newItems
      })
    }
  }

  const removeWidget = (id: string) => {
    setWidgets(items => {
      const newItems = items.filter(i => i.id !== id)
      saveWidgetConfig(newItems)
      return newItems
    })
  }

  const addWidget = (widget: Widget) => {
    setWidgets(items => {
      const newItems = [...items, { ...widget, id: `${widget.id}-${Date.now()}` }]
      saveWidgetConfig(newItems)
      return newItems
    })
    setShowWidgetMenu(false)
  }

  const resetWidgets = () => {
    setWidgets(DEFAULT_WIDGETS)
    localStorage.removeItem(STORAGE_KEY)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const availableWidgets = DEFAULT_WIDGETS.filter(
    dw => !widgets.some(w => w.id.startsWith(dw.id) || w.id === dw.id)
  )

  const shortcutCards = [
    {
      href: '/tasks',
      title: t('dashboard.labels.viewTasks'),
      description: t('dashboard.labels.chatbotTasks'),
      icon: CheckCircle,
      tone: 'bg-sky-100 text-sky-600',
    },
    {
      href: '/conversations',
      title: t('dashboard.labels.viewConversations'),
      description: t('dashboard.labels.viewConversationsDesc'),
      icon: MessageSquareText,
      tone: 'bg-indigo-100 text-indigo-600',
    },
    {
      href: '/team',
      title: t('dashboard.labels.viewTeam'),
      description: t('dashboard.labels.viewTeamDesc'),
      icon: Users,
      tone: 'bg-emerald-100 text-emerald-600',
    },
    {
      href: '/import',
      title: t('dashboard.labels.viewImport'),
      description: t('dashboard.labels.viewImportDesc'),
      icon: Upload,
      tone: 'bg-amber-100 text-amber-600',
    },
    ...(isSuperadmin
      ? [{
          href: '/admin',
          title: t('dashboard.labels.viewAdmin'),
          description: t('dashboard.labels.viewAdminDesc'),
          icon: ShieldAlert,
          tone: 'bg-slate-200 text-slate-700',
        }]
      : []),
  ]

  const commercialStatus = commercial.tenantStatus === 'suspended'
    ? 'suspended'
    : commercial.subscriptionStatus || commercial.tenantStatus || 'unknown'

  const chatbotActionCards: Array<{ type: ChatbotActionType; href: string }> = [
    { type: 'human_followup_action', href: '/tasks?source=chatbot&status=open&action_type=human_followup_action' },
    { type: 'visit_action', href: '/tasks?source=chatbot&status=open&action_type=visit_action' },
    { type: 'seller_valuation_action', href: '/tasks?source=chatbot&status=open&action_type=seller_valuation_action' },
    { type: 'financing_followup_action', href: '/tasks?source=chatbot&status=open&action_type=financing_followup_action' },
    { type: 'buyer_contact_action', href: '/tasks?source=chatbot&status=open&action_type=buyer_contact_action' },
  ]

  const chatbotActionTotal = chatbotTasks.length

  const chatbotActionCountByType = chatbotTasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.action_type] = (acc[task.action_type] || 0) + 1
    return acc
  }, {})

  const statusTone = commercialStatus === 'active'
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : commercialStatus === 'trial'
      ? 'bg-blue-50 border-blue-200 text-blue-700'
      : commercialStatus === 'past_due'
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : commercialStatus === 'suspended'
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-slate-50 border-slate-200 text-slate-700'

  const statusIcon = commercialStatus === 'active'
    ? <BadgeCheck size={18} />
    : commercialStatus === 'trial'
      ? <Clock size={18} />
      : commercialStatus === 'past_due'
        ? <AlertTriangle size={18} />
        : commercialStatus === 'suspended'
          ? <ShieldAlert size={18} />
          : <Building2 size={18} />

  const currentUserRoleLabel = isSuperadmin
    ? t('dashboard.roles.superadmin')
    : currentUser.role
      ? t(`dashboard.roles.${currentUser.role}`)
      : null

  const primaryAccessCards = [
    {
      href: '/flow-map',
      title: t('dashboard.chatbotActions.openMap'),
      description: t('dashboard.chatbotActions.subtitle'),
      icon: TrendingUp,
      className: 'bg-[linear-gradient(135deg,#eef6ff_0%,#e0ecff_52%,#eef2ff_100%)] border-sky-100 text-slate-900',
      iconClassName: 'bg-sky-100 text-sky-700',
      descriptionClassName: 'text-slate-600',
    },
    {
      href: '/channels',
      title: t('dashboard.labels.channelsNav'),
      description: t('dashboard.labels.monitorChannels'),
      icon: Radio,
      className: 'bg-[linear-gradient(135deg,#fff7ed_0%,#fff1f2_100%)] border-rose-100 text-slate-900',
      iconClassName: 'bg-rose-100 text-rose-700',
      descriptionClassName: 'text-slate-500',
    },
    {
      href: '/reports',
      title: t('dashboard.labels.reportsNav'),
      description: t('dashboard.labels.viewReportsDesc'),
      icon: BarChart3,
      className: 'bg-[linear-gradient(135deg,#eef2ff_0%,#eff6ff_100%)] border-indigo-100 text-slate-900',
      iconClassName: 'bg-indigo-100 text-indigo-700',
      descriptionClassName: 'text-slate-500',
    },
    {
      href: '/conversations',
      title: t('dashboard.chatbotActions.openQueue'),
      description: t('dashboard.labels.viewConversationsDesc'),
      icon: MessageSquareText,
      className: 'bg-[linear-gradient(135deg,#ecfeff_0%,#eef2ff_100%)] border-sky-100 text-slate-900',
      iconClassName: 'bg-sky-100 text-sky-700',
      descriptionClassName: 'text-slate-500',
    },
  ]

  const kpiCards = [
    {
      href: '/properties',
      title: t('dashboard.widgets.propertiesCount'),
      value: stats.properties.total,
      description: `${stats.properties.apartment} ${t('dashboard.labels.apartments').toLowerCase()} · ${stats.properties.house} ${t('dashboard.labels.houses').toLowerCase()}`,
      icon: Home,
      tone: 'border-blue-100 bg-[linear-gradient(180deg,#ffffff_0%,#eff6ff_100%)]',
      iconTone: 'bg-blue-100 text-blue-700',
    },
    {
      href: '/leads',
      title: t('dashboard.widgets.leadsCount'),
      value: stats.leads.total,
      description: t('dashboard.labels.leadsWon', { won: stats.leads.won, total: stats.leads.total }),
      icon: Users,
      tone: 'border-amber-100 bg-[linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)]',
      iconTone: 'bg-amber-100 text-amber-700',
    },
    {
      href: '/appointments',
      title: t('dashboard.widgets.appointmentsToday'),
      value: stats.appointments.today,
      description: t('dashboard.labels.allAppointments'),
      icon: Calendar,
      tone: 'border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#ecfdf5_100%)]',
      iconTone: 'bg-emerald-100 text-emerald-700',
    },
    {
      href: '/reports',
      title: t('dashboard.widgets.revenue'),
      value: stats.revenue.mixed ? t('dashboard.labels.revenueMixed') : formatCurrency(stats.revenue.total, stats.revenue.currencyCode || currencyCode),
      description: stats.revenue.mixed
        ? (stats.revenue.breakdown || []).map((item: any) => formatCurrency(item.total, item.currencyCode)).join(' · ')
        : t('dashboard.labels.soldEur'),
      icon: DollarSign,
      tone: 'border-violet-100 bg-[linear-gradient(180deg,#ffffff_0%,#f5f3ff_100%)]',
      iconTone: 'bg-violet-100 text-violet-700',
    },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">{t('dashboard.loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfdff_0%,#f5f8fc_42%,#eef2f7_100%)]">
      <main className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
          <header className="rounded-[34px] border border-slate-200/70 bg-white/92 p-5 shadow-[0_20px_55px_-42px_rgba(15,23,42,0.22)] backdrop-blur lg:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-gradient-to-br from-blue-500 via-sky-400 to-cyan-300 text-white shadow-lg shadow-sky-400/15">
                    <Building2 size={28} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">INMOCRM</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('dashboard.title')}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-[15px]">{t('dashboard.subtitle')}</p>
                  </div>
                </div>
              </div>

              <div className="flex w-full max-w-xl flex-col gap-3 xl:items-end">
                <div className="w-full rounded-[26px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 shadow-sm">
                        <Users size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{currentUser.fullName}</p>
                        <p className="text-xs text-slate-500">{currentUser.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="inline-flex items-center gap-2 self-start rounded-2xl border border-red-200/80 bg-red-50/80 px-3.5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 sm:self-auto"
                    >
                      <LogOut size={15} />
                      {t('dashboard.logout')}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                      {commercial.tenantName || t('common.notSpecified')}
                    </span>
                    {currentUserRoleLabel ? (
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${isSuperadmin ? 'border-red-200 bg-red-50 text-red-600' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                        {currentUserRoleLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </header>

      {showWidgetMenu && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.addWidget')}</h3>
              <button onClick={() => setShowWidgetMenu(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2">
              {availableWidgets.length === 0 ? (
                 <p className="text-slate-500 text-center py-4">{t('dashboard.labels.allWidgetsAdded')}</p>
              ) : (
                availableWidgets.map(widget => (
                  <button
                    key={widget.id}
                    onClick={() => addWidget(widget)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition text-left"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      {widget.type === 'stats' && <Activity size={20} className="text-blue-500" />}
                      {widget.type === 'chart' && <PieChart size={20} className="text-blue-500" />}
                      {widget.type === 'list' && <FileText size={20} className="text-blue-500" />}
                    </div>
                    <div>
                       <p className="font-medium text-slate-900">
                         {widget.id.startsWith('properties-count') ? t('dashboard.widgets.propertiesCount') :
                          widget.id.startsWith('leads-count') ? t('dashboard.widgets.leadsCount') :
                          widget.id.startsWith('appointments-today') ? t('dashboard.widgets.appointmentsToday') :
                          widget.id.startsWith('revenue') ? t('dashboard.widgets.revenue') :
                          widget.id.startsWith('recent-leads') ? t('dashboard.widgets.recentLeads') :
                          widget.id.startsWith('upcoming-appointments') ? t('dashboard.widgets.upcomingAppointments') :
                          widget.id.startsWith('conversion-rate') ? t('dashboard.widgets.conversionRate') :
                          widget.id.startsWith('properties-by-type') ? t('dashboard.widgets.propertiesByType') : widget.title}
                       </p>
                       <p className="text-xs text-slate-500 capitalize">{t(`dashboard.widgetType.${widget.type}`)}</p>
                     </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-600">
              <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <section className={`rounded-[30px] border bg-gradient-to-r p-4 shadow-sm lg:p-5 ${statusTone}`}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center gap-2">
                  {statusIcon}
                  <span className="text-sm font-semibold uppercase tracking-[0.18em]">
                    {t('dashboard.commercial.title')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center rounded-full border border-white/80 bg-white/92 px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm">
                    {commercial.planName || t('dashboard.commercial.noPlan')}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-3.5 py-2 text-sm text-slate-700 shadow-sm">
                    {t('dashboard.commercial.statusLabel')}: {t(`admin.status.${commercialStatus}`)}
                  </span>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6">
                <Link href="/team" className="group rounded-[22px] border border-white/80 bg-white/92 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.commercial.users')}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-900">
                    {commercial.billableUsers} / {commercial.maxUsers ?? '∞'}
                    <ArrowRight size={13} className="text-slate-300 transition group-hover:text-blue-500" />
                  </p>
                </Link>
                <Link href="/properties" className="group rounded-[22px] border border-white/80 bg-white/92 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.commercial.properties')}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-900">
                    {stats.properties.total} / {commercial.maxProperties ?? '∞'}
                    <ArrowRight size={13} className="text-slate-300 transition group-hover:text-blue-500" />
                  </p>
                </Link>
                <Link href="/leads" className="group rounded-[22px] border border-white/80 bg-white/92 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.commercial.leads')}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-900">
                    {stats.leads.total} / {commercial.maxLeads ?? '∞'}
                    <ArrowRight size={13} className="text-slate-300 transition group-hover:text-blue-500" />
                  </p>
                </Link>
                <div className="rounded-[22px] border border-white/80 bg-white/92 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.commercial.tenant')}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{commercial.tenantName || t('common.notSpecified')}</p>
                </div>
                <div className="rounded-[22px] border border-white/80 bg-white/92 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.commercial.capacity')}</p>
                  <p className={`mt-1 text-sm font-semibold ${commercial.canCreateMoreUsers ? 'text-emerald-700' : 'text-red-700'}`}>
                    {commercial.canCreateMoreUsers ? t('dashboard.commercial.capacityAvailable') : t('dashboard.commercial.capacityReached')}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[22px] border border-white/80 bg-white/92 px-4 py-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.commercial.trialEnds')}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {commercial.trialEndsAt ? formatDate(commercial.trialEndsAt, { day: '2-digit', month: 'short', year: 'numeric' }) : t('common.notSpecified')}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/80 bg-white/92 px-4 py-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t('dashboard.commercial.periodEnds')}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {commercial.currentPeriodEnd ? formatDate(commercial.currentPeriodEnd, { day: '2-digit', month: 'short', year: 'numeric' }) : t('common.notSpecified')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {!commercial.isOperational && (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {t('dashboard.commercial.notOperational')}
              </p>
            )}
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {kpiCards.map((card) => {
              const Icon = card.icon
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className={`group rounded-[26px] border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-500">{card.title}</p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{card.value}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{card.description}</p>
                    </div>
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.iconTone}`}>
                      <Icon size={20} />
                    </span>
                  </div>
                </Link>
              )
            })}
          </section>

          <section className="rounded-[28px] border border-slate-200/70 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_45%,#f0f6ff_100%)] p-4 shadow-sm lg:p-5">
            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t('dashboard.labels.primaryAccess')}</p>
                <p className="mt-2 text-sm text-slate-500">{t('dashboard.labels.workspaceSubtitle')}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              {primaryAccessCards.map((card) => {
                const Icon = card.icon
                return (
                  <Link
                    key={card.href}
                    href={card.href}
                    className={`group rounded-[24px] border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.className}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold">{card.title}</p>
                        <p className={`mt-2 text-sm leading-6 ${card.descriptionClassName}`}>{card.description}</p>
                      </div>
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition ${card.iconClassName}`}>
                        <Icon size={20} />
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          <section className="space-y-5">
            <div>
              <div className="mb-4">
                <p className="text-sm font-semibold tracking-tight text-slate-900">{t('dashboard.labels.quickActionsTitle')}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{t('dashboard.labels.quickActionsSubtitle')}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Link
                  href="/properties/new"
                  className="group flex min-h-[120px] items-center gap-4 rounded-[24px] border border-blue-100/80 bg-white/92 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 transition group-hover:bg-blue-200">
                    <Building2 className="text-blue-500" size={24} />
                  </div>
                  <div>
                     <p className="font-medium text-slate-900">{t('dashboard.labels.newProperty')}</p>
                     <p className="text-sm text-slate-500">{t('dashboard.labels.addInventory')}</p>
                  </div>
                </Link>
                <Link
                  href="/leads/new"
                  className="group flex min-h-[120px] items-center gap-4 rounded-[24px] border border-amber-100/80 bg-white/92 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 transition group-hover:bg-amber-200">
                    <UserPlus className="text-amber-500" size={24} />
                  </div>
                  <div>
                     <p className="font-medium text-slate-900">{t('dashboard.labels.newLead')}</p>
                     <p className="text-sm text-slate-500">{t('dashboard.labels.captureContact')}</p>
                  </div>
                </Link>
                <Link
                  href="/appointments/new"
                  className="group flex min-h-[120px] items-center gap-4 rounded-[24px] border border-emerald-100/80 bg-white/92 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 transition group-hover:bg-green-200">
                    <Calendar className="text-green-500" size={24} />
                  </div>
                  <div>
                     <p className="font-medium text-slate-900">{t('dashboard.labels.newAppointment')}</p>
                     <p className="text-sm text-slate-500">{t('dashboard.labels.scheduleVisit')}</p>
                  </div>
                </Link>
                <Link
                  href="/appointments"
                  className="group flex min-h-[120px] items-center gap-4 rounded-[24px] border border-violet-100/80 bg-white/92 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 transition group-hover:bg-purple-200">
                    <Calendar className="text-purple-500" size={24} />
                  </div>
                  <div>
                     <p className="font-medium text-slate-900">{t('dashboard.labels.viewCalendar')}</p>
                     <p className="text-sm text-slate-500">{t('dashboard.labels.allAppointments')}</p>
                  </div>
                </Link>
              </div>
            </div>

            <div>
              <div className="mb-4">
                <p className="text-sm font-semibold tracking-tight text-slate-900">{t('dashboard.labels.workspaceTitle')}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{t('dashboard.labels.workspaceSubtitle')}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {shortcutCards.map((card) => {
                  const Icon = card.icon
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="group flex min-h-[120px] items-center gap-4 rounded-[24px] border border-slate-200/80 bg-white/92 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition group-hover:scale-105 ${card.tone}`}>
                        <Icon size={24} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{card.title}</p>
                        <p className="text-sm text-slate-500">{card.description}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="rounded-[30px] border border-sky-100/80 bg-[linear-gradient(135deg,#f5fbff_0%,#ffffff_42%,#f5f7ff_100%)] p-4 shadow-sm lg:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="rounded-[24px] border border-white/80 bg-white/92 px-5 py-4 shadow-sm xl:min-w-[320px]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {t('dashboard.chatbotActions.title')}
                </p>
                <div className="mt-3 flex items-end gap-3">
                  <p className="text-4xl font-semibold leading-none text-slate-900">{chatbotActionTotal}</p>
                  <p className="pb-1 text-sm text-slate-500">{t('dashboard.labels.chatbotTasks')}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{t('dashboard.chatbotActions.subtitle')}</p>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
                {chatbotActionCards.map((card) => (
                  <Link
                    key={card.type}
                    href={card.href}
                    className="group rounded-[22px] border border-white/80 bg-white/92 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {getChatbotActionLabel(card.type, t)}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <p className="text-2xl font-semibold leading-none text-slate-900">
                        {chatbotActionCountByType[card.type] || 0}
                      </p>
                      <ArrowRight size={14} className="text-slate-300 transition group-hover:text-blue-500" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {widgets.length > 0 && (
            <section className="rounded-[32px] border border-slate-200/70 bg-white/72 p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t('dashboard.labels.widgetAreaTitle')}</p>
                  <p className="mt-1 text-sm text-slate-500">{t('dashboard.labels.widgetAreaSubtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-1.5 shadow-sm">
                  <button
                    onClick={() => setShowWidgetMenu(!showWidgetMenu)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    <Plus size={16} />
                    {t('dashboard.addWidget')}
                  </button>
                  <button
                    onClick={resetWidgets}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
                  >
                    <RotateCcw size={16} />
                    {t('dashboard.labels.resetWidgets')}
                  </button>
                </div>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={widgets} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {widgets.map(widget => (
                      <SortableWidget
                        key={widget.id}
                        widget={widget}
                        onRemove={removeWidget}
                        stats={stats}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </section>
          )}

          {widgets.length === 0 && (
            <div className="rounded-[32px] border border-slate-200 bg-white p-12 text-center shadow-sm">
              <BarChart3 className="mx-auto mb-4 text-slate-300" size={48} />
              <h3 className="mb-2 text-lg font-semibold text-slate-900">{t('dashboard.labels.noWidgets')}</h3>
              <p className="mb-4 text-slate-500">{t('dashboard.labels.customizeDashboard')}</p>
              <button
                onClick={resetWidgets}
                className="rounded-2xl bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700"
              >
                {t('dashboard.labels.resetWidgets')}
              </button>
            </div>
          )}

          <ChatbotWidget tenantSlug={tenantSlug} />
        </div>
      </main>
    </div>
  )
}

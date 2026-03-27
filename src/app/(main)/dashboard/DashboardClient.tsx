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
  Building2, UserPlus, FileText, Activity, LogOut
} from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

interface Widget {
  id: string
  type: 'stats' | 'chart' | 'list' | 'activity'
  title: string
  size: 'small' | 'medium' | 'large'
  visible: boolean
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'properties-count', type: 'stats', title: 'Propiedades', size: 'small', visible: true },
  { id: 'leads-count', type: 'stats', title: 'Leads', size: 'small', visible: true },
  { id: 'appointments-today', type: 'stats', title: 'Citas Hoy', size: 'small', visible: true },
  { id: 'revenue', type: 'stats', title: 'Ingresos', size: 'small', visible: true },
  { id: 'recent-leads', type: 'list', title: 'Leads Recientes', size: 'medium', visible: true },
  { id: 'upcoming-appointments', type: 'list', title: 'Proximas Citas', size: 'medium', visible: true },
  { id: 'conversion-rate', type: 'chart', title: 'Tasa Conversion', size: 'medium', visible: true },
  { id: 'properties-by-type', type: 'chart', title: 'Por Tipo', size: 'medium', visible: true },
]

const STORAGE_KEY = 'crm_dashboard_widgets'

interface SortableWidgetProps {
  widget: Widget
  onRemove: (id: string) => void
  stats: any
}

function SortableWidget({ widget, onRemove, stats }: SortableWidgetProps) {
  const { t, formatDate } = useI18n()
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
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Home className="text-blue-500" size={24} />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">{stats.properties.total}</p>
               <p className="text-sm text-slate-500">{t('dashboard.widgets.propertiesCount')}</p>
            </div>
          </div>
        )
      case 'leads-count':
        return (
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <Users className="text-amber-500" size={24} />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">{stats.leads.total}</p>
               <p className="text-sm text-slate-500">{t('dashboard.widgets.leadsCount')}</p>
            </div>
          </div>
        )
      case 'appointments-today':
        return (
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Calendar className="text-green-500" size={24} />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">{stats.appointments.today}</p>
               <p className="text-sm text-slate-500">{t('dashboard.widgets.appointmentsToday')}</p>
            </div>
          </div>
        )
      case 'revenue':
        return (
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <DollarSign className="text-emerald-500" size={24} />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">{(stats.revenue.total / 1000).toFixed(0)}K</p>
               <p className="text-sm text-slate-500">{t('dashboard.labels.soldEur')}</p>
            </div>
          </div>
        )
      case 'recent-leads':
        return (
          <div className="space-y-2">
            {stats.recentLeads.length === 0 ? (
               <p className="text-slate-400 text-sm text-center py-4">{t('dashboard.labels.noRecentLeads')}</p>
            ) : (
              stats.recentLeads.slice(0, 5).map((lead: any) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
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
            <Link href="/leads" className="flex items-center justify-center gap-1 text-sm text-blue-500 hover:text-blue-600 pt-2 border-t">
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
                <Link key={apt.id} href={`/appointments/${apt.id}`} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition">
                  <div className={`w-2 h-2 rounded-full ${
                    apt.status === 'confirmed' ? 'bg-green-500' : 
                    apt.status === 'scheduled' ? 'bg-blue-500' : 'bg-slate-300'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{apt.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(apt.start_time, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </Link>
              ))
            )}
            <Link href="/appointments" className="flex items-center justify-center gap-1 text-sm text-blue-500 hover:text-blue-600 pt-2 border-t">
               {t('dashboard.labels.viewAllAppointments')} <ArrowRight size={14} />
            </Link>
          </div>
        )
      case 'conversion-rate':
        const rate = stats.leads.total > 0 ? ((stats.leads.won / stats.leads.total) * 100).toFixed(1) : 0
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 transform -rotate-90">
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
      case 'properties-by-type':
        const types = [
           { name: t('dashboard.labels.apartments'), count: stats.propertiesByType.apartment, color: 'bg-blue-500' },
           { name: t('dashboard.labels.houses'), count: stats.propertiesByType.house, color: 'bg-green-500' },
           { name: t('dashboard.labels.land'), count: stats.propertiesByType.land, color: 'bg-amber-500' },
           { name: t('dashboard.labels.commercial'), count: stats.propertiesByType.commercial, color: 'bg-purple-500' },
        ]
        const maxCount = Math.max(...types.map(t => t.count), 1)
        return (
          <div className="space-y-3">
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
      default:
        return <p className="text-slate-400">{t('dashboard.labels.widget')}</p>
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl border border-slate-200 p-4 relative group"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">{getWidgetTitle(widget.id)}</h3>
        <div className="flex items-center gap-1">
          <button
            {...attributes}
            {...listeners}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition"
          >
            <GripVertical size={16} />
          </button>
          <button
            onClick={() => onRemove(widget.id)}
            className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
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
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS)
  const [stats, setStats] = useState<any>({
    properties: { total: 0, apartment: 0, house: 0, land: 0, commercial: 0 },
    propertiesByType: { apartment: 0, house: 0, land: 0, commercial: 0 },
    leads: { total: 0, won: 0 },
    appointments: { today: 0 },
    revenue: { total: 0 },
    recentLeads: [],
    upcomingAppointments: [],
  })
  const [showWidgetMenu, setShowWidgetMenu] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        setLoading(false)
        return
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const [propertiesRes, leadsRes, appointmentsRes] = await Promise.all([
        supabase.from('properties').select('*').eq('tenant_id', profile.tenant_id),
        supabase.from('leads').select('*').eq('tenant_id', profile.tenant_id),
        supabase.from('appointments')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .gte('start_time', today.toISOString())
          .lt('start_time', tomorrow.toISOString()),
      ])

      const allAppointments = await supabase
        .from('appointments')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .gte('start_time', new Date().toISOString())
        .order('start_time')
        .limit(10)

      const properties = propertiesRes.data || []
      const leads = leadsRes.data || []

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
          total: properties
            .filter(p => p.status === 'sold')
            .reduce((sum, p) => sum + (p.price || 0), 0),
        },
        recentLeads: leads.slice(0, 5),
        upcomingAppointments: allAppointments.data || [],
      })
    } catch (error) {
      console.error('Error loading:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadWidgetConfig = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const config = JSON.parse(stored)
        setWidgets(config)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">{t('dashboard.loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-slate-900 font-semibold text-lg">{t('dashboard.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWidgetMenu(!showWidgetMenu)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition"
            >
              <Plus size={16} />
               {t('dashboard.addWidget')}
            </button>
            <button
              onClick={resetWidgets}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition"
            >
               {t('dashboard.reset')}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition"
            >
              <LogOut size={16} />
               {t('dashboard.logout')}
            </button>
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

      <main className="p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={widgets} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-4 gap-4">
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

        {widgets.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <BarChart3 className="mx-auto text-slate-300 mb-4" size={48} />
             <h3 className="text-lg font-semibold text-slate-900 mb-2">{t('dashboard.labels.noWidgets')}</h3>
             <p className="text-slate-500 mb-4">{t('dashboard.labels.customizeDashboard')}</p>
            <button
              onClick={resetWidgets}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
            >
               {t('dashboard.labels.resetWidgets')}
            </button>
          </div>
        )}

        <div className="mt-6 grid grid-cols-4 gap-4">
          <Link
            href="/properties/new"
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-md transition"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Building2 className="text-blue-500" size={24} />
            </div>
            <div>
               <p className="font-medium text-slate-900">{t('dashboard.labels.newProperty')}</p>
               <p className="text-sm text-slate-500">{t('dashboard.labels.addInventory')}</p>
            </div>
          </Link>
          <Link
            href="/leads/new"
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-md transition"
          >
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <UserPlus className="text-amber-500" size={24} />
            </div>
            <div>
               <p className="font-medium text-slate-900">{t('dashboard.labels.newLead')}</p>
               <p className="text-sm text-slate-500">{t('dashboard.labels.captureContact')}</p>
            </div>
          </Link>
          <Link
            href="/appointments/new"
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-md transition"
          >
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Calendar className="text-green-500" size={24} />
            </div>
            <div>
               <p className="font-medium text-slate-900">{t('dashboard.labels.newAppointment')}</p>
               <p className="text-sm text-slate-500">{t('dashboard.labels.scheduleVisit')}</p>
            </div>
          </Link>
          <Link
            href="/appointments"
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-md transition"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Calendar className="text-purple-500" size={24} />
            </div>
            <div>
               <p className="font-medium text-slate-900">{t('dashboard.labels.viewCalendar')}</p>
               <p className="text-sm text-slate-500">{t('dashboard.labels.allAppointments')}</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}

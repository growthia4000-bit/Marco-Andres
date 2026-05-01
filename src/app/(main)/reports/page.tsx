'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts'
import {
  TrendingUp, Home, Users, Calendar, DollarSign,
  FileSpreadsheet, AlertTriangle, ChevronRight, SlidersHorizontal, BarChart3, ArrowUpRight, Target
} from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

const KPI_STYLES = [
  { shell: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white', icon: 'bg-blue-500 text-white', value: 'text-slate-900' },
  { shell: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white', icon: 'bg-amber-500 text-white', value: 'text-slate-900' },
  { shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white', icon: 'bg-emerald-500 text-white', value: 'text-slate-900' },
  { shell: 'border-violet-200 bg-gradient-to-br from-violet-50 to-white', icon: 'bg-violet-500 text-white', value: 'text-slate-900' },
] as const

interface Stats {
  properties: { total: number; active: number; sold: number; rented: number }
  leads: { total: number; new: number; contacted: number; qualified: number; won: number; lost: number }
  appointments: { total: number; scheduled: number; completed: number; cancelled: number }
  revenue: { total: number; avg: number; mixed: boolean; currencyCode: string | null; breakdown: { currencyCode: string; total: number }[] }
}

interface ChartData {
  propertiesByType: { name: string; value: number }[]
  leadsByStatus: { name: string; value: number }[]
  appointmentsByMonth: { month: string; citas: number }[]
  revenueByMonth: { month: string; ventas: number }[]
  revenueMixed: boolean
  revenueByCurrency: { currencyCode: string; total: number }[]
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [dateRange, setDateRange] = useState('30')
  const router = useRouter()
  const supabase = createClient()
  const { t, formatCurrency, currencyCode, locale } = useI18n()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
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

      if (profileError) {
        setError(t('reports.errors.profile'))
        setLoading(false)
        return
      }

      if (!profile?.tenant_id) {
        setError(t('reports.errors.tenant'))
        setLoading(false)
        return
      }

      const daysAgo = parseInt(dateRange)
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - daysAgo)
      const startDateStr = startDate.toISOString()

      const [propertiesRes, leadsRes, appointmentsRes] = await Promise.all([
        supabase.from('properties').select('*').eq('tenant_id', profile.tenant_id),
        supabase.from('leads').select('*').eq('tenant_id', profile.tenant_id),
        supabase.from('appointments')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .gte('created_at', startDateStr),
      ])

      if (propertiesRes.error || leadsRes.error || appointmentsRes.error) {
        setError(t('reports.errors.load'))
        setLoading(false)
        return
      }

      const properties = propertiesRes.data || []
      const leads = leadsRes.data || []
      const appointments = appointmentsRes.data || []

      const soldProperties = properties.filter(p => p.status === 'sold')
      const revenueGroups = new Map<string, number>()
      soldProperties.forEach((property) => {
        const code = property.currency_code || currencyCode
        const amount = property.price_amount ?? property.price ?? 0
        revenueGroups.set(code, (revenueGroups.get(code) || 0) + amount)
      })
      const revenueBreakdown = Array.from(revenueGroups.entries()).map(([currencyCode, total]) => ({ currencyCode, total }))
      const revenueMixed = revenueBreakdown.length > 1

      setStats({
        properties: {
          total: properties.length,
          active: properties.filter(p => p.status === 'active').length,
          sold: properties.filter(p => p.status === 'sold').length,
          rented: properties.filter(p => p.status === 'rented').length,
        },
        leads: {
          total: leads.length,
          new: leads.filter(l => l.status === 'new').length,
          contacted: leads.filter(l => l.status === 'contacted').length,
          qualified: leads.filter(l => l.status === 'qualified').length,
          won: leads.filter(l => l.status === 'won').length,
          lost: leads.filter(l => l.status === 'lost').length,
        },
        appointments: {
          total: appointments.length,
          scheduled: appointments.filter(a => a.status === 'scheduled').length,
          completed: appointments.filter(a => a.status === 'completed').length,
          cancelled: appointments.filter(a => a.status === 'cancelled').length,
        },
        revenue: {
          total: revenueBreakdown[0]?.total || 0,
          avg: revenueBreakdown[0]?.total && soldProperties.length > 0 && !revenueMixed ? revenueBreakdown[0].total / soldProperties.length : 0,
          mixed: revenueMixed,
          currencyCode: revenueBreakdown[0]?.currencyCode || null,
          breakdown: revenueBreakdown,
        },
      })

      const propertiesByType = [
        { name: t('reports.types.apartments'), value: properties.filter(p => p.property_type === 'apartment').length },
        { name: t('reports.types.houses'), value: properties.filter(p => p.property_type === 'house').length },
        { name: t('reports.types.land'), value: properties.filter(p => p.property_type === 'land').length },
        { name: t('reports.types.commercial'), value: properties.filter(p => p.property_type === 'commercial').length },
        { name: t('reports.types.other'), value: properties.filter(p => p.property_type === 'other' || !p.property_type).length },
      ].filter(d => d.value > 0)

      const leadsByStatus = [
        { name: t('reports.leadStatuses.new'), value: leads.filter(l => l.status === 'new').length },
        { name: t('reports.leadStatuses.contacted'), value: leads.filter(l => l.status === 'contacted').length },
        { name: t('reports.leadStatuses.qualified'), value: leads.filter(l => l.status === 'qualified').length },
        { name: t('reports.leadStatuses.won'), value: leads.filter(l => l.status === 'won').length },
        { name: t('reports.leadStatuses.lost'), value: leads.filter(l => l.status === 'lost').length },
      ].filter(d => d.value > 0)

      const months = [t('reports.months.jan'), t('reports.months.feb'), t('reports.months.mar'), t('reports.months.apr'), t('reports.months.may'), t('reports.months.jun'), t('reports.months.jul'), t('reports.months.aug'), t('reports.months.sep'), t('reports.months.oct'), t('reports.months.nov'), t('reports.months.dec')]
      const appointmentsByMonth = months.map((month, i) => ({
        month,
        citas: appointments.filter(a => {
          const d = new Date(a.created_at)
          return d.getMonth() === i
        }).length,
      }))

      const revenueByMonth = months.map((month, i) => ({
        month,
        ventas: soldProperties
          .filter(p => {
            const d = new Date(p.updated_at || p.created_at)
            return d.getMonth() === i && p.status === 'sold'
          })
          .reduce((sum, p) => sum + ((p.price_amount ?? p.price) || 0), 0),
      }))

      setChartData({
        propertiesByType,
        leadsByStatus,
        appointmentsByMonth,
        revenueByMonth,
        revenueMixed,
        revenueByCurrency: revenueBreakdown,
      })
    } catch (error) {
      console.error('Error loading:', error)
      setError(t('reports.errors.connection'))
    } finally {
      setLoading(false)
    }
  }, [currencyCode, dateRange, formatCurrency, locale, router, supabase, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const exportData = (type: string) => {
    const url = `/api/export?type=${type}&format=csv`
    window.open(url, '_blank')
  }

  const renderExportButton = (type: string) => (
    <button
      onClick={() => exportData(type)}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
    >
      <FileSpreadsheet size={14} />
      {t('reports.charts.export')}
    </button>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <section className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_40%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0 space-y-4">
                <nav className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900">
                    {t('dashboard.title')}
                  </Link>
                  <ChevronRight size={14} className="text-slate-300" />
                  <span className="font-medium text-slate-900">{t('reports.title')}</span>
                </nav>
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                    <BarChart3 size={22} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('reports.title')}</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('reports.subtitle')}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 xl:min-w-[250px] xl:items-end">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <SlidersHorizontal size={14} />
                  {t('reports.rangeLabel')}
                </span>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="min-w-[220px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="30">{t('reports.ranges.last30')}</option>
                  <option value="90">{t('reports.ranges.last90')}</option>
                  <option value="180">{t('reports.ranges.last180')}</option>
                  <option value="365">{t('reports.ranges.last365')}</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {stats && (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { href: '/properties', label: t('reports.cards.properties'), value: stats.properties.total, summary: t('reports.cards.propertiesSummary', { active: stats.properties.active, sold: stats.properties.sold }), icon: Home },
                { href: '/leads', label: t('reports.cards.leads'), value: stats.leads.total, summary: t('reports.cards.leadsSummary', { won: stats.leads.won, qualified: stats.leads.qualified }), icon: Users },
                { href: '/appointments', label: t('reports.cards.appointments'), value: stats.appointments.total, summary: t('reports.cards.appointmentsSummary', { completed: stats.appointments.completed }), icon: Calendar },
                { href: '#revenue-section', label: t('reports.cards.revenue'), value: stats.revenue.mixed ? t('reports.cards.mixedCurrencies') : formatCurrency(stats.revenue.total, stats.revenue.currencyCode || undefined), summary: stats.revenue.mixed ? stats.revenue.breakdown.map((item) => formatCurrency(item.total, item.currencyCode)).join(' · ') : t('reports.cards.revenueAverage', { value: formatCurrency(stats.revenue.avg, stats.revenue.currencyCode || undefined) }), icon: DollarSign },
              ].map((card, index) => {
                const Icon = card.icon
                const style = KPI_STYLES[index]
                return (
                  <Link
                    key={card.label}
                    href={card.href}
                    className={`group rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${style.shell}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-500">{card.label}</p>
                        <p className={`text-3xl font-semibold tracking-tight ${style.value}`}>{card.value}</p>
                      </div>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm ${style.icon}`}>
                        <Icon size={18} />
                      </div>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <p className="text-xs leading-5 text-slate-500">{card.summary}</p>
                      <ArrowUpRight size={16} className="shrink-0 text-slate-400 transition group-hover:text-slate-600" />
                    </div>
                  </Link>
                )
              })}
            </div>

            {chartData && (
              <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div id="revenue-section" className="scroll-mt-32 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('reports.cards.properties')}</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('reports.charts.propertiesByType')}</h3>
                    </div>
                    {renderExportButton('properties')}
                  </div>
                  {chartData.propertiesByType.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                        <Pie
                          data={chartData.propertiesByType}
                          cx="50%"
                          cy="46%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          labelLine={false}
                        >
                          {chartData.propertiesByType.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {chartData.propertiesByType.map((item, index) => {
                          const total = chartData.propertiesByType.reduce((sum, current) => sum + current.value, 0) || 1
                          return (
                            <div key={item.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                <span className="truncate">{item.name}</span>
                              </span>
                              <span className="shrink-0 font-medium text-slate-900">{Math.round((item.value / total) * 100)}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-64 items-center justify-center text-slate-400">
                      {t('reports.charts.noData')}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('reports.cards.leads')}</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('reports.charts.leadsByStatus')}</h3>
                    </div>
                    {renderExportButton('leads')}
                  </div>
                  {chartData.leadsByStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={chartData.leadsByStatus} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" width={112} tick={{ fill: '#475569', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#3B82F6" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-64 items-center justify-center text-slate-400">
                      {t('reports.charts.noData')}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('reports.cards.appointments')}</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('reports.charts.appointmentsByMonth')}</h3>
                    </div>
                    {renderExportButton('appointments')}
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData.appointmentsByMonth} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => [value, t('reports.cards.appointments')]} />
                      <Line type="monotone" dataKey="citas" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('reports.cards.revenue')}</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('reports.charts.revenueByMonth')}</h3>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      <TrendingUp size={14} />
                      {t('reports.rangeLabel')}
                    </span>
                  </div>
                  {chartData.revenueMixed ? (
                    <div className="flex h-[250px] flex-col items-center justify-center gap-3 text-slate-500">
                      <p className="text-center max-w-sm">{t('reports.charts.mixedCurrencies')}</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {chartData.revenueByCurrency.map((item) => (
                          <span key={item.currencyCode} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                            {formatCurrency(item.total, item.currencyCode)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={chartData.revenueByMonth} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value) => formatCurrency(Number(value), stats.revenue.currencyCode || undefined)} />
                        <Bar dataKey="ventas" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{t('reports.quick.title')}</h3>
                <p className="text-sm text-slate-500">{t('reports.charts.export')}</p>
              </div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => exportData('properties')}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FileSpreadsheet className="text-blue-500" size={20} />
                <span className="text-sm font-medium text-slate-700">{t('reports.quick.exportProperties')}</span>
              </button>
              <button
                onClick={() => exportData('leads')}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FileSpreadsheet className="text-amber-500" size={20} />
                <span className="text-sm font-medium text-slate-700">{t('reports.quick.exportLeads')}</span>
              </button>
              <button
                onClick={() => exportData('appointments')}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FileSpreadsheet className="text-green-500" size={20} />
                <span className="text-sm font-medium text-slate-700">{t('reports.quick.exportAppointments')}</span>
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <Target size={18} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{t('reports.nextSteps.title')}</h3>
                <p className="text-sm text-slate-500">{t('reports.rangeLabel')}</p>
              </div>
            </div>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>
                {t('reports.nextSteps.reviewUncontacted')}
              </li>
              <li className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                {t('reports.nextSteps.scheduleFollowups')}
              </li>
              <li className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>
                {t('reports.nextSteps.updateSold')}
              </li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <TrendingUp size={18} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{t('reports.kpis.title')}</h3>
                <p className="text-sm text-slate-500">{t('reports.subtitle')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3">
                <span className="text-sm text-slate-600">{t('reports.kpis.conversion')}</span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-900 shadow-sm">
                  {stats?.leads.total ? ((stats.leads.won / stats.leads.total) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3">
                <span className="text-sm text-slate-600">{t('reports.kpis.completedAppointments')}</span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-900 shadow-sm">
                  {stats?.appointments.total ? ((stats.appointments.completed / stats.appointments.total) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3">
                <span className="text-sm text-slate-600">{t('reports.kpis.activeProperties')}</span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-900 shadow-sm">
                  {stats?.properties.total ? ((stats.properties.active / stats.properties.total) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

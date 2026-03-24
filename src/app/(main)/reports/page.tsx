'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts'
import {
  TrendingUp, TrendingDown, Home, Users, Calendar, DollarSign,
  ArrowLeft, Download, FileSpreadsheet
} from 'lucide-react'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

interface Stats {
  properties: { total: number; active: number; sold: number; rented: number }
  leads: { total: number; new: number; contacted: number; qualified: number; won: number; lost: number }
  appointments: { total: number; scheduled: number; completed: number; cancelled: number }
  revenue: { total: number; avg: number }
}

interface ChartData {
  propertiesByType: { name: string; value: number }[]
  leadsByStatus: { name: string; value: number }[]
  appointmentsByMonth: { month: string; citas: number }[]
  revenueByMonth: { month: string; ventas: number }[]
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [dateRange, setDateRange] = useState('30')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [dateRange])

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

      const properties = propertiesRes.data || []
      const leads = leadsRes.data || []
      const appointments = appointmentsRes.data || []

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
          total: properties
            .filter(p => p.status === 'sold')
            .reduce((sum, p) => sum + (p.price || 0), 0),
          avg: properties
            .filter(p => p.status === 'sold')
            .reduce((sum, p, _, arr) => sum + (p.price || 0) / arr.length, 0),
        },
      })

      const propertiesByType = [
        { name: 'Apartamentos', value: properties.filter(p => p.property_type === 'apartment').length },
        { name: 'Casas', value: properties.filter(p => p.property_type === 'house').length },
        { name: 'Terrenos', value: properties.filter(p => p.property_type === 'land').length },
        { name: 'Comercial', value: properties.filter(p => p.property_type === 'commercial').length },
        { name: 'Otros', value: properties.filter(p => p.property_type === 'other' || !p.property_type).length },
      ].filter(d => d.value > 0)

      const leadsByStatus = [
        { name: 'Nuevos', value: leads.filter(l => l.status === 'new').length },
        { name: 'Contactados', value: leads.filter(l => l.status === 'contacted').length },
        { name: 'Cualificados', value: leads.filter(l => l.status === 'qualified').length },
        { name: 'Ganados', value: leads.filter(l => l.status === 'won').length },
        { name: 'Perdidos', value: leads.filter(l => l.status === 'lost').length },
      ].filter(d => d.value > 0)

      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      const appointmentsByMonth = months.map((month, i) => ({
        month,
        citas: appointments.filter(a => {
          const d = new Date(a.created_at)
          return d.getMonth() === i
        }).length,
      }))

      const revenueByMonth = months.map((month, i) => ({
        month,
        ventas: properties
          .filter(p => {
            const d = new Date(p.updated_at || p.created_at)
            return d.getMonth() === i && p.status === 'sold'
          })
          .reduce((sum, p) => sum + (p.price || 0), 0) / 1000,
      }))

      setChartData({
        propertiesByType,
        leadsByStatus,
        appointmentsByMonth,
        revenueByMonth,
      })
    } catch (error) {
      console.error('Error loading:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportData = (type: string) => {
    const url = `/api/export?type=${type}&format=csv`
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft size={20} />
            </Link>
            <span className="text-slate-900 font-medium">Reportes y Estadisticas</span>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-sm"
            >
              <option value="30">Ultimos 30 dias</option>
              <option value="90">Ultimos 3 meses</option>
              <option value="180">Ultimos 6 meses</option>
              <option value="365">Ultimo ano</option>
            </select>
          </div>
        </div>
      </header>

      <main className="p-6">
        {stats && (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-sm">Propiedades</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.properties.total}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Home className="text-blue-500" size={24} />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {stats.properties.active} activas, {stats.properties.sold} vendidas
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-sm">Leads</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.leads.total}</p>
                  </div>
                  <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Users className="text-amber-500" size={24} />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {stats.leads.won} ganados, {stats.leads.qualified} cualificados
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-sm">Citas</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.appointments.total}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Calendar className="text-green-500" size={24} />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {stats.appointments.completed} completadas
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-sm">Ingresos</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {(stats.revenue.total / 1000).toFixed(0)}K EUR
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-emerald-500" size={24} />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Promedio: {(stats.revenue.avg / 1000).toFixed(0)}K EUR
                </p>
              </div>
            </div>

            {chartData && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">Propiedades por Tipo</h3>
                    <button
                      onClick={() => exportData('properties')}
                      className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                    >
                      <FileSpreadsheet size={14} />
                      Exportar
                    </button>
                  </div>
                  {chartData.propertiesByType.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={chartData.propertiesByType}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        >
                          {chartData.propertiesByType.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-400">
                      Sin datos
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">Leads por Estado</h3>
                    <button
                      onClick={() => exportData('leads')}
                      className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                    >
                      <FileSpreadsheet size={14} />
                      Exportar
                    </button>
                  </div>
                  {chartData.leadsByStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={chartData.leadsByStatus} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={80} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-400">
                      Sin datos
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">Citas por Mes</h3>
                    <button
                      onClick={() => exportData('appointments')}
                      className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
                    >
                      <FileSpreadsheet size={14} />
                      Exportar
                    </button>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData.appointmentsByMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="citas" stroke="#10B981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Ingresos por Mes (miles EUR)</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData.revenueByMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => `${value}K EUR`} />
                      <Bar dataKey="ventas" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Acciones Rapidas</h3>
            <div className="space-y-2">
              <button
                onClick={() => exportData('properties')}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition"
              >
                <FileSpreadsheet className="text-blue-500" size={20} />
                <span className="text-sm text-slate-700">Exportar Propiedades CSV</span>
              </button>
              <button
                onClick={() => exportData('leads')}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition"
              >
                <FileSpreadsheet className="text-amber-500" size={20} />
                <span className="text-sm text-slate-700">Exportar Leads CSV</span>
              </button>
              <button
                onClick={() => exportData('appointments')}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition"
              >
                <FileSpreadsheet className="text-green-500" size={20} />
                <span className="text-sm text-slate-700">Exportar Citas CSV</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Proximos Pasos</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Revisar leads sin contactar
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                Agendar citas de seguimiento
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Actualizar propiedades vendidas
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">KPIs Clave</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Tasa conversion</span>
                <span className="font-medium text-slate-900">
                  {stats?.leads.total ? ((stats.leads.won / stats.leads.total) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Citas completadas</span>
                <span className="font-medium text-slate-900">
                  {stats?.appointments.total ? ((stats.appointments.completed / stats.appointments.total) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Propiedades activas</span>
                <span className="font-medium text-slate-900">
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

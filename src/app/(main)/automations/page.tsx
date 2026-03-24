'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Plus, Bell, Clock, Mail, CheckCircle, XCircle,
  Calendar, Users, Building2, AlertCircle, ToggleLeft, ToggleRight,
  Zap, Trash2, X
} from 'lucide-react'

interface AutomationRule {
  id: string
  name: string
  description: string | null
  trigger_type: string
  action_type: string
  config: any
  is_active: boolean
  created_at: string
}

const TRIGGERS = [
  { value: 'appointment_reminder', label: 'Recordatorio de Cita', icon: Calendar, description: 'Se ejecuta antes de una cita' },
  { value: 'lead_followup', label: 'Seguimiento de Lead', icon: Users, description: 'Se ejecuta cuando un lead no es contactado' },
  { value: 'daily_summary', label: 'Resumen Diario', icon: Bell, description: 'Se ejecuta diariamente' },
  { value: 'weekly_report', label: 'Reporte Semanal', icon: CheckCircle, description: 'Se ejecuta cada semana' },
]

const ACTIONS = [
  { value: 'in_app_notification', label: 'Notificacion en App', icon: Bell },
  { value: 'email_notification', label: 'Email', icon: Mail },
  { value: 'create_task', label: 'Crear Tarea', icon: CheckCircle },
]

export default function AutomationsPage() {
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [userRole, setUserRole] = useState<string>('agent')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_type: 'daily_summary',
    action_type: 'in_app_notification',
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
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
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile) {
        setUserRole(profile.role)
      }

      if (['admin', 'coordinator'].includes(profile?.role)) {
        const response = await fetch('/api/automations')
        if (response.ok) {
          const data = await response.json()
          setRules(data.rules || [])
        }
      }
    } catch (error) {
      console.error('Error loading:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')

    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Error al crear automatizacion')
      } else {
        setRules([data.rule, ...rules])
        setShowCreateForm(false)
        setForm({ name: '', description: '', trigger_type: 'daily_summary', action_type: 'in_app_notification' })
      }
    } catch (err) {
      setError('Error de conexion')
    } finally {
      setCreating(false)
    }
  }

  const toggleRule = async (rule: AutomationRule) => {
    const newStatus = !rule.is_active
    
    try {
      const response = await fetch(`/api/automations/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      })

      if (response.ok) {
        setRules(rules.map(r => r.id === rule.id ? { ...r, is_active: newStatus } : r))
      }
    } catch (err) {
      console.error('Error toggling rule:', err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta automatizacion?')) return
    setDeleting(id)

    try {
      const response = await fetch(`/api/automations/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setRules(rules.filter(r => r.id !== id))
      }
    } catch (err) {
      console.error('Error deleting rule:', err)
    } finally {
      setDeleting(null)
    }
  }

  const getTriggerIcon = (triggerType: string) => {
    const trigger = TRIGGERS.find(t => t.value === triggerType)
    const Icon = trigger?.icon || Zap
    return <Icon size={20} className="text-blue-500" />
  }

  const getActionIcon = (actionType: string) => {
    const action = ACTIONS.find(a => a.value === actionType)
    const Icon = action?.icon || Bell
    return <Icon size={16} className="text-slate-500" />
  }

  const getTriggerLabel = (triggerType: string) => {
    return TRIGGERS.find(t => t.value === triggerType)?.label || triggerType
  }

  const getActionLabel = (actionType: string) => {
    return ACTIONS.find(a => a.value === actionType)?.label || actionType
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando...</div>
      </div>
    )
  }

  const canManage = ['admin', 'coordinator'].includes(userRole)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft size={20} />
            </Link>
            <span className="text-slate-900 font-medium">Automations</span>
          </div>
          {canManage && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
            >
              <Plus size={18} />
              Nueva Automatizacion
            </button>
          )}
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        {!canManage ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin permisos</h3>
            <p className="text-slate-500">Solo administradores y coordinadores pueden gestionar automatizaciones.</p>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 mb-6 text-white">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                  <Zap className="text-white" size={32} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Automatizaciones</h2>
                  <p className="text-white/80">
                    {rules.filter(r => r.is_active).length} de {rules.length} automatizaciones activas
                  </p>
                </div>
              </div>
            </div>

            {showCreateForm && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Nueva Automatizacion</h3>
                  <button onClick={() => setShowCreateForm(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={20} />
                  </button>
                </div>
                
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ej: Recordatorio de citas"
                      required
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descripcion</label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Descripcion opcional"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Disparador</label>
                      <select
                        value={form.trigger_type}
                        onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {TRIGGERS.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        {TRIGGERS.find(t => t.value === form.trigger_type)?.description}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Accion</label>
                      <select
                        value={form.action_type}
                        onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {ACTIONS.map(a => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-xl font-medium hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating ? 'Creando...' : 'Crear Automatizacion'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="space-y-4">
              {rules.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <Zap className="mx-auto text-slate-300 mb-4" size={48} />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin automatizaciones</h3>
                  <p className="text-slate-500 mb-4">Crea tu primera automatizacion para optimizar tu flujo de trabajo.</p>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
                  >
                    Crear Automatizacion
                  </button>
                </div>
              ) : (
                rules.map(rule => (
                  <div key={rule.id} className={`bg-white rounded-xl border p-4 ${rule.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => toggleRule(rule)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {rule.is_active ? (
                            <ToggleRight size={32} className="text-green-500" />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            {getTriggerIcon(rule.trigger_type)}
                            <h4 className="font-medium text-slate-900">{rule.name}</h4>
                          </div>
                          {rule.description && (
                            <p className="text-sm text-slate-500 mt-1">{rule.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {getTriggerLabel(rule.trigger_type)}
                            </span>
                            <span>→</span>
                            <span className="flex items-center gap-1">
                              {getActionIcon(rule.action_type)}
                              {getActionLabel(rule.action_type)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                          rule.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {rule.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          disabled={deleting === rule.id}
                          className="p-2 text-slate-400 hover:text-red-500 transition disabled:opacity-50"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-8 bg-slate-50 rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Tipos de Disparadores Disponibles</h3>
              <div className="grid grid-cols-2 gap-4">
                {TRIGGERS.map(trigger => {
                  const Icon = trigger.icon
                  return (
                    <div key={trigger.value} className="flex items-start gap-3 p-3 bg-white rounded-lg">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="text-blue-500" size={20} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{trigger.label}</p>
                        <p className="text-xs text-slate-500">{trigger.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

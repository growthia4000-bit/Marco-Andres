'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Users, Plus, Mail, Shield, Crown, UserPlus, Copy, Check, X, Clock, Loader2 } from 'lucide-react'

interface Invitation {
  id: string
  email: string
  role: string
  status: string
  expires_at: string
  created_at: string
  invited_by?: { full_name: string; email: string }
}

interface TeamMember {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

export default function TeamPage() {
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('agent')
  const [tenantName, setTenantName] = useState<string>('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('agent')
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [showInvitations, setShowInvitations] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviting, setInviting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
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
      setCurrentUser(user)

      const { data: profile } = await supabase
        .from('users')
        .select('id, tenant_id, role')
        .eq('id', user.id)
        .single()

      if (profile) {
        setCurrentUserRole(profile.role)

        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', profile.tenant_id)
          .single()
        
        if (tenant) {
          setTenantName(tenant.name)
        }

        const { data: members } = await supabase
          .from('users')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .order('created_at')
        
        setTeamMembers(members || [])

        if (profile.role === 'admin') {
          const res = await fetch('/api/invitations')
          if (res.ok) {
            const data = await res.json()
            setInvitations(data.invitations || [])
          }
        }
      }
    } catch (error) {
      console.error('Error loading:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    setInviting(true)

    if (!inviteEmail.trim()) {
      setInviteError('El email es requerido')
      setInviting(false)
      return
    }

    if (!inviteEmail.includes('@')) {
      setInviteError('Email inválido')
      setInviting(false)
      return
    }

    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })

      const data = await response.json()

      if (!response.ok) {
        setInviteError(data.error || 'Error al enviar invitación')
      } else {
        setInviteSuccess(`Invitación enviada. Copia el enlace para compartir: ${data.inviteUrl}`)
        setInviteEmail('')
        setShowInviteForm(false)
        loadData()
      }
    } catch (err) {
      setInviteError('Error de conexión')
    } finally {
      setInviting(false)
    }
  }

  const copyInviteLink = async (inviteUrl: string, id: string) => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const cancelInvitation = async (id: string) => {
    if (!confirm('¿Cancelar esta invitación?')) return
    setDeletingId(id)

    try {
      const response = await fetch(`/api/invitations?id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        loadData()
      }
    } catch (err) {
      console.error('Error cancelling invitation:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown size={16} className="text-amber-500" />
      case 'coordinator': return <Shield size={16} className="text-blue-500" />
      default: return <Users size={16} className="text-slate-400" />
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrador'
      case 'coordinator': return 'Coordinador'
      case 'agent': return 'Agente'
      default: return role
    }
  }

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-amber-100 text-amber-700'
      case 'coordinator': return 'bg-blue-100 text-blue-700'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'accepted': return 'bg-green-100 text-green-700'
      case 'expired': return 'bg-red-100 text-red-700'
      case 'cancelled': return 'bg-slate-100 text-slate-500'
      default: return 'bg-slate-100 text-slate-600'
    }
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
              Dashboard
            </Link>
            <span className="text-slate-400">/</span>
            <span className="text-slate-900 font-medium">Equipo</span>
          </div>
          {currentUserRole === 'admin' && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowInvitations(!showInvitations)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition"
              >
                <Mail size={18} />
                Invitaciones ({invitations.length})
              </button>
              <button
                onClick={() => setShowInviteForm(!showInviteForm)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
              >
                <UserPlus size={18} />
                Invitar Miembro
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="p-6">
        {showInviteForm && currentUserRole === 'admin' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Invitar nuevo miembro</h3>
            <form onSubmit={handleInvite} className="flex gap-4">
              <div className="flex-1">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="agent">Agente</option>
                <option value="coordinator">Coordinador</option>
                <option value="admin">Administrador</option>
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="px-6 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-2"
              >
                {inviting ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                {inviting ? 'Enviando...' : 'Invitar'}
              </button>
            </form>
            {inviteError && <p className="text-red-500 text-sm mt-2">{inviteError}</p>}
            {inviteSuccess && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-green-700 text-sm mb-2">{inviteSuccess}</p>
              </div>
            )}
          </div>
        )}

        {showInvitations && currentUserRole === 'admin' && invitations.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Invitaciones Pendientes</h3>
            <div className="space-y-3">
              {invitations.map(inv => {
                const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?invite=${inv.id}`
                const isCopied = copiedId === inv.id
                const isDeleting = deletingId === inv.id
                
                return (
                  <div key={inv.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium text-slate-900">{inv.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeClass(inv.role)}`}>
                            {getRoleLabel(inv.role)}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(inv.status)}`}>
                            {inv.status === 'pending' ? 'Pendiente' : inv.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyInviteLink(inviteUrl, inv.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-100 transition"
                      >
                        {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        {isCopied ? 'Copiado' : 'Copiar enlace'}
                      </button>
                      {inv.status === 'pending' && (
                        <button
                          onClick={() => cancelInvitation(inv.id)}
                          disabled={isDeleting}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Total Miembros</p>
            <p className="text-2xl font-bold text-slate-900">{teamMembers.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Activos</p>
            <p className="text-2xl font-bold text-green-600">{teamMembers.filter(m => m.is_active).length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Admins</p>
            <p className="text-2xl font-bold text-amber-600">{teamMembers.filter(m => m.role === 'admin').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-slate-500 text-sm">Agentes</p>
            <p className="text-2xl font-bold text-blue-600">{teamMembers.filter(m => m.role === 'agent').length}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Miembros del Equipo</h3>
          </div>
          {teamMembers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="mx-auto text-slate-300 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Sin miembros</h3>
              <p className="text-slate-500">Tu equipo aparecerá aquí cuando invites miembros.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {teamMembers.map(member => (
                <div key={member.id} className="p-4 flex items-center gap-4 hover:bg-slate-50">
                  <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center">
                    <span className="text-slate-600 font-medium">
                      {member.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || member.email[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      {member.full_name || 'Sin nombre'}
                      {member.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-slate-400">(tú)</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 flex items-center gap-1">
                      <Mail size={12} />
                      {member.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleIcon(member.role)}
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getRoleBadgeClass(member.role)}`}>
                      {getRoleLabel(member.role)}
                    </span>
                  </div>
                  {!member.is_active && (
                    <span className="px-2 py-1 bg-red-100 text-red-600 rounded-lg text-xs font-medium">
                      Inactivo
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, UserPlus, CheckCircle, AlertCircle, Building2 } from 'lucide-react'

interface InviteInfo {
  email: string
  role: string
  tenant_name: string
  tenant_id: string
}

function SignupForm() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [inviteLoading, setInviteLoading] = useState(true)
  const [invalidInvite, setInvalidInvite] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const checkInvite = async () => {
      const inviteToken = searchParams.get('invite')
      
      if (!inviteToken) {
        setInviteLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/invitations/verify?token=${inviteToken}`)
        const data = await response.json()

        if (response.ok && data.invitation) {
          setInviteInfo({
            email: data.invitation.email,
            role: data.invitation.role,
            tenant_name: data.tenant_name,
            tenant_id: data.invitation.tenant_id,
          })
          setEmail(data.invitation.email)
        } else {
          setInvalidInvite(true)
          setError(data.error || 'Invitation not found or expired')
        }
      } catch (err) {
        setInvalidInvite(true)
        setError('Failed to verify invitation')
      } finally {
        setInviteLoading(false)
      }
    }

    checkInvite()
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      setLoading(false)
      return
    }

    if (inviteInfo) {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signUp({
        email: inviteInfo.email,
        password,
        options: {
          data: {
            full_name: fullName,
            invite_token: searchParams.get('invite'),
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .update({
            full_name: fullName,
            tenant_id: inviteInfo.tenant_id,
            role: inviteInfo.role,
            is_active: true,
          })
          .eq('id', data.user.id)

        if (profileError) {
          setError('Error al configurar tu perfil')
          setLoading(false)
          return
        }

        await supabase
          .from('invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('token', searchParams.get('invite'))

        router.push('/dashboard')
        router.refresh()
      }
    } else {
      if (!tenantName.trim()) {
        setError('El nombre de la inmobiliaria es requerido')
        setLoading(false)
        return
      }

      const supabase = createClient()
      const tenantSlug = tenantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            tenant_name: tenantName,
            tenant_slug: tenantSlug,
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (data.user && !data.session) {
        setSuccess(true)
        setConfirmEmail(email)
        setLoading(false)
        return
      }

      if (data.session) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, tenant_id')
          .eq('id', data.user?.id)
          .single()

        if (!profile?.tenant_id) {
          setError('Error al crear la inmobiliaria. Por favor contacta a soporte.')
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        router.push('/dashboard')
        router.refresh()
      }
    }

    setLoading(false)
  }

  if (inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500">Verificando invitación...</div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-green-500" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Cuenta creada!</h2>
          <p className="text-slate-500 mb-4">
            Hemos enviado un enlace de confirmacion a:
          </p>
          <p className="font-medium text-slate-900 mb-6">{confirmEmail}</p>
          <p className="text-slate-500 text-sm">
            Revisa tu correo y confirma tu cuenta para comenzar.
          </p>
          <Link
            href="/login"
            className="inline-block mt-6 px-6 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition"
          >
            Ir al Login
          </Link>
        </div>
      </div>
    )
  }

  const isInviteMode = !!inviteInfo && !invalidInvite

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">I</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">InmoCRM</h1>
          <p className="text-slate-500 mt-1">CRM Inmobiliario Multi-Agente</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {isInviteMode ? (
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 className="text-blue-500" size={28} />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">Únete a {inviteInfo.tenant_name}</h2>
                <p className="text-slate-500 mt-2">
                  Has sido invitado como <span className="font-medium capitalize">{inviteInfo.role}</span>
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Tu Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Juan Garcia"
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={inviteInfo.email}
                    disabled
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                    <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="animate-spin">...</span>
                  ) : (
                    <>
                      <UserPlus size={20} />
                      Unirse al Equipo
                    </>
                  )}
                </button>
              </form>
            </>
          ) : invalidInvite ? (
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="text-red-500" size={28} />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">Invitación inválida</h2>
                <p className="text-slate-500 mt-2">{error}</p>
              </div>
              <Link
                href="/signup"
                className="block w-full text-center bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition"
              >
                Crear cuenta propia
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Crear Cuenta</h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nombre de tu Inmobiliaria
                  </label>
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Inmobiliaria XYZ"
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Tu Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Juan Garcia"
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                    <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="animate-spin">...</span>
                  ) : (
                    <>
                      <UserPlus size={20} />
                      Crear Cuenta
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {!isInviteMode && !invalidInvite && (
            <p className="text-center text-slate-500 mt-6">
              Ya tienes cuenta?{' '}
              <Link href="/login" className="text-blue-500 font-medium hover:underline">
                Inicia Sesión
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500">Cargando...</div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  )
}

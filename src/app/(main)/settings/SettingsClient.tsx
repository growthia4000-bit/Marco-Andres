'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/I18nProvider'
import {
  User, Lock, Languages, Bell, ArrowLeft, Save, Check, Eye, EyeOff,
  Settings, Loader2, AlertCircle,
} from 'lucide-react'

type Section = 'profile' | 'password' | 'language' | 'notifications'

const SECTIONS: { id: Section; icon: React.ElementType; label: string; color: string; bg: string }[] = [
  { id: 'profile',       icon: User,      label: 'Perfil',           color: 'text-blue-600',   bg: 'bg-blue-50' },
  { id: 'password',      icon: Lock,      label: 'Contraseña',       color: 'text-amber-600',  bg: 'bg-amber-50' },
  { id: 'language',      icon: Languages, label: 'Idioma',           color: 'text-violet-600', bg: 'bg-violet-50' },
  { id: 'notifications', icon: Bell,      label: 'Notificaciones',   color: 'text-emerald-600',bg: 'bg-emerald-50' },
]

const LANG_LABELS: Record<string, string> = { es: 'Español', en: 'English', it: 'Italiano' }

export default function SettingsClient() {
  const supabase = createClient()
  const router   = useRouter()
  const { t, locale, locales, setLocale } = useI18n()

  const [activeSection, setActiveSection] = useState<Section>('profile')
  const [loading, setLoading] = useState(true)

  // user data
  const [user, setUser]       = useState<any>(null)
  const [email, setEmail]     = useState('')
  const [role, setRole]       = useState('')
  const [tenantName, setTenantName] = useState('')

  // profile form
  const [fullName, setFullName]           = useState('')
  const [savedFullName, setSavedFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError]   = useState('')

  // password form
  const [newPassword, setNewPassword]       = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew]               = useState(false)
  const [showConfirm, setShowConfirm]       = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError]   = useState('')

  // notifications
  const [notifEmail, setNotifEmail]               = useState(true)
  const [notifLeads, setNotifLeads]               = useState(true)
  const [notifAppointments, setNotifAppointments] = useState(true)
  const [notifTasks, setNotifTasks]               = useState(false)
  const [savingNotifs, setSavingNotifs]           = useState(false)
  const [notifsSuccess, setNotifsSuccess]         = useState(false)

  useEffect(() => { loadUser() }, [])

  async function loadUser() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { router.push('/login'); return }

    setUser(authUser)
    setEmail(authUser.email || '')

    const meta = authUser.user_metadata || {}
    setNotifEmail(meta.notif_email ?? true)
    setNotifLeads(meta.notif_leads ?? true)
    setNotifAppointments(meta.notif_appointments ?? true)
    setNotifTasks(meta.notif_tasks ?? false)

    const { data: profile } = await supabase
      .from('users')
      .select('full_name, role, tenant_id')
      .eq('id', authUser.id)
      .single()

    const name = profile?.full_name || ''
    setFullName(name)
    setSavedFullName(name)
    setRole(profile?.role || '')

    if (profile?.tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', profile.tenant_id)
        .single()
      setTenantName(tenant?.name || '')
    }

    setLoading(false)
  }

  async function handleSaveProfile() {
    if (!fullName.trim()) return
    setSavingProfile(true)
    setProfileError('')

    const { error } = await supabase
      .from('users')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id)

    setSavingProfile(false)
    if (error) { setProfileError(error.message); return }

    setSavedFullName(fullName.trim())
    setProfileSuccess(true)
    setTimeout(() => setProfileSuccess(false), 3000)
  }

  async function handleSavePassword() {
    setPasswordError('')
    if (newPassword.length < 6) { setPasswordError('La contraseña debe tener al menos 6 caracteres'); return }
    if (newPassword !== confirmPassword)  { setPasswordError('Las contraseñas no coinciden'); return }

    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)

    if (error) { setPasswordError(error.message); return }

    setPasswordSuccess(true)
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setPasswordSuccess(false), 3000)
  }

  async function handleSaveNotifications() {
    setSavingNotifs(true)
    await supabase.auth.updateUser({
      data: {
        notif_email:        notifEmail,
        notif_leads:        notifLeads,
        notif_appointments: notifAppointments,
        notif_tasks:        notifTasks,
      },
    })
    setSavingNotifs(false)
    setNotifsSuccess(true)
    setTimeout(() => setNotifsSuccess(false), 3000)
  }

  const initials = savedFullName
    ? savedFullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : email.slice(0, 2).toUpperCase() || '?'

  const inputCls =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/60 disabled:bg-slate-50 disabled:text-slate-400'

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">

        {/* ── Header ── */}
        <header className="rounded-[34px] border border-slate-200/70 bg-white/92 p-5 shadow-[0_20px_55px_-42px_rgba(15,23,42,0.22)] backdrop-blur lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-gradient-to-br from-blue-500 via-sky-400 to-cyan-300 text-white shadow-lg shadow-sky-400/15">
                <Settings size={28} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">GROWTHIA GLOBAL CRM</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Configuración</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                  Gestiona tu perfil, seguridad y preferencias de la plataforma
                </p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 xl:self-auto"
            >
              <ArrowLeft size={15} />
              Volver al Dashboard
            </Link>
          </div>
        </header>

        {/* ── Body: nav + content ── */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">

          {/* Sidebar nav */}
          <nav className="flex gap-1.5 overflow-x-auto rounded-[26px] border border-slate-200/80 bg-white p-2 shadow-sm lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible">
            {SECTIONS.map(({ id, icon: Icon, label, color, bg }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                  activeSection === id
                    ? 'border border-slate-100 bg-slate-50 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${activeSection === id ? bg : 'bg-slate-100'}`}>
                  <Icon size={15} className={activeSection === id ? color : 'text-slate-400'} />
                </span>
                {label}
              </button>
            ))}
          </nav>

          {/* Content panel */}
          <div className="min-w-0 flex-1">

            {/* ── PERFIL ── */}
            {activeSection === 'profile' && (
              <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
                    <User size={18} className="text-blue-600" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Perfil de usuario</h2>
                    <p className="text-xs text-slate-500">Información personal y datos de cuenta</p>
                  </div>
                </div>

                {/* Avatar + identity */}
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-blue-500 via-sky-400 to-cyan-300 text-xl font-semibold text-white shadow-md shadow-sky-400/15">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{savedFullName || 'Sin nombre'}</p>
                    <p className="text-xs text-slate-500">{email}</p>
                    {role && (
                      <span className="mt-1.5 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                        {role}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex max-w-lg flex-col gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Nombre completo</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Tu nombre completo"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Correo electrónico</label>
                    <input type="email" value={email} disabled className={inputCls} />
                    <p className="mt-1.5 text-xs text-slate-400">El correo electrónico no puede modificarse desde aquí</p>
                  </div>
                  {tenantName && (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Organización</label>
                      <input type="text" value={tenantName} disabled className={inputCls} />
                    </div>
                  )}

                  {profileError && (
                    <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      <AlertCircle size={15} />
                      {profileError}
                    </div>
                  )}

                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile || !fullName.trim() || fullName.trim() === savedFullName}
                    className="inline-flex items-center gap-2 self-start rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingProfile
                      ? <Loader2 size={15} className="animate-spin" />
                      : profileSuccess ? <Check size={15} /> : <Save size={15} />}
                    {profileSuccess ? 'Guardado' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            )}

            {/* ── CONTRASEÑA ── */}
            {activeSection === 'password' && (
              <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50">
                    <Lock size={18} className="text-amber-600" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Cambiar contraseña</h2>
                    <p className="text-xs text-slate-500">Actualiza tu contraseña de acceso a la plataforma</p>
                  </div>
                </div>

                <div className="flex max-w-lg flex-col gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Nueva contraseña</label>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className={`${inputCls} pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                      >
                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirmar contraseña</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repite la contraseña"
                        className={`${inputCls} pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                      >
                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Hints */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500 space-y-1">
                    <p className={newPassword.length >= 6 ? 'text-emerald-600 font-medium' : ''}>
                      {newPassword.length >= 6 ? '+ ' : '· '}Mínimo 6 caracteres
                    </p>
                    <p className={newPassword === confirmPassword && confirmPassword.length > 0 ? 'text-emerald-600 font-medium' : ''}>
                      {newPassword === confirmPassword && confirmPassword.length > 0 ? '+ ' : '· '}Las contraseñas coinciden
                    </p>
                  </div>

                  {passwordError && (
                    <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      <AlertCircle size={15} />
                      {passwordError}
                    </div>
                  )}

                  <button
                    onClick={handleSavePassword}
                    disabled={savingPassword || !newPassword || !confirmPassword}
                    className="inline-flex items-center gap-2 self-start rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingPassword
                      ? <Loader2 size={15} className="animate-spin" />
                      : passwordSuccess ? <Check size={15} /> : <Lock size={15} />}
                    {passwordSuccess ? 'Contraseña actualizada' : 'Actualizar contraseña'}
                  </button>
                </div>
              </div>
            )}

            {/* ── IDIOMA ── */}
            {activeSection === 'language' && (
              <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50">
                    <Languages size={18} className="text-violet-600" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Idioma de la interfaz</h2>
                    <p className="text-xs text-slate-500">Elige el idioma en que se muestra la plataforma</p>
                  </div>
                </div>

                <div className="flex max-w-lg flex-col gap-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {locales.map(loc => {
                      const active = locale === loc
                      return (
                        <button
                          key={loc}
                          onClick={() => setLocale(loc as typeof locales[number])}
                          className={`flex flex-col items-center gap-3 rounded-[20px] border p-5 text-sm font-medium transition ${
                            active
                              ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? 'bg-blue-100' : 'bg-slate-100'}`}>
                            <Languages size={18} className={active ? 'text-blue-600' : 'text-slate-400'} />
                          </span>
                          <span>{LANG_LABELS[loc] ?? loc.toUpperCase()}</span>
                          {active && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                              <Check size={11} />
                              Activo
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-slate-400">
                    El cambio de idioma se aplica inmediatamente en toda la plataforma
                  </p>
                </div>
              </div>
            )}

            {/* ── NOTIFICACIONES ── */}
            {activeSection === 'notifications' && (
              <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50">
                    <Bell size={18} className="text-emerald-600" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Preferencias de notificaciones</h2>
                    <p className="text-xs text-slate-500">Controla qué notificaciones quieres recibir</p>
                  </div>
                </div>

                <div className="flex max-w-lg flex-col gap-3">
                  {([
                    {
                      label: 'Notificaciones por email',
                      desc:  'Recibe resúmenes y alertas importantes en tu correo',
                      value: notifEmail,
                      set:   setNotifEmail,
                    },
                    {
                      label: 'Nuevos leads',
                      desc:  'Alerta cuando se registra un nuevo lead en el sistema',
                      value: notifLeads,
                      set:   setNotifLeads,
                    },
                    {
                      label: 'Recordatorios de citas',
                      desc:  'Avisos antes de citas programadas',
                      value: notifAppointments,
                      set:   setNotifAppointments,
                    },
                    {
                      label: 'Tareas pendientes',
                      desc:  'Recordatorios de tareas asignadas o próximas a vencer',
                      value: notifTasks,
                      set:   setNotifTasks,
                    },
                  ] as const).map(({ label, desc, value, set }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-[20px] border border-slate-100 bg-slate-50/60 px-5 py-4"
                    >
                      <div className="mr-4">
                        <p className="text-sm font-medium text-slate-900">{label}</p>
                        <p className="text-xs text-slate-500">{desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => (set as (v: boolean) => void)(!value)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                          value ? 'bg-blue-500' : 'bg-slate-200'
                        }`}
                        aria-pressed={value}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                            value ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={handleSaveNotifications}
                    disabled={savingNotifs}
                    className="mt-2 inline-flex items-center gap-2 self-start rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingNotifs
                      ? <Loader2 size={15} className="animate-spin" />
                      : notifsSuccess ? <Check size={15} /> : <Save size={15} />}
                    {notifsSuccess ? 'Guardado' : 'Guardar preferencias'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

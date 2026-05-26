'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle, AlertCircle, Loader2, Mail } from 'lucide-react'

type State = 'loading' | 'success' | 'error'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [state, setState] = useState<State>('loading')
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!sessionId) {
      setState('error')
      setErrorMessage('No se encontró la sesión de pago.')
      return
    }

    const completeRegistration = async () => {
      try {
        const res = await fetch(`/api/stripe/complete-registration?session_id=${encodeURIComponent(sessionId)}`)
        const data = await res.json()

        if (!res.ok) {
          if (data.errorCode === 'email_exists') {
            setErrorMessage('Ya existe una cuenta con este email. Por favor inicia sesión.')
          } else if (data.errorCode === 'payment_not_completed') {
            setErrorMessage('El pago no se ha completado. Por favor intenta de nuevo.')
          } else {
            setErrorMessage(data.error || 'Error al activar tu cuenta.')
          }
          setState('error')
          return
        }

        setEmail(data.email || '')
        setState('success')
      } catch {
        setErrorMessage('Error de conexión. Contacta a soporte si el problema persiste.')
        setState('error')
      }
    }

    completeRegistration()
  }, [sessionId])

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <Image
        src="/design/auth-hero-real-estate-duo.png"
        alt="Real estate"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[72%_center]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,250,252,0.97)_0%,rgba(248,250,252,0.93)_28%,rgba(248,250,252,0.72)_44%,rgba(248,250,252,0.34)_58%,rgba(15,23,42,0.10)_100%)]" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 text-center">
            <span className="text-xl font-bold tracking-tight text-slate-950">InmoCRM</span>
          </div>

          <div className="rounded-[30px] border border-white/70 bg-white/90 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl text-center">
            {state === 'loading' && (
              <>
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                  <Loader2 size={32} className="animate-spin text-blue-600" />
                </div>
                <h2 className="mb-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Activando tu cuenta...
                </h2>
                <p className="text-sm leading-6 text-slate-500">
                  Estamos configurando tu inmobiliaria. Esto solo tardará un momento.
                </p>
              </>
            )}

            {state === 'success' && (
              <>
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle size={32} className="text-emerald-600" />
                </div>
                <h2 className="mb-2 text-2xl font-semibold tracking-tight text-slate-950">
                  ¡Cuenta creada con éxito!
                </h2>
                <p className="mb-5 text-sm leading-6 text-slate-500">
                  Hemos enviado un enlace de acceso a tu email para que puedas entrar sin contraseña.
                </p>

                {email && (
                  <div className="mb-5 flex items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <Mail size={18} className="text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-900">{email}</span>
                  </div>
                )}

                <p className="mb-6 text-xs leading-5 text-slate-400">
                  Revisa tu bandeja de entrada (y la carpeta de spam). El enlace caduca en 1 hora.
                </p>

                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-3.5 font-semibold text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-900"
                >
                  Ir al inicio de sesión
                </Link>
              </>
            )}

            {state === 'error' && (
              <>
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <AlertCircle size={32} className="text-red-600" />
                </div>
                <h2 className="mb-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Algo salió mal
                </h2>
                <p className="mb-5 text-sm leading-6 text-slate-500">{errorMessage}</p>

                <div className="flex flex-col gap-3">
                  <Link
                    href="/register"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-3.5 font-semibold text-white shadow transition hover:bg-slate-900"
                  >
                    Intentar de nuevo
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Ir al login
                  </Link>
                </div>
              </>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            ¿Tienes problemas?{' '}
            <a href="mailto:soporte@growthia.com" className="font-medium hover:underline">
              Contacta con soporte
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function RegisterSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 size={32} className="animate-spin text-white" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}

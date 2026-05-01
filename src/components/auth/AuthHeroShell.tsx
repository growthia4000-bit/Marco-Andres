'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import { useI18n } from '@/i18n/I18nProvider'

interface AuthHeroShellProps {
  eyebrow: string
  title: string
  description: string
  panelTitle: string
  panelDescription?: string
  children: ReactNode
}

export default function AuthHeroShell({
  eyebrow,
  title,
  description,
  panelTitle,
  panelDescription,
  children,
}: AuthHeroShellProps) {
  const { t } = useI18n()

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <Image
        src="/design/auth-hero-real-estate-duo.png"
        alt="Professional real estate team"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[72%_center]"
      />

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,250,252,0.97)_0%,rgba(248,250,252,0.93)_28%,rgba(248,250,252,0.72)_44%,rgba(248,250,252,0.34)_58%,rgba(15,23,42,0.10)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.62),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(15,23,42,0.04)_100%)]" />

      <div className="relative z-10 flex min-h-screen flex-col px-6 pb-3 pt-14 sm:px-8 sm:pt-16 lg:px-10 lg:pb-4 lg:pt-16 xl:px-14 xl:pt-18">
        <div className="mx-auto flex w-full max-w-7xl flex-1 items-start lg:items-center">
          <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-8 xl:grid-cols-[minmax(0,580px)_1fr] xl:gap-12">
            <div className="flex flex-col justify-center lg:py-0 xl:py-2">
              <div className="mb-3.5 max-w-[34rem] xl:mb-4">
                <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 backdrop-blur-sm">
                  {eyebrow}
                </div>
                <h1 className="mt-3 max-w-[15ch] text-balance text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:max-w-[18ch] sm:text-[2.75rem] sm:leading-[1.04] lg:max-w-none lg:text-[2.9rem] lg:leading-[1.03] xl:text-[3.02rem] xl:leading-[1.02]">
                  {title}
                </h1>
                <p className="mt-2 max-w-[29rem] text-[15px] leading-6 text-slate-600 sm:text-base sm:leading-7 xl:mt-2.5 xl:max-w-[30rem]">
                  {description}
                </p>
              </div>

              <div className="w-full max-w-xl rounded-[30px] border border-white/70 bg-white/86 p-4.5 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-5">
                <div className="mb-3.5 border-b border-slate-200/70 pb-2.5">
                  <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">{panelTitle}</h2>
                  {panelDescription && (
                    <p className="mt-1 text-sm leading-6 text-slate-500">{panelDescription}</p>
                  )}
                </div>

                {children}
              </div>

              <footer className="mt-3 flex flex-col gap-1 text-xs text-slate-500 sm:mt-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-1 xl:mt-3 xl:flex-nowrap">
                <p className="whitespace-nowrap">© 2026 Growthia Global. {t('auth.footer.rightsReserved')}</p>
                <p className="text-slate-400 sm:text-right xl:whitespace-nowrap">{t('auth.footer.secureAccess')}</p>
              </footer>
            </div>

            <div className="hidden lg:block" />
          </div>
        </div>
      </div>
    </div>
  )
}

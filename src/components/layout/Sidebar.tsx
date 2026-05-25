'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, TrendingUp, Calendar, MessageSquareText,
  BarChart3, Radio, Users, Settings, Menu, X,
} from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

// ─── Nav tree ────────────────────────────────────────────────────────────────
type NavItem = { href: string; icon: React.ElementType; labelKey: string }
const NAV_GROUPS: NavItem[][] = [
  [
    { href: '/dashboard',     icon: LayoutDashboard,   labelKey: 'nav.dashboard' },
  ],
  [
    { href: '/properties',    icon: Building2,         labelKey: 'nav.properties' },
    { href: '/leads',         icon: TrendingUp,        labelKey: 'nav.leads' },
    { href: '/appointments',  icon: Calendar,          labelKey: 'nav.appointments' },
    { href: '/conversations', icon: MessageSquareText, labelKey: 'nav.conversations' },
  ],
  [
    { href: '/reports',  icon: BarChart3, labelKey: 'nav.reports' },
    { href: '/channels', icon: Radio,     labelKey: 'nav.channels' },
  ],
  [
    { href: '/team',     icon: Users,    labelKey: 'nav.team' },
    { href: '/settings', icon: Settings, labelKey: 'nav.settings' },
  ],
]

// ─── Shared nav content ───────────────────────────────────────────────────────
function NavContent({ pathname, onNav }: { pathname: string; onNav?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Logo */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-blue-500 via-sky-400 to-cyan-300 text-white shadow-md shadow-sky-400/20">
          <Building2 size={17} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase leading-none tracking-[0.18em] text-sky-700">
            Growthia
          </p>
          <p className="mt-0.5 text-[10px] leading-tight text-slate-400">Global CRM</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            <div className="space-y-0.5">
              {group.map(({ href, icon: Icon, labelKey }) => {
                const active =
                  pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNav}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? 'border border-blue-100 bg-blue-50 text-blue-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon
                      size={16}
                      className={`shrink-0 ${active ? 'text-blue-500' : 'text-slate-400'}`}
                    />
                    <span className="truncate">{t(labelKey)}</span>
                  </Link>
                )
              })}
            </div>

            {/* Divider between groups */}
            {gi < NAV_GROUPS.length - 1 && (
              <div className="my-3 h-px bg-slate-100" />
            )}
          </div>
        ))}
      </nav>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const { t } = useI18n()

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      {/* ── Desktop sidebar (sticky) ── */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200/80 bg-white lg:flex">
        <NavContent pathname={pathname} />
      </aside>

      {/* ── Mobile: hamburger trigger ── */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label={t('nav.openMenu')}
        className="fixed left-4 top-[18px] z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 lg:hidden"
      >
        <Menu size={17} className="text-slate-600" />
      </button>

      {/* ── Mobile: backdrop ── */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* ── Mobile: drawer ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!mobileOpen}
      >
        {/* Close button */}
        <div className="flex shrink-0 items-center justify-end border-b border-slate-100 p-3">
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <X size={15} />
          </button>
        </div>

        <NavContent pathname={pathname} onNav={() => setMobileOpen(false)} />
      </aside>
    </>
  )
}

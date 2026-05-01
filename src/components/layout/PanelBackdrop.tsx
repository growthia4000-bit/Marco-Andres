'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'

const DASHBOARD_BG_SRC = '/design/dashboard-bg-clean.png'

type Variant = 'tenant' | 'team' | 'admin'

const variantClasses: Record<Variant, { image: string; overlay: string; accent: string }> = {
  tenant: {
    image: 'opacity-100 saturate-[1.04] brightness-[1.00] scale-[1.02]',
    overlay: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.30)_38%,rgba(255,255,255,0.38)_100%)]',
    accent: 'bg-[radial-gradient(circle_at_top_center,rgba(255,255,255,0.04),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.05),transparent_28%)]',
  },
  team: {
    image: 'opacity-[0.94] saturate-[1.02] brightness-[1.00] scale-[1.02]',
    overlay: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.30)_0%,rgba(255,255,255,0.38)_38%,rgba(255,255,255,0.48)_100%)]',
    accent: 'bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.04),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.04),transparent_28%)]',
  },
  admin: {
    image: 'opacity-[0.88] saturate-[0.98] brightness-[0.99] scale-[1.01]',
    overlay: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.40)_0%,rgba(255,255,255,0.48)_38%,rgba(255,255,255,0.58)_100%)]',
    accent: 'bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.03),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.03),transparent_24%)]',
  },
}

interface PanelBackdropProps {
  children: ReactNode
  variant: Variant
}

export default function PanelBackdrop({ children, variant }: PanelBackdropProps) {
  const classes = variantClasses[variant]

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src={DASHBOARD_BG_SRC}
          alt=""
          fill
          priority
          className={`object-cover object-top ${classes.image}`}
        />
        <div className={`absolute inset-0 ${classes.overlay}`} />
        <div className={`absolute inset-0 ${classes.accent}`} />
      </div>
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  )
}

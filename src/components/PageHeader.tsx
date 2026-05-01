'use client'

import Link from 'next/link'

type BreadcrumbItem = {
  label: string
  href?: string
}

type PageHeaderProps = {
  title: string
  breadcrumbs: BreadcrumbItem[]
  actions?: React.ReactNode
}

export function PageHeader({ title, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <nav className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-sm text-slate-500">
            {breadcrumbs.map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex items-center gap-2">
                {index > 0 ? <span className="text-slate-300">/</span> : null}
                {item.href ? (
                  <Link href={item.href} className="transition hover:text-slate-700">
                    {item.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-900">{item.label}</span>
                )}
              </div>
            ))}
          </nav>
          <h1 className="mt-2 truncate text-xl font-semibold text-slate-900">{title}</h1>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

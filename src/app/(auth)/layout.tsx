import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="px-6 pt-4">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  )
}

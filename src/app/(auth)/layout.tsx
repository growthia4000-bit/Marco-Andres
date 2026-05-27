import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen">
      <div className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  )
}

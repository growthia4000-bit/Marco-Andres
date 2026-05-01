'use client'

import { usePathname } from 'next/navigation'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'

interface ChatbotVisibilityGateProps {
  tenantSlug: string | null
}

export default function ChatbotVisibilityGate({ tenantSlug }: ChatbotVisibilityGateProps) {
  const pathname = usePathname()

  const allowedPaths = new Set(['/dashboard', '/admin'])

  if (!allowedPaths.has(pathname)) {
    return null
  }

  return <ChatbotWidget tenantSlug={tenantSlug} />
}
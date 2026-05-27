'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { MessageSquare, Send, X, Minimize2, Bot, UserCheck, AlertCircle, RotateCcw } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { createClient } from '@/lib/supabase/client'

interface ChatMessage {
  id: string
  text: string
  sender: 'visitor' | 'bot'
  type?: string
  timestamp: string
}

const WIDGET_WIDTH = 320
const WIDGET_HEIGHT = 448
const WIDGET_HEIGHT_MIN = 56
const STORAGE_KEY = 'chatbot_widget_position'

function loadPosition(): { x: number; y: number } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const pos = JSON.parse(stored)
      if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos
    }
  } catch { /* ignore */ }
  return null
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }))
  } catch { /* ignore */ }
}

function getAdminWelcome(locale: string) {
  if (locale === 'en') return 'I am your internal CRM support assistant. Ask me about operational steps, follow-ups, or how to move something inside the CRM.'
  if (locale === 'it') return 'Sono il tuo assistente interno di supporto CRM. Puoi chiedermi di passaggi operativi, follow-up o come gestire qualcosa dentro il CRM.'
  return 'Soy tu asistente interno de soporte CRM. Puedes preguntarme por pasos operativos, seguimientos o cómo gestionar algo dentro del CRM.'
}

function getAdminPlaceholder(locale: string) {
  if (locale === 'en') return 'Ask about CRM actions or internal support...'
  if (locale === 'it') return 'Chiedi di azioni CRM o supporto interno...'
  return 'Pregunta por acciones CRM o soporte interno...'
}

function getCloseChatLabel(locale: string) {
  if (locale === 'en') return 'Close chat'
  if (locale === 'it') return 'Chiudi chat'
  return 'Cerrar chat'
}

export default function ChatbotWidget({ tenantSlug }: { tenantSlug: string | null }) {
  const { t, locale } = useI18n()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  const handleCloseWidget = useCallback(() => {
    setShowResetConfirm(false)
    setIsMinimized(false)
    setIsOpen(false)
  }, [])

  const handleResetConversation = useCallback(() => {
    setMessages([])
    setSessionId(null)
    setEscalated(false)
    setShowResetConfirm(false)
    if (isMinimized) {
      setIsMinimized(false)
    }
  }, [isMinimized])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // SSR-safe position state
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPositionReady, setIsPositionReady] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const widgetRef = useRef<HTMLDivElement>(null)

  // Load saved position on mount (client only)
  useEffect(() => {
    const saved = loadPosition()
    const defaultPos = {
      x: window.innerWidth - WIDGET_WIDTH - 16,
      y: window.innerHeight - WIDGET_HEIGHT - 16,
    }
    setPosition(saved || defaultPos)
    setIsPositionReady(true)
  }, [tenantSlug])

  useEffect(() => {
    setSessionId(null)
    setMessages([])
    setEscalated(false)
  }, [tenantSlug, pathname])

  useEffect(() => {
    let cancelled = false

    async function loadUserRole() {
      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!userId) {
        if (!cancelled) setUserRole(null)
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('role, global_role')
        .eq('id', userId)
        .single()

      if (!cancelled) {
        setUserRole(profile?.global_role || profile?.role || null)
      }
    }

    void loadUserRole()

    return () => {
      cancelled = true
    }
  }, [supabase, tenantSlug, pathname])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const focusInput = useCallback(() => {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true })
      }, 0)
    })
  }, [])

  useEffect(() => {
    if (!isOpen || isMinimized || showResetConfirm || loading) return
    focusInput()
  }, [isOpen, isMinimized, showResetConfirm, loading, messages.length, focusInput])

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        text: pathname === '/admin' ? getAdminWelcome(locale) : t('conversations.chatbot.welcome'),
        sender: 'bot',
        timestamp: new Date().toISOString(),
      }])
    }
  }, [isOpen, messages.length, t, pathname, locale])

  const clampPosition = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y }
    const maxX = window.innerWidth - WIDGET_WIDTH
    const maxY = window.innerHeight - (isMinimized ? WIDGET_HEIGHT_MIN : WIDGET_HEIGHT)
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY)),
    }
  }, [isMinimized])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea')) return
    setIsDragging(true)
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newPos = clampPosition(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y)
      setPosition(newPos)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      savePosition(position.x, position.y)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, clampPosition, position])

  async function sendMessage() {
    if (!input.trim() || loading) return

    setEscalated(false)

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text: input.trim(),
      sender: 'visitor',
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    const currentInput = input.trim()
    setInput('')
    focusInput()
    setLoading(true)

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentInput,
          session_id: sessionId,
          tenant_slug: tenantSlug,
          locale,
          channel: pathname === '/admin' ? 'admin' : 'dashboard',
          screen_path: pathname,
          user_role: userRole,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'chatbot_request_failed')
      }

      if (data.session_id) setSessionId(data.session_id)

      setEscalated(data.reply_type === 'escalation')

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: data.reply || 'Lo siento, no pude procesar tu mensaje.',
        sender: 'bot',
        type: data.reply_type,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, botMsg])
    } catch {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: t('conversations.chatbot.error'),
        sender: 'bot',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  // SSR-safe: toggle button doesn't need window
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center transition"
      >
        <MessageSquare size={24} />
      </button>
    )
  }

  // Hide widget until position is loaded on client
  if (!isPositionReady) {
    return null
  }

  return (
    <div
      ref={widgetRef}
      className="fixed z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col select-none"
      style={{
        left: position.x,
        top: position.y,
        height: isMinimized ? WIDGET_HEIGHT_MIN : WIDGET_HEIGHT,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Header - draggable */}
      <div
        className="px-4 py-3 bg-blue-600 text-white rounded-t-2xl flex items-center justify-between"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex items-center gap-2">
          <Bot size={18} />
          <span className="font-medium text-sm">{t('conversations.chatbot.title')}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-blue-500 rounded" title={isMinimized ? 'Expandir' : 'Minimizar'}>
            <Minimize2 size={16} />
          </button>
          <button onClick={() => setShowResetConfirm(true)} className="p-1 hover:bg-blue-500 rounded" title="Reiniciar conversación">
            <RotateCcw size={16} />
          </button>
          <button
            onClick={handleCloseWidget}
            className="p-1 hover:bg-blue-500 rounded"
            title={getCloseChatLabel(locale)}
            aria-label={getCloseChatLabel(locale)}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {showResetConfirm && (
        <div className="absolute inset-0 bg-white/95 rounded-2xl flex items-center justify-center z-10 p-4">
          <div className="text-center space-y-3">
            <p className="text-sm font-medium text-slate-900">¿Reiniciar conversación?</p>
            <p className="text-xs text-slate-500">Se borrará todo el historial.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setShowResetConfirm(false)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={handleResetConversation} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Reiniciar</button>
            </div>
          </div>
        </div>
      )}

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'visitor' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  msg.sender === 'visitor'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-900'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.type === 'escalation' && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-600">
                      <UserCheck size={12} />
                      <span>{t('conversations.chatbot.escalated')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-500">
                  {t('conversations.chatbot.typing')}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-slate-200 bg-white rounded-b-2xl">
            {escalated && (
              <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-1">
                <AlertCircle size={12} />
                <span>{t('conversations.chatbot.waiting')}</span>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder={pathname === '/admin' ? getAdminPlaceholder(locale) : t('conversations.chatbot.placeholder')}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

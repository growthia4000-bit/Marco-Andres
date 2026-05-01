'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  Calendar,
  ChevronRight,
  CircleOff,
  FileText,
  GitBranch,
  LayoutGrid,
  Mail,
  MessageSquare,
  Phone,
  ScanSearch,
  ShieldCheck,
  Signal,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

type FlowStatus = 'validated' | 'implemented' | 'sandbox'
type Side = 'left' | 'right' | 'top' | 'bottom'

type Point = {
  x: number
  y: number
}

type DiagramNode = {
  id: string
  title: string
  subtitle: string
  status: FlowStatus
  icon: ReactNode
  x: number
  y: number
  href?: string
  hrefLabel?: string
}

type DiagramConnector = {
  from: string
  to: string
  dashed?: boolean
}

type ConnectorRouteConfig = {
  fromSide?: Side
  toSide?: Side
  stroke?: string
  via?: Point[]
}

type StageLane = {
  id: string
  title: string
  subtitle: string
  x: number
  width: number
  tone: string
}

const CANVAS_WIDTH = 1392
const CANVAS_HEIGHT = 560
const NODE_WIDTH = 88
const NODE_HEIGHT = 40
const PORT_OFFSET = 12

const INPUT_BUS_X = 164
const BRANCH_BUS_X = 540
const RESULT_BUS_X = 864
const FINAL_BUS_X = 1220

const BADGE_STYLES: Record<FlowStatus, string> = {
  validated: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  implemented: 'border-blue-200 bg-blue-50 text-blue-700',
  sandbox: 'border-amber-200 bg-amber-50 text-amber-700',
}

const CARD_STYLES: Record<FlowStatus, string> = {
  validated: 'border-l-emerald-400',
  implemented: 'border-l-blue-400',
  sandbox: 'border-l-amber-400',
}

function LegendBadge({ status, label }: { status: FlowStatus; label: string }) {
  return <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-medium leading-3 ${BADGE_STYLES[status]}`}>{label}</span>
}

function CompactStatusDot({ status, label }: { status: FlowStatus; label: string }) {
  return (
    <span
      className={`inline-flex h-2 w-2 rounded-full border ${status === 'validated' ? 'border-emerald-300 bg-emerald-400' : status === 'implemented' ? 'border-blue-300 bg-blue-400' : 'border-amber-300 bg-amber-400'}`}
      title={label}
      aria-label={label}
    />
  )
}

function getShortLabel(t: (key: string) => string, nodeId: string, fallback: string) {
  const key = `flowMap.shortLabels.${nodeId}`
  const translated = t(key)
  if (translated !== key) return translated
  return fallback
}

function getNodeBox(node: DiagramNode) {
  return {
    left: node.x,
    top: node.y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }
}

function getAnchorPoint(node: DiagramNode, side: Side) {
  const box = getNodeBox(node)
  if (side === 'left') return { x: box.left, y: box.top + box.height / 2 }
  if (side === 'right') return { x: box.left + box.width, y: box.top + box.height / 2 }
  if (side === 'top') return { x: box.left + box.width / 2, y: box.top }
  return { x: box.left + box.width / 2, y: box.top + box.height }
}

function movePoint(point: Point, side: Side, distance: number) {
  if (side === 'left') return { x: point.x - distance, y: point.y }
  if (side === 'right') return { x: point.x + distance, y: point.y }
  if (side === 'top') return { x: point.x, y: point.y - distance }
  return { x: point.x, y: point.y + distance }
}

function simplifyOrthogonalPoints(points: Point[]) {
  if (points.length <= 2) return points

  const simplified = [points[0]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = simplified[simplified.length - 1]
    const current = points[index]
    const next = points[index + 1]
    const sameX = prev.x === current.x && current.x === next.x
    const sameY = prev.y === current.y && current.y === next.y
    if (!sameX && !sameY) simplified.push(current)
  }
  simplified.push(points[points.length - 1])
  return simplified
}

function buildOrthogonalPath(points: Point[]) {
  if (points.length < 2) return ''

  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]
    const point = points[index]
    if (prev.x !== point.x && prev.y !== point.y) path += ` L ${point.x} ${prev.y}`
    path += ` L ${point.x} ${point.y}`
  }
  return path
}

function routeViaX(start: Point, end: Point, x: number) {
  return [
    { x, y: start.y },
    { x, y: end.y },
  ]
}

function routeViaY(start: Point, end: Point, y: number) {
  return [
    { x: start.x, y },
    { x: end.x, y },
  ]
}

function getConnectorVisual(connector: DiagramConnector): ConnectorRouteConfig {
  const key = `${connector.from}-${connector.to}`

  if (key.startsWith('routing-')) return { stroke: '#b45309' }
  if (key.endsWith('-crm-tasks-view') || key.endsWith('-appointments-view') || key.endsWith('-human-review') || key.endsWith('-reporting')) {
    return { stroke: '#7c3aed' }
  }
  if (connector.from === 'chatbot-web' || connector.from === 'email-inbound' || connector.from === 'whatsapp-inbound' || connector.from === 'internal') {
    return { stroke: connector.dashed ? '#94a3b8' : '#64748b' }
  }

  return { stroke: '#2563eb' }
}

function getConnectorRoute(connector: DiagramConnector, fromNode: DiagramNode, toNode: DiagramNode) {
  const key = `${connector.from}-${connector.to}`
  const visual = getConnectorVisual(connector)

  let fromSide: Side = 'right'
  let toSide: Side = 'left'

  if (key === 'reception-conversation' || key === 'conversation-context' || key === 'intent-signals' || key === 'signals-routing') {
    fromSide = 'bottom'
    toSide = 'top'
  }

  const startAnchor = getAnchorPoint(fromNode, fromSide)
  const endAnchor = getAnchorPoint(toNode, toSide)
  const start = movePoint(startAnchor, fromSide, PORT_OFFSET)
  const end = movePoint(endAnchor, toSide, PORT_OFFSET)

  let via: Point[]
  if (connector.to === 'reception') {
    via = routeViaX(start, end, INPUT_BUS_X)
  } else if (key === 'reception-conversation' || key === 'conversation-context' || key === 'intent-signals' || key === 'signals-routing') {
    via = routeViaY(start, end, Math.round((start.y + end.y) / 2))
  } else if (connector.from === 'routing') {
    via = routeViaX(start, end, BRANCH_BUS_X)
  } else if (
    connector.from === 'financing' ||
    connector.from === 'buyer' ||
    connector.from === 'seller' ||
    connector.from === 'human' ||
    connector.from === 'visit' ||
    connector.from === 'documentation' ||
    connector.from === 'pricing' ||
    connector.from === 'property-interest' ||
    connector.from === 'complaint' ||
    connector.from === 'unknown'
  ) {
    via = routeViaX(start, end, RESULT_BUS_X)
  } else if (
    connector.from === 'crm-task' ||
    connector.from === 'appointment' ||
    connector.from === 'human-escalation' ||
    connector.from === 'automatic-reply' ||
    connector.from === 'email-processing' ||
    connector.from === 'automation-events'
  ) {
    via = routeViaX(start, end, FINAL_BUS_X)
  } else {
    via = routeViaX(start, end, Math.round(start.x + Math.max(18, (end.x - start.x) / 2)))
  }

  const points = simplifyOrthogonalPoints([startAnchor, start, ...via, end, endAnchor])

  return {
    ...connector,
    path: buildOrthogonalPath(points),
    stroke: visual.stroke || (connector.dashed ? '#94a3b8' : '#64748b'),
  }
}

function FlowCard({ node, statusLabel, t }: { node: DiagramNode; statusLabel: string; t: (key: string) => string }) {
  const box = getNodeBox(node)
  const isClickable = Boolean(node.href)
  const className = [
    'group absolute flex flex-col justify-between rounded-[16px] border border-l-[2px] bg-white/98 px-2 py-1.5 transition',
    CARD_STYLES[node.status],
    isClickable
      ? 'cursor-pointer border-slate-200 shadow-[0_4px_12px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_16px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2'
      : 'cursor-default border-slate-200/80 shadow-[0_2px_8px_rgba(15,23,42,0.04)]',
  ].join(' ')

  const style = {
    left: box.left,
    top: box.top,
    width: box.width,
    minHeight: box.height,
  }

  const content = (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1.5">
          <span className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-md border text-slate-600 [&_svg]:size-[11px] ${isClickable ? 'border-slate-200 bg-slate-50' : 'border-slate-200/70 bg-slate-50/70'}`}>
            {node.icon}
          </span>
          <div className="flex items-center gap-1">
            <CompactStatusDot status={node.status} label={statusLabel} />
            {isClickable ? <ArrowUpRight size={8} className="text-slate-400 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" /> : null}
          </div>
        </div>
        <div className="min-w-0">
          <h3 className={`truncate text-[9px] font-semibold leading-3 ${isClickable ? 'text-slate-900' : 'text-slate-800'}`} title={node.title}>
            {getShortLabel(t, node.id, node.title)}
          </h3>
        </div>
      </div>
    </>
  )

  if (node.href) {
    return (
      <Link href={node.href} className={className} style={style} aria-label={`${node.title}: ${node.hrefLabel || node.href}`} title={`${node.title}

${node.subtitle}

Estado: ${statusLabel}
Destino: ${node.hrefLabel || node.href}`}>
        {content}
      </Link>
    )
  }

  return (
    <div className={className} style={style} title={`${node.title}

${node.subtitle}

Estado: ${statusLabel}`}>
      {content}
    </div>
  )
}

export default function FlowMapPage() {
  const { t } = useI18n()
  const [activeStage, setActiveStage] = useState<string | null>(null)
  const [hoveredStage, setHoveredStage] = useState<string | null>(null)
  const sandboxLegendKey = 'flowMap.legend.sandbox'
  const sandboxLegendLabel = t(sandboxLegendKey) === sandboxLegendKey ? 'Sandbox validado / prod. pendiente' : t(sandboxLegendKey)

  const statusLabels: Record<FlowStatus, string> = {
    validated: t('flowMap.legend.validated'),
    implemented: t('flowMap.legend.implemented'),
    sandbox: sandboxLegendLabel,
  }

  const stageNodeMap: Record<string, string[]> = {
    inputs: ['chatbot-web', 'email-inbound', 'whatsapp-inbound', 'internal'],
    intake: ['reception', 'conversation', 'context'],
    analysis: ['intent', 'signals', 'routing'],
    branches: ['financing', 'buyer', 'seller', 'human', 'visit', 'documentation', 'pricing', 'property-interest', 'complaint', 'unknown'],
    results: ['lead-capture', 'crm-task', 'appointment', 'human-escalation', 'automatic-reply', 'email-processing', 'no-action', 'automation-events', 'whatsapp-outbound', 'email-outbound'],
    operations: ['crm-tasks-view', 'appointments-view', 'human-review', 'reporting'],
  }

  const stageConnectorMap: Record<string, string[]> = {
    inputs: [
      'chatbot-web-reception',
      'email-inbound-reception',
      'whatsapp-inbound-reception',
      'internal-reception',
    ],
    intake: [
      'reception-conversation',
      'conversation-context',
    ],
    analysis: [
      'context-intent',
      'intent-signals',
      'signals-routing',
    ],
    branches: [
      'routing-financing',
      'routing-buyer',
      'routing-seller',
      'routing-human',
      'routing-visit',
      'routing-documentation',
      'routing-pricing',
      'routing-property-interest',
      'routing-complaint',
      'routing-unknown',
    ],
    results: [
      'financing-lead-capture',
      'financing-crm-task',
      'buyer-lead-capture',
      'buyer-crm-task',
      'seller-lead-capture',
      'seller-crm-task',
      'human-human-escalation',
      'human-crm-task',
      'visit-lead-capture',
      'visit-crm-task',
      'visit-appointment',
      'documentation-automatic-reply',
      'pricing-automatic-reply',
      'property-interest-automatic-reply',
      'complaint-human-escalation',
      'unknown-no-action',
      'human-escalation-whatsapp-outbound',
      'automatic-reply-email-outbound',
    ],
    operations: [
      'crm-task-crm-tasks-view',
      'appointment-appointments-view',
      'human-escalation-human-review',
      'automatic-reply-human-review',
      'email-processing-human-review',
      'automation-events-reporting',
    ],
  }

  const getStageOpacity = (stageId: string) => {
    const focusedStage = activeStage || hoveredStage
    if (!focusedStage) return 'opacity-100'
    if (focusedStage === stageId) return 'opacity-100'
    return 'opacity-40'
  }

  const getNodeOpacity = (nodeId: string) => {
    const focusedStage = activeStage || hoveredStage
    if (!focusedStage) return 'opacity-100'
    const focusedNodes = stageNodeMap[focusedStage] || []
    return focusedNodes.includes(nodeId) ? 'opacity-100' : 'opacity-30'
  }

  const getConnectorOpacity = (from: string, to: string) => {
    const focusedStage = activeStage || hoveredStage
    if (!focusedStage) return 'opacity-100'
    const key = `${from}-${to}`
    const focusedConnectors = stageConnectorMap[focusedStage] || []
    return focusedConnectors.includes(key) ? 'opacity-100' : 'opacity-20'
  }

  const handleStageClick = (stageId: string) => {
    setActiveStage(prev => prev === stageId ? null : stageId)
  }

  const handleStageHover = (stageId: string | null) => {
    setHoveredStage(stageId)
  }

  const handleClearFocus = () => {
    setActiveStage(null)
  }

  const stageLanes: StageLane[] = [
    {
      id: 'inputs',
      title: t('flowMap.columns.inputs'),
      subtitle: t('flowMap.stageLanes.inputs'),
      x: 24,
      width: 122,
      tone: 'from-slate-100 via-slate-50 to-white',
    },
    {
      id: 'intake',
      title: t('flowMap.columns.conversation'),
      subtitle: t('flowMap.stageLanes.conversation'),
      x: 188,
      width: 146,
      tone: 'from-sky-100/60 via-sky-50/40 to-white',
    },
    {
      id: 'analysis',
      title: t('flowMap.columns.routing'),
      subtitle: t('flowMap.stageLanes.routing'),
      x: 366,
      width: 146,
      tone: 'from-violet-100/50 via-violet-50/30 to-white',
    },
    {
      id: 'branches',
      title: t('flowMap.columns.branches'),
      subtitle: t('flowMap.stageLanes.branches'),
      x: 556,
      width: 278,
      tone: 'from-amber-100/55 via-white to-orange-50/30',
    },
    {
      id: 'results',
      title: t('flowMap.columns.results'),
      subtitle: t('flowMap.stageLanes.results'),
      x: 884,
      width: 278,
      tone: 'from-emerald-100/45 via-white to-cyan-50/35',
    },
    {
      id: 'operations',
      title: t('flowMap.columns.operations'),
      subtitle: t('flowMap.stageLanes.operations'),
      x: 1236,
      width: 132,
      tone: 'from-slate-100 via-slate-50 to-white',
    },
  ]

  const nodes: DiagramNode[] = [
    {
      id: 'chatbot-web',
      title: t('flowMap.cards.entry.chatbot.title'),
      subtitle: t('flowMap.cards.entry.chatbot.subtitle'),
      status: 'implemented',
      icon: <Bot size={14} />,
      x: 36,
      y: 96,
      href: '/dashboard',
      hrefLabel: t('flowMap.cta.openDashboard'),
    },
    {
      id: 'email-inbound',
      title: t('flowMap.cards.entry.email.title'),
      subtitle: t('flowMap.cards.entry.email.subtitle'),
      status: 'implemented',
      icon: <Mail size={14} />,
      x: 36,
      y: 150,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'whatsapp-inbound',
      title: t('flowMap.cards.entry.whatsapp.title'),
      subtitle: t('flowMap.cards.entry.whatsapp.subtitle'),
      status: 'implemented',
      icon: <Phone size={14} />,
      x: 36,
      y: 204,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'internal',
      title: t('flowMap.cards.entry.internal.title'),
      subtitle: t('flowMap.cards.entry.internal.subtitle'),
      status: 'implemented',
      icon: <UserRound size={14} />,
      x: 36,
      y: 258,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'reception',
      title: t('flowMap.diagram.reception.title'),
      subtitle: t('flowMap.diagram.reception.subtitle'),
      status: 'implemented',
      icon: <MessageSquare size={14} />,
      x: 214,
      y: 96,
    },
    {
      id: 'conversation',
      title: t('flowMap.diagram.conversation.title'),
      subtitle: t('flowMap.diagram.conversation.subtitle'),
      status: 'implemented',
      icon: <MessageSquare size={14} />,
      x: 214,
      y: 148,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'context',
      title: t('flowMap.diagram.context.title'),
      subtitle: t('flowMap.diagram.context.subtitle'),
      status: 'implemented',
      icon: <Users size={14} />,
      x: 214,
      y: 200,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'intent',
      title: t('flowMap.diagram.intent.title'),
      subtitle: t('flowMap.diagram.intent.subtitle'),
      status: 'implemented',
      icon: <ScanSearch size={14} />,
      x: 392,
      y: 96,
    },
    {
      id: 'signals',
      title: t('flowMap.diagram.signals.title'),
      subtitle: t('flowMap.diagram.signals.subtitle'),
      status: 'implemented',
      icon: <Signal size={14} />,
      x: 392,
      y: 148,
    },
    {
      id: 'routing',
      title: t('flowMap.diagram.routing.title'),
      subtitle: t('flowMap.diagram.routing.subtitle'),
      status: 'implemented',
      icon: <GitBranch size={14} />,
      x: 392,
      y: 200,
    },
    {
      id: 'financing',
      title: t('flowMap.cards.branches.financing.title'),
      subtitle: t('flowMap.cards.branches.financing.subtitle'),
      status: 'implemented',
      icon: <Wallet size={14} />,
      x: 586,
      y: 76,
      href: '/tasks?source=chatbot&action_type=financing_followup_action',
      hrefLabel: t('flowMap.cta.openTasks'),
    },
    {
      id: 'buyer',
      title: t('flowMap.cards.branches.buyer.title'),
      subtitle: t('flowMap.cards.branches.buyer.subtitle'),
      status: 'implemented',
      icon: <Users size={14} />,
      x: 586,
      y: 132,
      href: '/tasks?source=chatbot&action_type=buyer_contact_action',
      hrefLabel: t('flowMap.cta.openTasks'),
    },
    {
      id: 'seller',
      title: t('flowMap.cards.branches.seller.title'),
      subtitle: t('flowMap.cards.branches.seller.subtitle'),
      status: 'implemented',
      icon: <BriefcaseBusiness size={14} />,
      x: 586,
      y: 188,
      href: '/tasks?source=chatbot&action_type=seller_valuation_action',
      hrefLabel: t('flowMap.cta.openTasks'),
    },
    {
      id: 'human',
      title: t('flowMap.cards.branches.human.title'),
      subtitle: t('flowMap.cards.branches.human.subtitle'),
      status: 'implemented',
      icon: <UserRound size={14} />,
      x: 586,
      y: 244,
      href: '/tasks?source=chatbot&action_type=human_followup_action',
      hrefLabel: t('flowMap.cta.openTasks'),
    },
    {
      id: 'visit',
      title: t('flowMap.cards.branches.visit.title'),
      subtitle: t('flowMap.cards.branches.visit.subtitle'),
      status: 'implemented',
      icon: <Calendar size={14} />,
      x: 586,
      y: 300,
      href: '/tasks?source=chatbot&action_type=visit_action',
      hrefLabel: t('flowMap.cta.openTasks'),
    },
    {
      id: 'documentation',
      title: t('flowMap.cards.branches.documentation.title'),
      subtitle: t('flowMap.cards.branches.documentation.subtitle'),
      status: 'implemented',
      icon: <FileText size={14} />,
      x: 716,
      y: 104,
    },
    {
      id: 'pricing',
      title: t('flowMap.cards.branches.pricing.title'),
      subtitle: t('flowMap.cards.branches.pricing.subtitle'),
      status: 'implemented',
      icon: <Wallet size={14} />,
      x: 716,
      y: 160,
    },
    {
      id: 'property-interest',
      title: t('flowMap.cards.branches.propertyInterest.title'),
      subtitle: t('flowMap.cards.branches.propertyInterest.subtitle'),
      status: 'implemented',
      icon: <LayoutGrid size={14} />,
      x: 716,
      y: 216,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'complaint',
      title: t('flowMap.cards.branches.complaint.title'),
      subtitle: t('flowMap.cards.branches.complaint.subtitle'),
      status: 'implemented',
      icon: <ShieldCheck size={14} />,
      x: 716,
      y: 272,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'unknown',
      title: t('flowMap.cards.branches.unknown.title'),
      subtitle: t('flowMap.cards.branches.unknown.subtitle'),
      status: 'implemented',
      icon: <CircleOff size={14} />,
      x: 716,
      y: 328,
    },
    {
      id: 'lead-capture',
      title: t('flowMap.cards.results.lead.title'),
      subtitle: t('flowMap.cards.results.lead.subtitle'),
      status: 'implemented',
      icon: <Users size={14} />,
      x: 914,
      y: 88,
      href: '/leads',
      hrefLabel: t('flowMap.cta.openLeads'),
    },
    {
      id: 'crm-task',
      title: t('flowMap.cards.results.task.title'),
      subtitle: t('flowMap.cards.results.task.subtitle'),
      status: 'implemented',
      icon: <BriefcaseBusiness size={14} />,
      x: 914,
      y: 160,
      href: '/tasks?source=chatbot',
      hrefLabel: t('flowMap.cta.openTasks'),
    },
    {
      id: 'appointment',
      title: t('flowMap.cards.results.appointment.title'),
      subtitle: t('flowMap.cards.results.appointment.subtitle'),
      status: 'implemented',
      icon: <Calendar size={14} />,
      x: 914,
      y: 232,
      href: '/appointments',
      hrefLabel: t('flowMap.cta.openAppointments'),
    },
    {
      id: 'human-escalation',
      title: t('flowMap.cards.results.human.title'),
      subtitle: t('flowMap.cards.results.human.subtitle'),
      status: 'implemented',
      icon: <UserRound size={14} />,
      x: 914,
      y: 304,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'automatic-reply',
      title: t('flowMap.cards.results.reply.title'),
      subtitle: t('flowMap.cards.results.reply.subtitle'),
      status: 'implemented',
      icon: <Bot size={14} />,
      x: 914,
      y: 376,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'email-processing',
      title: t('flowMap.cards.results.email.title'),
      subtitle: t('flowMap.cards.results.email.subtitle'),
      status: 'implemented',
      icon: <Mail size={14} />,
      x: 1044,
      y: 116,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'no-action',
      title: t('flowMap.cards.results.noAction.title'),
      subtitle: t('flowMap.cards.results.noAction.subtitle'),
      status: 'implemented',
      icon: <CircleOff size={14} />,
      x: 1044,
      y: 188,
    },
    {
      id: 'automation-events',
      title: t('flowMap.cards.results.events.title'),
      subtitle: t('flowMap.cards.results.events.subtitle'),
      status: 'implemented',
      icon: <Signal size={14} />,
      x: 1044,
      y: 260,
    },
    {
      id: 'whatsapp-outbound',
      title: t('flowMap.cards.gaps.whatsapp.title'),
      subtitle: t('flowMap.cards.gaps.whatsapp.subtitle'),
      status: 'sandbox',
      icon: <Phone size={14} />,
      x: 1044,
      y: 340,
    },
    {
      id: 'email-outbound',
      title: t('flowMap.cards.gaps.email.title'),
      subtitle: t('flowMap.cards.gaps.email.subtitle'),
      status: 'validated',
      icon: <Mail size={14} />,
      x: 1044,
      y: 396,
    },
    {
      id: 'crm-tasks-view',
      title: t('flowMap.cards.final.tasks.title'),
      subtitle: t('flowMap.cards.final.tasks.subtitle'),
      status: 'implemented',
      icon: <BriefcaseBusiness size={14} />,
      x: 1268,
      y: 160,
      href: '/tasks?source=chatbot',
      hrefLabel: t('flowMap.cta.openTasks'),
    },
    {
      id: 'appointments-view',
      title: t('flowMap.cards.final.appointments.title'),
      subtitle: t('flowMap.cards.final.appointments.subtitle'),
      status: 'implemented',
      icon: <Calendar size={14} />,
      x: 1268,
      y: 232,
      href: '/appointments',
      hrefLabel: t('flowMap.cta.openAppointments'),
    },
    {
      id: 'human-review',
      title: t('flowMap.cards.final.conversations.title'),
      subtitle: t('flowMap.cards.final.conversations.subtitle'),
      status: 'implemented',
      icon: <MessageSquare size={14} />,
      x: 1268,
      y: 304,
      href: '/conversations',
      hrefLabel: t('flowMap.cta.openConversations'),
    },
    {
      id: 'reporting',
      title: t('flowMap.cards.final.reports.title'),
      subtitle: t('flowMap.cards.final.reports.subtitle'),
      status: 'implemented',
      icon: <Signal size={14} />,
      x: 1268,
      y: 376,
      href: '/reports',
      hrefLabel: t('flowMap.cta.openReports'),
    },
  ]

  const connectors: DiagramConnector[] = [
    { from: 'chatbot-web', to: 'reception' },
    { from: 'email-inbound', to: 'reception' },
    { from: 'whatsapp-inbound', to: 'reception' },
    { from: 'internal', to: 'reception' },
    { from: 'reception', to: 'conversation' },
    { from: 'conversation', to: 'context' },
    { from: 'context', to: 'intent' },
    { from: 'intent', to: 'signals' },
    { from: 'signals', to: 'routing' },
    { from: 'routing', to: 'financing' },
    { from: 'routing', to: 'buyer' },
    { from: 'routing', to: 'seller' },
    { from: 'routing', to: 'human' },
    { from: 'routing', to: 'visit' },
    { from: 'routing', to: 'documentation' },
    { from: 'routing', to: 'pricing' },
    { from: 'routing', to: 'property-interest' },
    { from: 'routing', to: 'complaint' },
    { from: 'routing', to: 'unknown' },
    { from: 'financing', to: 'lead-capture' },
    { from: 'financing', to: 'crm-task' },
    { from: 'buyer', to: 'lead-capture' },
    { from: 'buyer', to: 'crm-task' },
    { from: 'seller', to: 'lead-capture' },
    { from: 'seller', to: 'crm-task' },
    { from: 'human', to: 'human-escalation' },
    { from: 'human', to: 'crm-task' },
    { from: 'visit', to: 'lead-capture' },
    { from: 'visit', to: 'crm-task' },
    { from: 'visit', to: 'appointment' },
    { from: 'documentation', to: 'automatic-reply' },
    { from: 'pricing', to: 'automatic-reply' },
    { from: 'property-interest', to: 'automatic-reply' },
    { from: 'complaint', to: 'human-escalation' },
    { from: 'unknown', to: 'no-action' },
    { from: 'crm-task', to: 'crm-tasks-view' },
    { from: 'appointment', to: 'appointments-view' },
    { from: 'human-escalation', to: 'human-review' },
    { from: 'automatic-reply', to: 'human-review' },
    { from: 'email-processing', to: 'human-review' },
    { from: 'automation-events', to: 'reporting' },
    { from: 'human-escalation', to: 'whatsapp-outbound', dashed: true },
    { from: 'automatic-reply', to: 'email-outbound', dashed: true },
  ]

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const resolvedConnectors = connectors.map((connector) => {
    const fromNode = nodeMap.get(connector.from)!
    const toNode = nodeMap.get(connector.to)!
    return getConnectorRoute(connector, fromNode, toNode)
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-2">
        <div className="mx-auto flex max-w-7xl items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-slate-500 transition hover:text-slate-700">
            {t('dashboard.title')}
          </Link>
          <ChevronRight size={14} className="text-slate-400" />
          <span className="font-medium text-slate-900">{t('flowMap.title')}</span>
        </div>
      </header>

      <main className="flex w-full max-w-none flex-col gap-2 px-4 py-2.5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#fbfdff_0%,#ffffff_60%,#f8fafc_100%)] px-3 py-2.5">
            <div className="flex flex-col gap-1.5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {t('flowMap.eyebrow')}
                </span>
                <h1 className="mt-1.5 text-[1.2rem] font-semibold tracking-tight text-slate-900 sm:text-[1.35rem]">{t('flowMap.title')}</h1>
                <p className="mt-1 text-[10px] leading-4 text-slate-600">{t('flowMap.description')}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <LegendBadge status="validated" label={t('flowMap.legend.validated')} />
                <LegendBadge status="implemented" label={t('flowMap.legend.implemented')} />
                <LegendBadge status="sandbox" label={sandboxLegendLabel} />
                {activeStage && (
                  <button
                    onClick={handleClearFocus}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-100 hover:border-red-400"
                    title={t('flowMap.cta.clearFocus')}
                  >
                    <X size={12} />
                    {t('flowMap.cta.clearFocus')}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="px-3 py-1.5 text-[10px] leading-4 text-slate-600">{t('flowMap.note')}</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-slate-900">{t('flowMap.canvas.title')}</h2>
            <p className="mt-0.5 text-[10px] leading-4 text-slate-600">{t('flowMap.canvas.subtitle')}</p>
          </div>

          <div className="overflow-visible p-2 md:p-3">
            <div
              className="flow-scale-shell mx-auto"
              style={{
                ['--flow-scale' as string]: `min(1, min(calc((100vw - 48px) / ${CANVAS_WIDTH}), calc((100vh - 182px) / ${CANVAS_HEIGHT})))`,
                width: CANVAS_WIDTH,
                minHeight: CANVAS_HEIGHT,
              }}
            >
              <div
                className="flow-scale-canvas relative rounded-[24px] border border-slate-200 bg-white"
                style={{
                  width: CANVAS_WIDTH,
                  minHeight: CANVAS_HEIGHT,
                  backgroundImage:
                    'radial-gradient(circle at top left, rgba(191,219,254,0.22), transparent 24%), radial-gradient(circle at top right, rgba(253,230,138,0.16), transparent 22%), linear-gradient(to right, rgba(148,163,184,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.025) 1px, transparent 1px)',
                  backgroundSize: 'auto, auto, 24px 24px, 24px 24px',
                }}
              >
                {stageLanes.map((lane) => (
                  <div 
                    key={lane.id} 
                    className={`absolute cursor-pointer transition-all duration-200 ${getStageOpacity(lane.id)} ${(activeStage || hoveredStage) === lane.id ? 'ring-2 ring-blue-400 ring-offset-1' : 'hover:ring-2 hover:ring-slate-300 hover:ring-offset-1'}`}
                    style={{ left: lane.x, top: 14, width: lane.width }}
                    onClick={() => handleStageClick(lane.id)}
                    onMouseEnter={() => handleStageHover(lane.id)}
                    onMouseLeave={() => handleStageHover(null)}
                    title={activeStage === lane.id ? t('flowMap.stageClickToClear') : t('flowMap.stageClickToFilter')}
                  >
                    <div className={`rounded-[16px] border border-slate-200/80 bg-gradient-to-b ${lane.tone} px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${(activeStage || hoveredStage) === lane.id ? 'border-blue-300 bg-blue-50/50' : ''}`}>
                      <div className="text-[7px] font-semibold uppercase tracking-[0.18em] text-slate-500">{lane.title}</div>
                      <div className="mt-0.5 text-[8px] leading-3 text-slate-600">{lane.subtitle}</div>
                    </div>
                  </div>
                ))}

                <div className="pointer-events-none absolute left-[556px] top-[64px] h-[328px] w-[278px] rounded-[26px] border border-dashed border-amber-200/80 bg-amber-50/12" />
                <div className="pointer-events-none absolute left-[884px] top-[76px] h-[376px] w-[278px] rounded-[26px] border border-dashed border-emerald-200/80 bg-emerald-50/10" />
                <div className="pointer-events-none absolute left-[198px] top-[64px] h-[188px] w-[220px] rounded-[26px] border border-sky-200/60 bg-sky-50/20" />

                <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                  <defs>
                    <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
                    </marker>
                  </defs>
                  {resolvedConnectors.map((connector) => (
                    <path
                      key={`${connector.from}-${connector.to}`}
                      d={connector.path}
                      fill="none"
                      stroke={connector.stroke}
                      strokeWidth={connector.dashed ? '1.1' : '1.35'}
                      strokeDasharray={connector.dashed ? '3.5 3.5' : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd="url(#flow-arrow)"
                      className={`transition-opacity duration-200 ${getConnectorOpacity(connector.from, connector.to)}`}
                    />
                  ))}
                </svg>

                {nodes.map((node) => (
                  <div key={node.id} className={`transition-opacity duration-200 ${getNodeOpacity(node.id)}`}>
                    <FlowCard node={node} statusLabel={statusLabels[node.status]} t={t} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .flow-scale-shell {
          width: calc(${CANVAS_WIDTH}px * var(--flow-scale));
          min-height: calc(${CANVAS_HEIGHT}px * var(--flow-scale));
        }

        .flow-scale-canvas {
          transform: scale(var(--flow-scale));
          transform-origin: top left;
        }
      `}</style>
    </div>
  )
}

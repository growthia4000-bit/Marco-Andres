export interface AppKnowledgeEntry {
  route: string
  routePatterns?: string[]
  title: string
  sections: string[]
  actions: string[]
  forms?: string[]
  filters?: string[]
  entities?: string[]
  roleScope: string[]
  keywords: string[]
  relatedFlows?: string[]
  supportFields?: string[]
  minimumContext?: string[]
  guidance: string
}

const APP_KNOWLEDGE: AppKnowledgeEntry[] = [
  {
    route: '/admin',
    routePatterns: ['/admin'],
    title: 'Panel global',
    sections: ['Tarjetas de Tenants, Operativos, Incidencias y Usuarios facturables', 'Tabla de tenants con Tenant, Estado tenant, Plan actual, Suscripción, Usuarios facturables, ¿Puede crear más? y Operativo', 'Crear tenant'],
    actions: ['Tenants', 'Operativos', 'Incidencias', 'Usuarios facturables', 'Crear tenant', 'Suspender', 'Reactivar'],
    forms: ['Crear tenant'],
    filters: ['Tenants', 'Operativos', 'Incidencias', 'Usuarios facturables'],
    entities: ['tenant', 'plan', 'suscripcion'],
    roleScope: ['superadmin'],
    keywords: ['admin', 'panel global', 'tenant', 'tenants', 'crear tenant', 'suspender tenant', 'estado comercial', 'usuarios facturables', 'operativos', 'incidencias', 'tabla de tenants'],
    relatedFlows: ['crear tenant', 'suspender tenant', 'reactivar tenant'],
    supportFields: ['Tenant', 'Estado tenant', 'Plan actual', 'Suscripción', 'Usuarios facturables', 'Operativo'],
    minimumContext: ['nombre del tenant', 'tarjeta visible o columna visible'],
    guidance: 'Pantalla para supervisar tenants y su estado operativo/comercial. Lo primero suele ser revisar las tarjetas superiores y luego la fila del tenant en la tabla, sobre todo Estado tenant, Plan actual, Suscripción, Usuarios facturables y Operativo.',
  },
  {
    route: '/dashboard',
    routePatterns: ['/dashboard'],
    title: 'Dashboard',
    sections: ['Resumen comercial y suscripcion', 'Acciones del chatbot', 'Widgets del dashboard y accesos rapidos'],
    actions: ['Abrir cola', 'Abrir propiedades', 'Abrir leads', 'Abrir citas', 'Anadir widget', 'Resetear widgets'],
    forms: [],
    filters: [],
    entities: ['widget', 'lead', 'cita', 'propiedad'],
    roleScope: ['tenant_admin', 'coordinator', 'agent', 'superadmin'],
    keywords: ['dashboard', 'widgets', 'estado comercial', 'cola', 'acciones del chatbot', 'accesos rapidos', 'resumen comercial'],
    relatedFlows: ['abrir cola del chatbot', 'reordenar widgets', 'abrir modulos principales'],
    supportFields: ['nombre del widget', 'tarjeta o acceso rapido visible'],
    minimumContext: ['widget o tarjeta visible'],
    guidance: 'Pantalla principal con resumen comercial, acciones del chatbot, widgets reordenables y accesos rapidos. Si hay una duda, conviene pedir el nombre del widget o tarjeta visible.',
  },
  {
    route: '/properties',
    routePatterns: ['/properties', '/properties/new', '/properties/[id]', '/properties/[id]/edit'],
    title: 'Propiedades',
    sections: ['Tarjetas de Total, Venta, Alquiler, Cerradas e Inactivas', 'Buscador, filtros y filtros guardados', 'Grid de propiedades y galeria de imagenes'],
    actions: ['Nueva propiedad', 'Buscar', 'Filtrar por tipo', 'Filtrar por operacion', 'Filtrar por estado', 'Guardar filtros', 'Ver detalle', 'Editar propiedad', 'Eliminar propiedad'],
    forms: ['Nueva propiedad', 'Guardar filtro'],
    filters: ['Buscar', 'Tipo', 'Operacion', 'Estado', 'Orden'],
    entities: ['propiedad', 'tipo de propiedad', 'operacion', 'estado'],
    roleScope: ['tenant_admin', 'coordinator', 'agent'],
    keywords: ['properties', 'propiedades', 'inmuebles', 'nueva propiedad', 'guardar filtros', 'editar propiedad', 'galeria', 'buscar propiedad'],
    relatedFlows: ['crear propiedad', 'editar propiedad', 'guardar filtro', 'abrir galeria'],
    supportFields: ['titulo de la propiedad', 'filtro activo', 'tipo', 'operacion', 'estado'],
    minimumContext: ['card, filtro o boton visible', 'si esta en listado, detalle o edicion'],
    guidance: 'Pantalla de gestion de propiedades con tarjetas de resumen, buscador, filtros, filtros guardados y grid de propiedades. Si hay un problema, pide el filtro, tarjeta, boton o card visible.',
  },
  {
    route: '/leads',
    routePatterns: ['/leads', '/leads/new', '/leads/[id]', '/leads/[id]/edit'],
    title: 'Leads',
    sections: ['Tarjetas por estado del lead', 'Buscador, filtro por estado y filtros guardados', 'Pipeline y lista de leads'],
    actions: ['Nuevo lead', 'Cambiar entre pipeline y lista', 'Buscar', 'Filtrar por estado', 'Guardar filtros', 'Abrir lead', 'Editar lead', 'Eliminar lead'],
    forms: ['Nuevo lead', 'Guardar filtro'],
    filters: ['Buscar', 'Estado', 'Vista pipeline/lista'],
    entities: ['lead', 'estado del lead', 'fuente del lead'],
    roleScope: ['tenant_admin', 'coordinator', 'agent'],
    keywords: ['leads', 'pipeline', 'lista', 'nuevo lead', 'guardar filtros', 'estado del lead', 'contacted', 'qualified', 'won', 'lost'],
    relatedFlows: ['crear lead', 'mover lead en pipeline', 'filtrar leads'],
    supportFields: ['vista actual', 'estado o columna visible', 'nombre del lead'],
    minimumContext: ['si esta en pipeline o lista', 'estado visible o lead visible'],
    guidance: 'Pantalla para gestionar leads en pipeline o lista. Si hace falta orientar al usuario, primero confirma si esta en pipeline o lista y el estado o columna visible.',
  },
  {
    route: '/appointments',
    routePatterns: ['/appointments', '/appointments/new', '/appointments/[id]', '/appointments/[id]/edit'],
    title: 'Citas',
    sections: ['Tarjetas Total del mes, Hoy, Programadas, Confirmadas y Completadas', 'Calendario mensual', 'Panel del dia con horarios disponibles y detalle de citas'],
    actions: ['Nueva cita', 'Ir a hoy', 'Cambiar mes', 'Seleccionar dia', 'Elegir horario disponible', 'Ver detalle', 'Eliminar cita'],
    forms: ['Nueva cita'],
    filters: ['Mes actual', 'Dia seleccionado'],
    entities: ['cita', 'horario', 'estado de cita', 'lead', 'propiedad'],
    roleScope: ['tenant_admin', 'coordinator', 'agent'],
    keywords: ['appointments', 'citas', 'calendario', 'horarios disponibles', 'nueva cita', 'hoy', 'dia 24', '24 de abril'],
    relatedFlows: ['consultar disponibilidad', 'crear cita', 'resolver conflicto de horario', 'borrar cita'],
    supportFields: ['fecha visible', 'horario solicitado', 'estado de la cita', 'titulo de la cita'],
    minimumContext: ['fecha o dia consultado', 'hora concreta si quiere reservar'],
    guidance: 'Pantalla de calendario con disponibilidad real por dia. Si el usuario pregunta horarios libres o reserva, prioriza la fecha visible, las horas ocupadas/libres y la creacion real de la cita.',
  },
  {
    route: '/reports',
    routePatterns: ['/reports'],
    title: 'Reportes',
    sections: ['Tarjetas KPI', 'Selector de rango temporal', 'Graficos de propiedades, leads, citas e ingresos', 'Exportaciones rapidas'],
    actions: ['Cambiar rango', 'Exportar propiedades', 'Exportar leads', 'Exportar citas'],
    forms: [],
    filters: ['Ultimos 30 dias', 'Ultimos 90 dias', 'Ultimos 180 dias', 'Ultimo ano'],
    entities: ['reporte', 'KPI', 'grafico', 'exportacion'],
    roleScope: ['tenant_admin', 'coordinator'],
    keywords: ['reports', 'reportes', 'gráficos', 'exportar', 'rango temporal', 'métricas'],
    relatedFlows: ['cambiar rango', 'exportar dataset'],
    supportFields: ['grafico visible', 'rango temporal seleccionado'],
    minimumContext: ['grafico o tarjeta visible', 'rango actual'],
    guidance: 'Pantalla analitica con KPI, rango temporal, graficos y exportaciones. Si el usuario pide ayuda, conviene pedir el grafico visible o el rango temporal seleccionado.',
  },
  {
    route: '/team',
    routePatterns: ['/team'],
    title: 'Equipo',
    sections: ['Miembros del equipo', 'Invitaciones pendientes', 'Formulario de invitacion'],
    actions: ['Invitar miembro', 'Mostrar invitaciones', 'Copiar enlace', 'Cancelar invitacion', 'Filtrar miembros'],
    forms: ['Formulario de invitacion'],
    filters: ['Todos', 'Activos', 'Admins', 'Agentes'],
    entities: ['miembro', 'invitacion', 'rol'],
    roleScope: ['tenant_admin', 'agent'],
    keywords: ['team', 'equipo', 'invitar', 'invitaciones', 'miembros', 'cancelar invitacion', 'active', 'admin', 'agent'],
    relatedFlows: ['invitar miembro', 'cancelar invitacion', 'copiar enlace'],
    supportFields: ['rol actual', 'miembro visible', 'invitacion visible'],
    minimumContext: ['si ve miembros o invitaciones', 'si es admin o no'],
    guidance: 'Pantalla de equipo con miembros, invitaciones y formulario de invitacion. Los admins pueden invitar y cancelar; otros roles ven el listado y el aviso de permisos.',
  },
  {
    route: '/tasks',
    routePatterns: ['/tasks', '/tasks/[id]'],
    title: 'CRM Actions',
    sections: ['Tarjetas Total, Pendientes, En progreso y Completadas', 'Filtros por fuente, tipo y estado', 'Tabla de acciones CRM'],
    actions: ['Refrescar', 'Filtrar por fuente', 'Filtrar por tipo', 'Filtrar por estado', 'Abrir accion', 'Completar accion'],
    forms: [],
    filters: ['Fuente', 'Tipo', 'Estado'],
    entities: ['accion CRM', 'estado de accion', 'prioridad'],
    roleScope: ['tenant_admin', 'coordinator', 'agent'],
    keywords: ['tasks', 'crm actions', 'acciones crm', 'cola', 'filtrar acciones', 'completar acción'],
    relatedFlows: ['revisar cola', 'marcar completada'],
    supportFields: ['tipo de accion', 'estado', 'fila visible'],
    minimumContext: ['filtro visible o fila visible'],
    guidance: 'Pantalla de acciones operativas del CRM con tarjetas de estado, filtros y tabla. Si el usuario necesita ayuda, pide el tipo de accion, el estado o la fila visible.',
  },
  {
    route: '/conversations',
    routePatterns: ['/conversations'],
    title: 'Conversaciones',
    sections: ['Lista de conversaciones', 'Panel de mensajes', 'Clasificacion y acciones', 'Modales de slots, email y WhatsApp'],
    actions: ['Crear conversacion', 'Enviar mensaje', 'Clasificar', 'Generar auto reply', 'Escalar', 'Sugerir slots', 'Responder por email', 'Responder por WhatsApp'],
    forms: ['Nueva conversacion', 'Redactar mensaje', 'Email', 'WhatsApp', 'Escalacion'],
    filters: ['Canal', 'Conversacion seleccionada'],
    entities: ['conversacion', 'mensaje', 'slot', 'clasificacion', 'canal'],
    roleScope: ['tenant_admin', 'coordinator', 'agent'],
    keywords: ['conversations', 'conversaciones', 'mensajes', 'email', 'whatsapp', 'auto reply', 'escalar'],
    relatedFlows: ['clasificar mensaje', 'sugerir slots', 'crear cita desde conversacion', 'escalar a humano'],
    supportFields: ['canal visible', 'conversacion seleccionada', 'accion visible'],
    minimumContext: ['canal actual', 'accion o boton visible'],
    guidance: 'Pantalla de conversaciones multicanal con lista, timeline y acciones de clasificacion, slots y escalado. Si hay una duda, pide el canal visible, la conversacion seleccionada o la accion exacta.',
  },
  {
    route: '/channels',
    routePatterns: ['/channels'],
    title: 'Canales',
    sections: ['Diagnostico de email', 'Sincronizacion de inbox', 'Diagnostico de WhatsApp', 'Configuracion de WhatsApp'],
    actions: ['Probar email', 'Probar WhatsApp', 'Sincronizar bandeja', 'Guardar configuracion de WhatsApp'],
    forms: ['Configuracion de WhatsApp'],
    filters: [],
    entities: ['canal email', 'canal WhatsApp', 'configuracion', 'diagnostico'],
    roleScope: ['tenant_admin', 'superadmin'],
    keywords: ['channels', 'canales', 'diagnóstico', 'email', 'whatsapp', 'sincronizar bandeja', 'guardar configuración'],
    relatedFlows: ['probar email', 'probar WhatsApp', 'guardar configuracion', 'sincronizar inbox'],
    supportFields: ['bloque visible', 'mensaje de error visible', 'estado de configuracion'],
    minimumContext: ['si el problema esta en email, inbox o WhatsApp'],
    guidance: 'Pantalla de diagnostico y pruebas de canales. Si hay un problema, pide el bloque visible exacto: email, inbox email o WhatsApp.',
  },
]

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function getAppKnowledge() {
  return APP_KNOWLEDGE
}

export function getAppKnowledgeByRoute(route: string | null | undefined) {
  if (!route) return null
  return APP_KNOWLEDGE.find((entry) => entry.route === route) || null
}

export function getAppKnowledgeByPath(path: string | null | undefined) {
  if (!path) return null
  const direct = getAppKnowledgeByRoute(path)
  if (direct) return direct

  return APP_KNOWLEDGE.find((entry) => path === entry.route || path.startsWith(`${entry.route}/`)) || null
}

export function findRelevantAppKnowledge(query: string) {
  const normalizedQuery = normalize(query)
  return APP_KNOWLEDGE.filter((entry) => {
    const haystack = [entry.route, entry.title, ...entry.sections, ...entry.actions, ...entry.keywords].map(normalize)
    return haystack.some((value) => normalizedQuery.includes(value) || value.includes(normalizedQuery))
  }).slice(0, 3)
}

export function findBestAppKnowledgeMatch(query: string) {
  const normalizedQuery = normalize(query).trim()
  if (!normalizedQuery) return null

  let bestMatch: AppKnowledgeEntry | null = null
  let bestScore = 0

  for (const entry of APP_KNOWLEDGE) {
    const values = [entry.route, entry.title, ...entry.sections, ...entry.actions, ...entry.keywords].map(normalize)
    let score = 0

    for (const value of values) {
      if (!value) continue
      if (normalizedQuery === value) score = Math.max(score, 120)
      else if (normalizedQuery.includes(value)) score = Math.max(score, 90 + value.length)
      else if (value.includes(normalizedQuery)) score = Math.max(score, 50 + normalizedQuery.length)
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = entry
    }
  }

  return bestMatch
}

const GENERIC_APP_KNOWLEDGE_TERMS = new Set([
  'admin',
  'panel',
  'tenant',
  'tenants',
  'crm',
])

export function findExplicitAppKnowledgeMatch(query: string) {
  const normalizedQuery = normalize(query).trim()
  if (!normalizedQuery) return null

  for (const entry of APP_KNOWLEDGE) {
    const explicitValues = [entry.route, entry.title, ...entry.keywords]
      .map(normalize)
      .filter((value) => value.length >= 5 && !GENERIC_APP_KNOWLEDGE_TERMS.has(value))

    if (explicitValues.some((value) => normalizedQuery.includes(value))) {
      return entry
    }
  }

  return null
}

export function findExplicitAppKnowledgeSwitchMatch(query: string) {
  const normalizedQuery = normalize(query).trim()
  if (!normalizedQuery) return null

  const switchSignals = [
    'ahora', 'cambiar a', 'cambiemos a', 'quiero ver', 'vamos a', 've a', 'abrir', 'abre',
    'switch to', 'go to', 'open', 'show me',
    'passiamo a', 'cambia a', 'vai a',
  ]

  const hasSwitchSignal = switchSignals.some((signal) => normalizedQuery.includes(signal))
  if (!hasSwitchSignal) return null

  return findExplicitAppKnowledgeMatch(query)
}

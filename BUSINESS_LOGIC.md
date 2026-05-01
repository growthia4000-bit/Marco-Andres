# BUSINESS_LOGIC.md - CRM Inmobiliario Multi-Tenant

> Generado por SaaS Factory | Fecha: 2026-03-18

## 1. Problema de Negocio

**Dolor:** CRM inmobiliario sin sistema centralizado que causa caos operativo, pérdida de datos y mezcla de información entre agentes y propiedades. El seguimiento de leads es manual, desorganizado y sin trazabilidad.

**Costo actual:**
- 2-4 horas diarias en tareas manuales y desorganización operativa
- 20-30% de leads perdidos por falta de control y respuestas tardías
- Cientos/miles de euros perdidos por cada venta o alquiler mal gestionado
- Frustración del equipo y mala atención al cliente
- Imposibilidad de escalar sin caos

## 2. Solución

**Propuesta de valor:** Un CRM inmobiliario multi-agente con separación total de tenants, roles claros y trazabilidad completa que centraliza clientes, propiedades, leads, citas y seguimiento.

**Flujo principal (Happy Path):**
1. Administrador crea y configura su inmobiliaria (tenant) dentro de la plataforma
2. Sistema habilita entorno aislado con usuarios, propiedades y permisos específicos
3. Agente registra lead, lo relaciona con propiedad, agenda seguimiento y actualiza cada interacción
4. Sistema centraliza historial completo con trazabilidad hasta cerrar operación (venta/alquiler)

## 3. Usuario Objetivo

**Roles definidos:**
- **Administrador del tenant:** Configura la inmobiliaria, gestiona usuarios internos, permisos y estructura
- **Coordinador comercial:** Supervisa pipeline, asigna leads, monitorea métricas del equipo
- **Agente inmobiliario:** Gestiona sus propios leads, propiedades asignadas, citas y seguimiento diario

**Contexto:** Inmobiliarias con múltiples agentes que necesitan control total sobre su operación sin mezclar datos con otros tenants, con visibilidad de métricas por usuario y por organización.

## 4. Arquitectura de Datos

### Inputs del Sistema
- Datos de propiedades (fotos, ubicación, precio, características)
- Datos de clientes y leads (contacto, preferencias, presupuesto)
- Datos de agentes (perfil, zona asignada, cartera)
- Formularios de contacto web
- Citas y日程
- Documentos (contratos, escrituras, comprobantes)
- Tareas y recordatorios
- Comunicaciones comerciales (mensajes, audios, transcripciones)

### Outputs del Sistema
- Historial integral de relación comercial con trazabilidad completa
- Visualización de interacciones por cliente/propiedad
- Reproducción de audios y transcripciones
- Estados de oportunidad actualizados (Lead → Contactado → Visita → Negociación → Cierre)
- Recordatorios automáticos
- Métricas y reportes por agente, por equipo, por tenant
- Dashboard de productividad

### Storage (Supabase tables sugeridas)

**Core:**
- `tenants`: Inmobiliarias/tenants separados
- `users`: Usuarios del sistema (ligados a tenant)
- `profiles`: Perfiles extendidos con rol (admin, coordinador, agente)

**Negocio:**
- `properties`: Propiedades del inventario
- `leads`: Leads y prospectos
- `leads_properties`: Relación many-to-many leads-propiedades
- `interactions`: Interacciones comerciales (visitas, llamadas, mensajes)
- `interaction_attachments`: Archivos y audios de interacciones
- `appointments`: Citas y日程
- `tasks`: Tareas y recordatorios
- `deals`: Negociaciones/operaciones (ventas/alquileres)

## 5. KPI de Éxito

**Métricas V1:**
| KPI | Meta |
|-----|------|
| Trazabilidad de leads | 100% (todo lead tiene historial completo) |
| Mezcla de datos entre tenants | 0 (aislamiento total por tenant) |
| Tiempo de gestión por acción clave | < 3 minutos |
| Seguimiento documentado | 100% de interacciones registradas |

## 6. Especificación Técnica (Para el Agente)

### Features a Implementar (Feature-First)

```
src/features/
├── auth/                    # Autenticación multi-tenant (Supabase Auth + RLS)
├── tenants/                # Gestión de tenants (admin global)
├── users/                  # Usuarios y perfiles por tenant
├── roles/                 # Sistema de roles y permisos (admin, coordinador, agente)
├── properties/            # CRUD propiedades con fotos
├── leads/                 # Gestión de leads con estados
├── interactions/         # Registro de interacciones (notas, audios, transcripciones)
├── appointments/         # Calendario de citas
├── tasks/                # Tareas y recordatorios
├── deals/                # Pipeline de negociación
└── dashboard/            # Dashboard con métricas
```

### Stack Confirmado
- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind 3.4 + shadcn/ui
- **Backend:** Supabase (Auth + Database + Storage + RLS)
- **Validación:** Zod
- **State:** Zustand (si necesario)
- **MCPs:** Next.js DevTools + Playwright + Supabase

### Multi-Tenancy Strategy
- Cada tenant tiene `tenant_id` en todas las tablas de negocio
- Row Level Security (RLS) filtra por `tenant_id` automáticamente
- Usuarios pertenecen a un tenant específico
- Admin global puede ver todos los tenants (sin RLS en tabla tenants)

### Proximos Pasos

- [ ] Setup proyecto base (ya existe: mi-saas)
- [ ] Configurar Supabase: crear tablas con tenant_id + RLS
- [ ] Implementar Auth con separación por tenant
- [ ] Feature: Gestión de propiedades
- [ ] Feature: Gestión de leads con pipeline
- [ ] Feature: Registro de interacciones (notas, audios)
- [ ] Feature: Citas y calendario
- [ ] Feature: Dashboard con métricas
- [ ] Testing E2E con Playwright
- [ ] Deploy Vercel

## 7. Notas Importantes

- **Audio/Transcripción:** Almacenar en Supabase Storage como audio, usar Whisper o similar para transcripción
- **RLS crítico:** Todo query debe filtrar por `tenant_id` - no confiar solo en UI
- **Separación tenants:** Más importante que cualquier feature - si falla, todo falla

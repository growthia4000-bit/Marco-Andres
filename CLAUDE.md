# CRM Inmobiliario Multi-Tenant

> Proyecto CRM inmobiliario basado en SaaS Factory V4

## BUSINESS_LOGIC.md

Ver archivo `BUSINESS_LOGIC.md` en la raíz del proyecto.

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 16 + React 19 + TypeScript |
| Estilos | Tailwind CSS 3.4 (Bento Grid Design) |
| Backend | Supabase (Auth + DB + RLS) |
| Validación | Zod |
| Estado | Zustand |

## Diseño: Bento Grid

Dashboard modular con cards organizadas:
- Stats (propiedades, leads, citas, tasa de cierre)
- Propiedades recientes (grid de imágenes)
- Pipeline de ventas (kanban-style)
- Citas próximas
- Leads recientes
- Actividad del equipo

## Estructura de Features (Pending)

```
src/features/
├── auth/                    # Auth multi-tenant
├── tenants/                # Gestión de tenants
├── users/                  # Usuarios y perfiles
├── properties/            # CRUD propiedades
├── leads/                 # Gestión de leads
├── interactions/         # Registro de interacciones
├── appointments/         # Calendario de citas
├── pipeline/            # Pipeline de ventas
└── dashboard/           # Dashboard principal
```

## MCPs Configurados

- next-devtools
- playwright
- supabase

## Próximos Pasos

1. [ ] Configurar Supabase (tablas + RLS)
2. [ ] Implementar auth multi-tenant
3. [ ] CRUD de propiedades
4. [ ] Sistema de leads con pipeline
5. [ ] Registro de interacciones
6. [ ] Calendario de citas
7. [ ] Dashboard con métricas reales

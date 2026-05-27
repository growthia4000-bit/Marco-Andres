# CRM Inmobiliario

Baseline operativo del CRM inmobiliario multi-tenant con Next.js + Supabase.

## Requisitos previos

- Node.js 22+
- npm
- Docker Desktop encendido
- WSL2 con Ubuntu habilitado
- `npx supabase` disponible
- `npx playwright install` ejecutado al menos una vez

## Ramas de trabajo

- No trabajar sobre ramas `safety/*`
- Baseline técnico actual: `work/post-phase26-baseline`

## Variables de entorno

Archivo base:

```bash
cp .env.example .env.local
```

Variables obligatorias en cualquier entorno:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

Uso recomendado por entorno:

- `local`: URL local de Supabase + `http://127.0.0.1:3000`
- `staging`: proyecto Supabase de staging + dominio de staging
- `producción`: proyecto Supabase de producción + dominio final

Validación rápida:

```bash
npm run env:check
```

## Flujo local reproducible

1. Levantar Supabase local:

```bash
npm run supabase:start
```

2. Resetear la base local cuando necesites reconstruir todo:

```bash
npm run supabase:reset
```

Este comando:

1. detiene el stack actual si existe,
2. vuelve a levantar Supabase local,
3. ejecuta `db reset` sobre el proyecto real.

3. Levantar la app contra Supabase local:

```bash
npm run dev:local
```

La app queda en `http://127.0.0.1:3000`.

## Flujo de release / staging / producción

1. Configurar variables reales del entorno.
2. Validarlas:

```bash
npm run env:check
```

3. Ejecutar verificación técnica de release:

```bash
npm run release:verify
```

4. Arrancar en modo release:

```bash
npm run start:release
```

5. Ejecutar verificación operativa mínima contra la URL desplegada o local:

```bash
npm run healthcheck
```

## QA mínima crítica

El proyecto conserva una sola prueba crítica reproducible:

- `tests/qa/auth-invitations-team.spec.cjs`

Cobertura:

- owner signup
- invitation signup
- `/team` después de aceptación

Ejecución:

```bash
npm run qa:critical
```

Nota: este script usa PowerShell para ejecutar Playwright con un entorno Windows estable.

## Verificación técnica básica

```bash
npm run typecheck
npm run build
```

O en un solo paso:

```bash
npm run verify:tech
```

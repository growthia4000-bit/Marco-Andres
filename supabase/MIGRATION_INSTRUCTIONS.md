# Instrucciones de migración y bootstrap local

El flujo operativo actual del proyecto ya no depende de ejecutar SQL manualmente en el dashboard.

## Comandos oficiales del repo

Desde la raíz del proyecto:

```bash
npm run supabase:start
npm run supabase:reset
```

## Orden recomendado

1. Levantar servicios locales:

```bash
npm run supabase:start
```

2. Si necesitas reconstruir el estado local desde cero:

```bash
npm run supabase:reset
```

Este comando ya automatiza el ciclo completo:

1. detener el stack actual si existe,
2. volver a levantar Supabase local,
3. ejecutar el reset sobre el repo real.

3. Levantar la app local:

```bash
npm run dev:local
```

4. Ejecutar la QA mínima crítica:

```bash
npm run qa:critical
```

## Referencia rápida

- Documentación operativa principal: `README.md`
- Guía de release/staging/producción: `docs/release-readiness.md`
- QA mínima crítica: `tests/qa/auth-invitations-team.spec.cjs`

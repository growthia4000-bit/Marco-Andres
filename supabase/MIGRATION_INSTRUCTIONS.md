# Instrucciones de Migración

## Opción 1: Usar Supabase CLI (Recomendado)

1. Instala Supabase CLI:
```bash
# macOS
brew install supabase/tap/supabase

# Linux/WSL
npm install -g supabase
```

2. Vincula tu proyecto:
```bash
cd ~/Developer/software/crm-inmobiliario
supabase link --project-ref xwdwcirsozbrgqzdyhwv
```

3. Copia la migración:
```bash
cp supabase/migrations/001_initial_schema.sql supabase/migrations/
```

4. Ejecuta la migración:
```bash
supabase db push
```

## Opción 2: Ejecutar SQL manualmente en Supabase Dashboard

1. Ve a https://supabase.com/dashboard
2. Selecciona tu proyecto: `xwdwcirsozbrgqzdyhwv`
3. Ve a **SQL Editor**
4. Copia y pega el contenido de `supabase/migrations/001_initial_schema.sql`
5. Ejecuta el SQL

## Opción 3: Ejecutar desde tu terminal

```bash
# Usando psql directamente
psql "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
```

Luego copia el SQL del archivo `001_initial_schema.sql`.

## Verificar que todo está OK

Después de ejecutar la migración, verifica que las tablas existen:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

Deberías ver: tenants, users, properties, leads, lead_properties, interactions, appointments, tasks

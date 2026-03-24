-- =============================================================================
-- SCRIPT DE VERIFICACION Y CORRECCION DE RLS
-- Ejecuta este SQL en Supabase Dashboard > SQL Editor
-- =============================================================================

-- 1. Verificar que el trigger existe
SELECT 'Trigger handle_new_user:' as check, 
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') 
            THEN 'EXISTS' ELSE 'MISSING' END as status;

-- 2. Verificar que el trigger de auth.users existe
SELECT 'Trigger on_auth_user_created:' as check,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') 
            THEN 'EXISTS' ELSE 'MISSING' END as status;

-- =============================================================================
-- POLICIAS DE SEGURIDAD (RLS)
-- =============================================================================

-- Tabla: tenants
-- Eliminar policies existentes
DROP POLICY IF EXISTS "tenant_select_policy" ON tenants;
DROP POLICY IF EXISTS "tenant_insert_public" ON tenants;
DROP POLICY IF EXISTS "tenant_select_public" ON tenants;

-- Crear policy para usuarios autenticados
CREATE POLICY "tenant_select_auth" ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Policy para INSERT (necesario para el trigger)
CREATE POLICY "tenant_insert_trigger" ON tenants
  FOR INSERT WITH CHECK (true);

-- Tabla: users
DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_insert_public" ON users;
DROP POLICY IF EXISTS "users_select_public" ON users;
DROP POLICY IF EXISTS "users_update_public" ON users;

CREATE POLICY "users_select_auth" ON users
  FOR SELECT USING (
    id = auth.uid() OR 
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "users_insert_trigger" ON users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "users_update_auth" ON users
  FOR UPDATE USING (
    id = auth.uid() OR 
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Tabla: properties
DROP POLICY IF EXISTS "properties_policy" ON properties;
DROP POLICY IF EXISTS "properties_all_public" ON properties;

CREATE POLICY "properties_auth" ON properties
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Tabla: leads
DROP POLICY IF EXISTS "leads_policy" ON leads;
DROP POLICY IF EXISTS "leads_all_public" ON leads;

CREATE POLICY "leads_auth" ON leads
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Tabla: lead_properties
DROP POLICY IF EXISTS "lead_properties_policy" ON lead_properties;
DROP POLICY IF EXISTS "lead_properties_all_public" ON lead_properties;

CREATE POLICY "lead_properties_auth" ON lead_properties
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM leads l 
      WHERE l.id = lead_properties.lead_id 
      AND l.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    )
  );

-- Tabla: interactions
DROP POLICY IF EXISTS "interactions_policy" ON interactions;
DROP POLICY IF EXISTS "interactions_all_public" ON interactions;

CREATE POLICY "interactions_auth" ON interactions
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Tabla: appointments
DROP POLICY IF EXISTS "appointments_policy" ON appointments;
DROP POLICY IF EXISTS "appointments_all_public" ON appointments;

CREATE POLICY "appointments_auth" ON appointments
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Tabla: tasks
DROP POLICY IF EXISTS "tasks_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_all_public" ON tasks;

CREATE POLICY "tasks_auth" ON tasks
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- =============================================================================
-- VERIFICACION FINAL
-- =============================================================================

SELECT 
  'RLS Policies Applied' as status,
  COUNT(*) as policies_count
FROM pg_policies WHERE schemaname = 'public';

-- Verificar que las tablas tienen RLS habilitado
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('tenants', 'users', 'properties', 'leads', 'lead_properties', 'interactions', 'appointments', 'tasks');

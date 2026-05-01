-- Policies RLS para flujo de registro
-- Ejecuta este SQL en Supabase Dashboard > SQL Editor

-- =============================================================================
-- POLICIES PARA TENANTS
-- =============================================================================

-- Permitir INSERT publico para registro inicial
DROP POLICY IF EXISTS "Allow public insert on tenants" ON tenants;
CREATE POLICY "Allow public insert on tenants" ON tenants
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- POLICIES PARA USERS (tabla de perfiles)
-- =============================================================================

-- Permitir INSERT publico para crear perfil durante registro
DROP POLICY IF EXISTS "Allow public insert on users" ON users;
CREATE POLICY "Allow public insert on users" ON users
  FOR INSERT WITH CHECK (true);

-- Permitir SELECT si el usuario esta autenticado y es su propio registro
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- =============================================================================
-- LIMPIEZA DE POLICIES PROBLEMATICAS
-- =============================================================================

-- Eliminar policies antiguas que causan recursion o errores
DROP POLICY IF EXISTS "Users can view users in their tenant" ON users;
DROP POLICY IF EXISTS "Admins can manage users in their tenant" ON users;
DROP POLICY IF EXISTS "Users can view their tenant" ON tenants;
DROP POLICY IF EXISTS "Users can update their tenant" ON tenants;

-- Reiniciar las policies RLS de las otras tablas
DROP POLICY IF EXISTS "Users can CRUD properties in their tenant" ON properties;
CREATE POLICY "Users can CRUD properties in their tenant" ON properties
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can CRUD leads in their tenant" ON leads;
CREATE POLICY "Users can CRUD leads in their tenant" ON leads
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can CRUD interactions in their tenant" ON interactions;
CREATE POLICY "Users can CRUD interactions in their tenant" ON interactions
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can CRUD appointments in their tenant" ON appointments;
CREATE POLICY "Users can CRUD appointments in their tenant" ON appointments
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can CRUD tasks in their tenant" ON tasks;
CREATE POLICY "Users can CRUD tasks in their tenant" ON tasks
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

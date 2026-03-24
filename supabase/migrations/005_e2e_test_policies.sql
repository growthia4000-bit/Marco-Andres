-- =============================================================================
-- TEMPORARY: Enable public inserts for E2E testing
-- EJECUTA ESTE SQL EN SUPABASE DASHBOARD SQL EDITOR
-- =============================================================================

-- Drop existing insert policies and create permissive ones
DROP POLICY IF EXISTS "tenant_select_policy" ON tenants;
DROP POLICY IF EXISTS "public_insert_tenants" ON tenants;

-- Enable public insert for testing
CREATE POLICY "tenant_insert_public" ON tenants FOR INSERT WITH CHECK (true);
CREATE POLICY "tenant_select_public" ON tenants FOR SELECT USING (true);

-- Enable public insert on users
DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;

CREATE POLICY "users_insert_public" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_select_public" ON users FOR SELECT USING (true);
CREATE POLICY "users_update_public" ON users FOR UPDATE USING (true);

-- Enable public on properties, leads, appointments
DROP POLICY IF EXISTS "properties_policy" ON properties;
DROP POLICY IF EXISTS "leads_policy" ON leads;
DROP POLICY IF EXISTS "appointments_policy" ON appointments;
DROP POLICY IF EXISTS "lead_properties_policy" ON lead_properties;
DROP POLICY IF EXISTS "interactions_policy" ON interactions;
DROP POLICY IF EXISTS "tasks_policy" ON tasks;

CREATE POLICY "properties_all_public" ON properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "leads_all_public" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "appointments_all_public" ON appointments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "lead_properties_all_public" ON lead_properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "interactions_all_public" ON interactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tasks_all_public" ON tasks FOR ALL USING (true) WITH CHECK (true);

SELECT 'Policies updated for E2E testing' AS status;

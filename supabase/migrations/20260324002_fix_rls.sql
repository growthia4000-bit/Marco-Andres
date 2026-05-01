-- Fix RLS para evitar recursión infinita
-- Ejecuta este SQL en Supabase Dashboard > SQL Editor

-- Eliminar las policies problemáticas
DROP POLICY IF EXISTS "Users can view users in their tenant" ON users;
DROP POLICY IF EXISTS "Admins can manage users in their tenant" ON users;
DROP POLICY IF EXISTS "Users can view their tenant" ON tenants;

-- Crear función segura para obtener tenant_id
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id::UUID 
    FROM users 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Nueva policy más simple para users
CREATE POLICY "Users can view all users in their tenant" ON users
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
  );

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (
    id = auth.uid()
  );

-- Policy para tenants
CREATE POLICY "Users can view own tenant" ON tenants
  FOR SELECT USING (
    id = auth_tenant_id()
  );

CREATE POLICY "Admins can update tenant" ON tenants
  FOR UPDATE USING (
    id = auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

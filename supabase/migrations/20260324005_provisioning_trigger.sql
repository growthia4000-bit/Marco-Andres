-- =============================================================================
-- ELIMINAR TODO LO ANTERIOR
-- =============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_new_user();

DROP POLICY IF EXISTS "public_insert_tenants" ON tenants;
DROP POLICY IF EXISTS "Users can view their tenant" ON tenants;
DROP POLICY IF EXISTS "Users can update their tenant" ON tenants;
DROP POLICY IF EXISTS "Allow public insert on tenants" ON tenants;
DROP POLICY IF EXISTS "Users can CRUD tenants in their tenant" ON tenants;

DROP POLICY IF EXISTS "Allow public insert on users" ON users;
DROP POLICY IF EXISTS "Users can view users in their tenant" ON users;
DROP POLICY IF EXISTS "Admins can manage users in their tenant" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "tenant_select" ON tenants;
DROP POLICY IF EXISTS "tenant_update" ON tenants;
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_update" ON users;

-- =============================================================================
-- FUNCION PROVISIONING (SECURITY DEFINER)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant_name TEXT;
  v_tenant_slug TEXT;
  v_full_name TEXT;
  v_slug_base TEXT;
  v_slug TEXT;
  v_counter INTEGER := 0;
  v_slug_exists BOOLEAN := TRUE;
BEGIN
  -- Obtener datos del metadata
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_tenant_name := COALESCE(NEW.raw_user_meta_data->>'tenant_name', 'Mi Inmobiliaria');
  v_tenant_slug := COALESCE(NEW.raw_user_meta_data->>'tenant_slug', '');
  
  -- Si tenant_slug viene vacio, generarlo desde tenant_name
  IF v_tenant_slug = '' OR v_tenant_slug IS NULL THEN
    v_slug_base := LOWER(REGEXP_REPLACE(v_tenant_name, '[^a-z0-9]+', '-', 'g'));
    v_slug_base := TRIM(BOTH '-' FROM v_slug_base);
    v_tenant_slug := v_slug_base;
  END IF;
  
  -- Si slug ya existe, agregar sufijo unico
  v_slug := v_tenant_slug;
  WHILE v_slug_exists LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.tenants WHERE slug = v_slug
    ) INTO v_slug_exists;
    
    IF v_slug_exists THEN
      v_counter := v_counter + 1;
      v_slug := v_tenant_slug || '-' || v_counter;
    END IF;
  END LOOP;
  
  -- Crear tenant
  INSERT INTO public.tenants (name, slug)
  VALUES (v_tenant_name, v_slug)
  RETURNING id INTO v_tenant_id;
  
  -- Crear perfil de usuario
  INSERT INTO public.users (id, tenant_id, email, full_name, role)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_full_name, 'admin');
  
  RETURN NEW;
END;
$$;

-- Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- POLICIES FINALES (sin recursion, sin public insert)
-- =============================================================================
CREATE POLICY "tenant_select_policy" ON public.tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT USING (
    id = auth.uid() OR
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "users_update_policy" ON public.users
  FOR UPDATE USING (
    id = auth.uid() OR
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Policies para otras tablas de negocio (ejemplo properties)
DROP POLICY IF EXISTS "Users can CRUD properties in their tenant" ON properties;
CREATE POLICY "properties_policy" ON public.properties
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can CRUD leads in their tenant" ON leads;
CREATE POLICY "leads_policy" ON public.leads
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can access lead_properties in their tenant" ON lead_properties;
CREATE POLICY "lead_properties_policy" ON public.lead_properties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_properties.lead_id AND l.tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can CRUD interactions in their tenant" ON interactions;
CREATE POLICY "interactions_policy" ON public.interactions
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can CRUD appointments in their tenant" ON appointments;
CREATE POLICY "appointments_policy" ON public.appointments
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can CRUD tasks in their tenant" ON tasks;
CREATE POLICY "tasks_policy" ON public.tasks
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Verificar
SELECT 'OK' AS status, proname FROM pg_proc WHERE proname = 'handle_new_user';
SELECT 'OK' AS status, tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- =============================================================================
-- PHASE 2: RLS HARDENING + SUPERADMIN BYPASS
-- - Keeps current users.tenant_id model as source of truth
-- - Preserves tenant isolation for regular users
-- - Adds secure global bypass for users.global_role = 'superadmin'
-- - Does not modify frontend flows or prior migrations
-- =============================================================================

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.app_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT u.tenant_id
    FROM public.users u
    WHERE u.id = auth.uid()
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT u.role
    FROM public.users u
    WHERE u.id = auth.uid()
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_current_global_role()
RETURNS public.global_role
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT u.global_role
    FROM public.users u
    WHERE u.id = auth.uid()
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.app_current_global_role() = 'superadmin', false);
$$;

CREATE OR REPLACE FUNCTION public.app_same_tenant(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(public.app_is_superadmin() OR public.app_current_tenant_id() = target_tenant_id, false);
$$;

CREATE OR REPLACE FUNCTION public.app_is_tenant_admin(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    public.app_is_superadmin()
    OR (
      public.app_current_tenant_id() = target_tenant_id
      AND public.app_current_user_role() IN ('owner', 'admin')
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_tenant_manager(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    public.app_is_superadmin()
    OR (
      public.app_current_tenant_id() = target_tenant_id
      AND public.app_current_user_role() IN ('owner', 'admin', 'coordinator')
    ),
    false
  );
$$;

-- =============================================================================
-- ENABLE RLS ON PHASE 1 TABLES
-- =============================================================================

ALTER TABLE IF EXISTS public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- ROBUST POLICY CLEANUP FOR MANAGED TABLES
-- =============================================================================

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'tenants',
        'users',
        'properties',
        'leads',
        'interactions',
        'appointments',
        'tasks',
        'lead_properties',
        'invitations',
        'automation_rules',
        'notifications',
        'plans',
        'subscriptions',
        'audit_logs'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END $$;

-- =============================================================================
-- TENANTS
-- =============================================================================

CREATE POLICY "phase2_tenants_select" ON public.tenants
  FOR SELECT USING (public.app_same_tenant(id));

CREATE POLICY "phase2_tenants_update" ON public.tenants
  FOR UPDATE USING (public.app_is_tenant_admin(id))
  WITH CHECK (public.app_is_tenant_admin(id));

-- =============================================================================
-- USERS
-- =============================================================================

CREATE POLICY "phase2_users_select" ON public.users
  FOR SELECT USING (
    public.app_is_superadmin()
    OR tenant_id = public.app_current_tenant_id()
  );

CREATE POLICY "phase2_users_update" ON public.users
  FOR UPDATE USING (
    public.app_is_superadmin()
    OR public.app_is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    public.app_is_superadmin()
    OR public.app_is_tenant_admin(tenant_id)
  );

CREATE POLICY "phase2_users_self_invitation_accept" ON public.users
  FOR UPDATE USING (
    id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.invitations i
      WHERE lower(i.email) = lower(users.email)
        AND i.status = 'pending'
        AND i.expires_at > now()
    )
  )
  WITH CHECK (
    id = auth.uid()
    AND global_role IS NULL
    AND membership_status IN ('active', 'invited')
    AND invited_by IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.invitations i
      WHERE lower(i.email) = lower(users.email)
        AND i.status = 'pending'
        AND i.expires_at > now()
        AND i.tenant_id = users.tenant_id
        AND i.role = users.role::text
    )
  );

-- =============================================================================
-- TENANT-SCOPED BUSINESS TABLES
-- =============================================================================
CREATE POLICY "phase2_properties_all" ON public.properties
  FOR ALL USING (public.app_same_tenant(tenant_id))
  WITH CHECK (public.app_same_tenant(tenant_id));

CREATE POLICY "phase2_leads_all" ON public.leads
  FOR ALL USING (public.app_same_tenant(tenant_id))
  WITH CHECK (public.app_same_tenant(tenant_id));

CREATE POLICY "phase2_interactions_all" ON public.interactions
  FOR ALL USING (public.app_same_tenant(tenant_id))
  WITH CHECK (public.app_same_tenant(tenant_id));

CREATE POLICY "phase2_appointments_all" ON public.appointments
  FOR ALL USING (public.app_same_tenant(tenant_id))
  WITH CHECK (public.app_same_tenant(tenant_id));

CREATE POLICY "phase2_tasks_all" ON public.tasks
  FOR ALL USING (public.app_same_tenant(tenant_id))
  WITH CHECK (public.app_same_tenant(tenant_id));

-- =============================================================================
-- LEAD_PROPERTIES (tenant inherited via related records)
-- =============================================================================

CREATE POLICY "phase2_lead_properties_all" ON public.lead_properties
  FOR ALL USING (
    public.app_is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_properties.lead_id
        AND l.tenant_id = public.app_current_tenant_id()
    )
  )
  WITH CHECK (
    public.app_is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_properties.lead_id
        AND l.tenant_id = public.app_current_tenant_id()
    )
  );

-- =============================================================================
-- INVITATIONS
-- =============================================================================

ALTER TABLE IF EXISTS public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase2_invitations_select" ON public.invitations
  FOR SELECT USING (public.app_same_tenant(tenant_id));

CREATE POLICY "phase2_invitations_insert" ON public.invitations
  FOR INSERT WITH CHECK (public.app_is_tenant_admin(tenant_id));

CREATE POLICY "phase2_invitations_update" ON public.invitations
  FOR UPDATE USING (public.app_is_tenant_admin(tenant_id))
  WITH CHECK (public.app_is_tenant_admin(tenant_id));

CREATE POLICY "phase2_invitations_delete" ON public.invitations
  FOR DELETE USING (public.app_is_tenant_admin(tenant_id));

-- =============================================================================
-- AUTOMATIONS
-- =============================================================================

ALTER TABLE IF EXISTS public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase2_automation_rules_select" ON public.automation_rules
  FOR SELECT USING (public.app_same_tenant(tenant_id));

CREATE POLICY "phase2_automation_rules_insert" ON public.automation_rules
  FOR INSERT WITH CHECK (public.app_is_tenant_manager(tenant_id));

CREATE POLICY "phase2_automation_rules_update" ON public.automation_rules
  FOR UPDATE USING (public.app_is_tenant_manager(tenant_id))
  WITH CHECK (public.app_is_tenant_manager(tenant_id));

CREATE POLICY "phase2_automation_rules_delete" ON public.automation_rules
  FOR DELETE USING (public.app_is_tenant_manager(tenant_id));

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase2_notifications_select" ON public.notifications
  FOR SELECT USING (
    public.app_is_superadmin()
    OR user_id = auth.uid()
  );

CREATE POLICY "phase2_notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    public.app_is_superadmin()
    OR (user_id = auth.uid() AND tenant_id = public.app_current_tenant_id())
  );

CREATE POLICY "phase2_notifications_update" ON public.notifications
  FOR UPDATE USING (
    public.app_is_superadmin()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.app_is_superadmin()
    OR user_id = auth.uid()
  );

CREATE POLICY "phase2_notifications_delete" ON public.notifications
  FOR DELETE USING (
    public.app_is_superadmin()
    OR user_id = auth.uid()
  );

-- =============================================================================
-- PLANS / SUBSCRIPTIONS / AUDIT LOGS
-- =============================================================================

CREATE POLICY "phase2_plans_select" ON public.plans
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "phase2_plans_manage" ON public.plans
  FOR ALL USING (public.app_is_superadmin())
  WITH CHECK (public.app_is_superadmin());

CREATE POLICY "phase2_subscriptions_select" ON public.subscriptions
  FOR SELECT USING (public.app_same_tenant(tenant_id));
CREATE POLICY "phase2_subscriptions_manage" ON public.subscriptions
  FOR ALL USING (public.app_is_superadmin())
  WITH CHECK (public.app_is_superadmin());

CREATE POLICY "phase2_audit_logs_select" ON public.audit_logs
  FOR SELECT USING (
    public.app_is_superadmin()
    OR (
      tenant_id IS NOT NULL
      AND public.app_is_tenant_admin(tenant_id)
    )
  );
CREATE POLICY "phase2_audit_logs_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (
    public.app_is_superadmin()
    OR (
      tenant_id IS NOT NULL
      AND public.app_same_tenant(tenant_id)
    )
  );

-- =============================================================================
-- PHASE 3: SUBSCRIPTIONS LOGIC + CAPACITY VALIDATION
-- - Non-destructive helpers for current plan/subscription lookup
-- - Safe tenant operability checks
-- - Seat/capacity validation helpers without hard enforcement on app flows yet
-- - Compatible with current tenants/users/plans/subscriptions architecture
-- =============================================================================

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_membership_status
  ON public.users(tenant_id, membership_status);

CREATE INDEX IF NOT EXISTS idx_users_tenant_is_active
  ON public.users(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_current_status
  ON public.subscriptions(tenant_id, status)
  WHERE is_current = true;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.app_current_subscription_row(target_tenant_id UUID)
RETURNS public.subscriptions
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.*
  FROM public.subscriptions s
  WHERE s.tenant_id = target_tenant_id
    AND s.is_current = true
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_plan_row(target_tenant_id UUID)
RETURNS public.plans
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.*
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = target_tenant_id
    AND s.is_current = true
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_subscription_status(target_tenant_id UUID)
RETURNS public.subscription_status
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.status
  FROM public.subscriptions s
  WHERE s.tenant_id = target_tenant_id
    AND s.is_current = true
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_plan_slug(target_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.slug
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = target_tenant_id
    AND s.is_current = true
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_effective_max_users(target_tenant_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(s.seats_override, p.max_users)
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = target_tenant_id
    AND s.is_current = true
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_billable_user_count(target_tenant_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.users u
  WHERE u.tenant_id = target_tenant_id
    AND COALESCE(u.membership_status, CASE WHEN u.is_active = false THEN 'inactive'::public.membership_status ELSE 'active'::public.membership_status END)
      IN ('active', 'invited');
$$;

CREATE OR REPLACE FUNCTION public.app_tenant_is_operational(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = target_tenant_id
        AND t.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.tenant_id = target_tenant_id
        AND s.is_current = true
        AND s.status IN ('trial', 'active', 'past_due')
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.app_can_create_more_users(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    public.app_tenant_is_operational(target_tenant_id)
    AND (
      public.app_effective_max_users(target_tenant_id) IS NULL
      OR public.app_billable_user_count(target_tenant_id) < public.app_effective_max_users(target_tenant_id)
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.app_tenant_capacity_snapshot(target_tenant_id UUID)
RETURNS TABLE (
  tenant_id UUID,
  tenant_status public.tenant_operational_status,
  subscription_status public.subscription_status,
  plan_slug TEXT,
  billable_user_count INTEGER,
  max_users INTEGER,
  can_create_more_users BOOLEAN,
  is_operational BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    t.id AS tenant_id,
    t.status AS tenant_status,
    public.app_current_subscription_status(t.id) AS subscription_status,
    public.app_current_plan_slug(t.id) AS plan_slug,
    public.app_billable_user_count(t.id) AS billable_user_count,
    public.app_effective_max_users(t.id) AS max_users,
    public.app_can_create_more_users(t.id) AS can_create_more_users,
    public.app_tenant_is_operational(t.id) AS is_operational
  FROM public.tenants t
  WHERE t.id = target_tenant_id;
$$;

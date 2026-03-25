-- =============================================================================
-- PHASE 1: SAAS FOUNDATION (NON-DESTRUCTIVE, COMPATIBILITY-FIRST)
-- - Reuses existing tenants, users, invitations, and business tables
-- - Adds SaaS foundation tables only
-- - Does not change RLS, frontend, or prior migrations
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'global_role'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.global_role AS ENUM ('superadmin', 'support');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'membership_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.membership_status AS ENUM ('invited', 'active', 'inactive', 'suspended');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'tenant_operational_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.tenant_operational_status AS ENUM ('active', 'inactive', 'suspended');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'subscription_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'past_due', 'canceled', 'suspended');
  END IF;
END $$;

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'assistant';

-- =============================================================================
-- EXISTING TABLE EXTENSIONS
-- =============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS status public.tenant_operational_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS global_role public.global_role,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by UUID,
  ADD COLUMN IF NOT EXISTS membership_status public.membership_status;

UPDATE public.users
SET membership_status = CASE
  WHEN is_active = false THEN 'inactive'::public.membership_status
  ELSE 'active'::public.membership_status
END
WHERE membership_status IS NULL;

ALTER TABLE public.users
  ALTER COLUMN membership_status SET DEFAULT 'active';

ALTER TABLE public.users
  ALTER COLUMN membership_status SET NOT NULL;

-- Support composite ownership validation without changing current source of truth.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_id_tenant_id_unique;

ALTER TABLE public.users
  ADD CONSTRAINT users_id_tenant_id_unique UNIQUE (id, tenant_id);

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_invited_by_fkey;

ALTER TABLE public.users
  ADD CONSTRAINT users_invited_by_fkey
  FOREIGN KEY (invited_by)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_owner_user_id_tenant_fkey;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_owner_user_id_tenant_fkey
  FOREIGN KEY (owner_user_id, id)
  REFERENCES public.users(id, tenant_id)
  ON DELETE RESTRICT;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_status_requires_suspended_at_chk;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_requires_suspended_at_chk CHECK (
    (status <> 'suspended') OR suspended_at IS NOT NULL
  );

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_role_check;

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_role_allowed_chk;

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_allowed_chk CHECK (
    role IN ('owner', 'admin', 'coordinator', 'agent', 'assistant')
  );

-- =============================================================================
-- NEW TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  max_users INTEGER NOT NULL,
  max_properties INTEGER,
  max_leads INTEGER,
  max_storage_mb INTEGER,
  monthly_price_cents INTEGER,
  yearly_price_cents INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plans_slug_not_blank_chk CHECK (btrim(slug) <> ''),
  CONSTRAINT plans_name_not_blank_chk CHECK (btrim(name) <> ''),
  CONSTRAINT plans_max_users_positive_chk CHECK (max_users > 0),
  CONSTRAINT plans_max_properties_positive_chk CHECK (max_properties IS NULL OR max_properties > 0),
  CONSTRAINT plans_max_leads_positive_chk CHECK (max_leads IS NULL OR max_leads > 0),
  CONSTRAINT plans_max_storage_mb_positive_chk CHECK (max_storage_mb IS NULL OR max_storage_mb > 0),
  CONSTRAINT plans_monthly_price_non_negative_chk CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0),
  CONSTRAINT plans_yearly_price_non_negative_chk CHECK (yearly_price_cents IS NULL OR yearly_price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'trial',
  billing_cycle TEXT,
  seats_override INTEGER,
  is_current BOOLEAN NOT NULL DEFAULT true,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscriptions_billing_cycle_chk CHECK (
    billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly')
  ),
  CONSTRAINT subscriptions_seats_override_positive_chk CHECK (
    seats_override IS NULL OR seats_override > 0
  ),
  CONSTRAINT subscriptions_trial_window_chk CHECK (
    trial_ends_at IS NULL OR trial_started_at IS NULL OR trial_ends_at >= trial_started_at
  ),
  CONSTRAINT subscriptions_current_period_window_chk CHECK (
    current_period_end IS NULL OR current_period_start IS NULL OR current_period_end >= current_period_start
  )
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  description TEXT,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_action_not_blank_chk CHECK (btrim(action) <> ''),
  CONSTRAINT audit_logs_entity_type_not_blank_chk CHECK (btrim(entity_type) <> '')
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_owner_user_id ON public.tenants(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_trial_ends_at ON public.tenants(trial_ends_at);

CREATE INDEX IF NOT EXISTS idx_users_global_role ON public.users(global_role);
CREATE INDEX IF NOT EXISTS idx_users_membership_status ON public.users(membership_status);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON public.users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_last_activity_at ON public.users(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_users_invited_by ON public.users(invited_by);

CREATE INDEX IF NOT EXISTS idx_plans_is_active ON public.plans(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON public.subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON public.subscriptions(current_period_end);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_current_provider_customer
  ON public.subscriptions(provider, provider_customer_id)
  WHERE is_current = true
    AND provider IS NOT NULL
    AND provider_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_current_provider_subscription
  ON public.subscriptions(provider, provider_subscription_id)
  WHERE is_current = true
    AND provider IS NOT NULL
    AND provider_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_current_per_tenant
  ON public.subscriptions(tenant_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- =============================================================================
-- UPDATED_AT TRIGGERS FOR NEW TABLES
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at'
      AND n.nspname = 'public'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'plans_updated_at'
    ) THEN
      CREATE TRIGGER plans_updated_at
        BEFORE UPDATE ON public.plans
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'subscriptions_updated_at'
    ) THEN
      CREATE TRIGGER subscriptions_updated_at
        BEFORE UPDATE ON public.subscriptions
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    END IF;
  END IF;
END $$;

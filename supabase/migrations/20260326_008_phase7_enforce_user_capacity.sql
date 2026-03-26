CREATE OR REPLACE FUNCTION public.app_user_is_billable(
  target_membership_status public.membership_status,
  target_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    COALESCE(
      target_membership_status,
      CASE
        WHEN target_is_active = false THEN 'inactive'::public.membership_status
        ELSE 'active'::public.membership_status
      END
    ) IN ('active', 'invited'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_user_capacity_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_is_billable BOOLEAN;
  old_is_billable BOOLEAN;
  needs_capacity_check BOOLEAN := false;
BEGIN
  new_is_billable := public.app_user_is_billable(NEW.membership_status, NEW.is_active);

  IF TG_OP = 'INSERT' THEN
    needs_capacity_check := new_is_billable;
  ELSE
    old_is_billable := public.app_user_is_billable(OLD.membership_status, OLD.is_active);

    IF new_is_billable THEN
      IF NOT old_is_billable THEN
        needs_capacity_check := true;
      ELSIF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        needs_capacity_check := true;
      END IF;
    END IF;
  END IF;

  IF needs_capacity_check AND NOT public.app_can_create_more_users(NEW.tenant_id) THEN
    RAISE EXCEPTION 'PLAN_CAPACITY_EXCEEDED: tenant has reached the maximum number of users for its current plan';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_enforce_capacity_limit ON public.users;

CREATE TRIGGER users_enforce_capacity_limit
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_capacity_limit();

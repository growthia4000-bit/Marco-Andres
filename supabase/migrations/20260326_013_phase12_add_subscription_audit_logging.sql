CREATE OR REPLACE FUNCTION public.audit_subscriptions_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id UUID;
BEGIN
  v_actor_user_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      NEW.tenant_id,
      v_actor_user_id,
      'subscription.created',
      'subscription',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'plan_id', NEW.plan_id,
        'status', NEW.status,
        'billing_cycle', NEW.billing_cycle,
        'is_current', NEW.is_current,
        'trial_started_at', NEW.trial_started_at,
        'trial_ends_at', NEW.trial_ends_at,
        'current_period_start', NEW.current_period_start,
        'current_period_end', NEW.current_period_end,
        'canceled_at', NEW.canceled_at
      )
    );

    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    NEW.tenant_id,
    v_actor_user_id,
    'subscription.updated',
    'subscription',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'plan_id', NEW.plan_id,
      'status', NEW.status,
      'billing_cycle', NEW.billing_cycle,
      'is_current', NEW.is_current,
      'trial_started_at', NEW.trial_started_at,
      'trial_ends_at', NEW.trial_ends_at,
      'current_period_start', NEW.current_period_start,
      'current_period_end', NEW.current_period_end,
      'canceled_at', NEW.canceled_at,
      'changes', jsonb_build_object(
        'tenant_id', jsonb_build_object('old', OLD.tenant_id, 'new', NEW.tenant_id),
        'plan_id', jsonb_build_object('old', OLD.plan_id, 'new', NEW.plan_id),
        'status', jsonb_build_object('old', OLD.status, 'new', NEW.status),
        'billing_cycle', jsonb_build_object('old', OLD.billing_cycle, 'new', NEW.billing_cycle),
        'is_current', jsonb_build_object('old', OLD.is_current, 'new', NEW.is_current),
        'trial_started_at', jsonb_build_object('old', OLD.trial_started_at, 'new', NEW.trial_started_at),
        'trial_ends_at', jsonb_build_object('old', OLD.trial_ends_at, 'new', NEW.trial_ends_at),
        'current_period_start', jsonb_build_object('old', OLD.current_period_start, 'new', NEW.current_period_start),
        'current_period_end', jsonb_build_object('old', OLD.current_period_end, 'new', NEW.current_period_end),
        'canceled_at', jsonb_build_object('old', OLD.canceled_at, 'new', NEW.canceled_at)
      )
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_audit_changes ON public.subscriptions;

CREATE TRIGGER subscriptions_audit_changes
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_subscriptions_changes();

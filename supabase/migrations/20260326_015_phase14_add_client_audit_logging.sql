CREATE OR REPLACE FUNCTION public.audit_clients_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id UUID;
  v_changes JSONB := '{}'::jsonb;
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
      'client.created',
      'client',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'first_name', NEW.first_name,
        'last_name', NEW.last_name,
        'email', NEW.email,
        'phone', NEW.phone,
        'source', NEW.source,
        'status', NEW.status,
        'assigned_to', NEW.assigned_to,
        'preferred_location', NEW.preferred_location,
        'preferred_type', NEW.preferred_type,
        'budget_min', NEW.budget_min,
        'budget_max', NEW.budget_max
      )
    );

    RETURN NEW;
  END IF;

  IF OLD.first_name IS DISTINCT FROM NEW.first_name THEN
    v_changes := v_changes || jsonb_build_object('first_name', jsonb_build_object('old', OLD.first_name, 'new', NEW.first_name));
  END IF;

  IF OLD.last_name IS DISTINCT FROM NEW.last_name THEN
    v_changes := v_changes || jsonb_build_object('last_name', jsonb_build_object('old', OLD.last_name, 'new', NEW.last_name));
  END IF;

  IF OLD.email IS DISTINCT FROM NEW.email THEN
    v_changes := v_changes || jsonb_build_object('email', jsonb_build_object('old', OLD.email, 'new', NEW.email));
  END IF;

  IF OLD.phone IS DISTINCT FROM NEW.phone THEN
    v_changes := v_changes || jsonb_build_object('phone', jsonb_build_object('old', OLD.phone, 'new', NEW.phone));
  END IF;

  IF OLD.source IS DISTINCT FROM NEW.source THEN
    v_changes := v_changes || jsonb_build_object('source', jsonb_build_object('old', OLD.source, 'new', NEW.source));
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    v_changes := v_changes || jsonb_build_object('assigned_to', jsonb_build_object('old', OLD.assigned_to, 'new', NEW.assigned_to));
  END IF;

  IF OLD.preferred_location IS DISTINCT FROM NEW.preferred_location THEN
    v_changes := v_changes || jsonb_build_object('preferred_location', jsonb_build_object('old', OLD.preferred_location, 'new', NEW.preferred_location));
  END IF;

  IF OLD.preferred_type IS DISTINCT FROM NEW.preferred_type THEN
    v_changes := v_changes || jsonb_build_object('preferred_type', jsonb_build_object('old', OLD.preferred_type, 'new', NEW.preferred_type));
  END IF;

  IF OLD.budget_min IS DISTINCT FROM NEW.budget_min THEN
    v_changes := v_changes || jsonb_build_object('budget_min', jsonb_build_object('old', OLD.budget_min, 'new', NEW.budget_min));
  END IF;

  IF OLD.budget_max IS DISTINCT FROM NEW.budget_max THEN
    v_changes := v_changes || jsonb_build_object('budget_max', jsonb_build_object('old', OLD.budget_max, 'new', NEW.budget_max));
  END IF;

  IF v_changes = '{}'::jsonb THEN
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
    'client.updated',
    'client',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'first_name', NEW.first_name,
      'last_name', NEW.last_name,
      'email', NEW.email,
      'phone', NEW.phone,
      'source', NEW.source,
      'status', NEW.status,
      'assigned_to', NEW.assigned_to,
      'preferred_location', NEW.preferred_location,
      'preferred_type', NEW.preferred_type,
      'budget_min', NEW.budget_min,
      'budget_max', NEW.budget_max,
      'changes', v_changes
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_audit_changes ON public.leads;

CREATE TRIGGER leads_audit_changes
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_clients_changes();

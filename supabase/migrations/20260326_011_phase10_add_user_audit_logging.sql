CREATE OR REPLACE FUNCTION public.audit_users_changes()
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
      'user.created',
      'user',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'email', NEW.email,
        'full_name', NEW.full_name,
        'role', NEW.role,
        'global_role', NEW.global_role,
        'is_active', NEW.is_active,
        'membership_status', NEW.membership_status
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
    'user.updated',
    'user',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'email', NEW.email,
      'full_name', NEW.full_name,
      'role', NEW.role,
      'global_role', NEW.global_role,
      'is_active', NEW.is_active,
      'membership_status', NEW.membership_status,
      'changes', jsonb_build_object(
        'tenant_id', jsonb_build_object('old', OLD.tenant_id, 'new', NEW.tenant_id),
        'role', jsonb_build_object('old', OLD.role, 'new', NEW.role),
        'global_role', jsonb_build_object('old', OLD.global_role, 'new', NEW.global_role),
        'is_active', jsonb_build_object('old', OLD.is_active, 'new', NEW.is_active),
        'membership_status', jsonb_build_object('old', OLD.membership_status, 'new', NEW.membership_status),
        'email', jsonb_build_object('old', OLD.email, 'new', NEW.email)
      )
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_audit_changes ON public.users;

CREATE TRIGGER users_audit_changes
  AFTER INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_users_changes();

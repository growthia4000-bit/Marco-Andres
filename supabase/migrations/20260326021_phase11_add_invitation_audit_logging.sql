CREATE OR REPLACE FUNCTION public.audit_invitations_changes()
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
      'invitation.created',
      'invitation',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'email', NEW.email,
        'role', NEW.role,
        'status', NEW.status,
        'invited_by', NEW.invited_by,
        'expires_at', NEW.expires_at,
        'accepted_at', NEW.accepted_at
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
    'invitation.updated',
    'invitation',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'email', NEW.email,
      'role', NEW.role,
      'status', NEW.status,
      'invited_by', NEW.invited_by,
      'expires_at', NEW.expires_at,
      'accepted_at', NEW.accepted_at,
      'changes', jsonb_build_object(
        'tenant_id', jsonb_build_object('old', OLD.tenant_id, 'new', NEW.tenant_id),
        'email', jsonb_build_object('old', OLD.email, 'new', NEW.email),
        'role', jsonb_build_object('old', OLD.role, 'new', NEW.role),
        'status', jsonb_build_object('old', OLD.status, 'new', NEW.status),
        'invited_by', jsonb_build_object('old', OLD.invited_by, 'new', NEW.invited_by)
      )
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invitations_audit_changes ON public.invitations;

CREATE TRIGGER invitations_audit_changes
  AFTER INSERT OR UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_invitations_changes();

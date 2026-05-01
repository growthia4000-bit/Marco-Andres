CREATE OR REPLACE FUNCTION public.audit_notifications_changes()
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
      'notification.created',
      'notification',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'user_id', NEW.user_id,
        'type', NEW.type,
        'title', NEW.title,
        'message', NEW.message,
        'data', NEW.data,
        'is_read', NEW.is_read
      )
    );

    RETURN NEW;
  END IF;

  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    v_changes := v_changes || jsonb_build_object('user_id', jsonb_build_object('old', OLD.user_id, 'new', NEW.user_id));
  END IF;

  IF OLD.type IS DISTINCT FROM NEW.type THEN
    v_changes := v_changes || jsonb_build_object('type', jsonb_build_object('old', OLD.type, 'new', NEW.type));
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', OLD.title, 'new', NEW.title));
  END IF;

  IF OLD.message IS DISTINCT FROM NEW.message THEN
    v_changes := v_changes || jsonb_build_object('message', jsonb_build_object('old', OLD.message, 'new', NEW.message));
  END IF;

  IF OLD.data IS DISTINCT FROM NEW.data THEN
    v_changes := v_changes || jsonb_build_object('data', jsonb_build_object('old', OLD.data, 'new', NEW.data));
  END IF;

  IF OLD.is_read IS DISTINCT FROM NEW.is_read THEN
    v_changes := v_changes || jsonb_build_object('is_read', jsonb_build_object('old', OLD.is_read, 'new', NEW.is_read));
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
    'notification.updated',
    'notification',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'user_id', NEW.user_id,
      'type', NEW.type,
      'title', NEW.title,
      'message', NEW.message,
      'data', NEW.data,
      'is_read', NEW.is_read,
      'changes', v_changes
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_audit_changes ON public.notifications;

CREATE TRIGGER notifications_audit_changes
  AFTER INSERT OR UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_notifications_changes();

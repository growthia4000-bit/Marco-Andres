CREATE OR REPLACE FUNCTION public.audit_tasks_changes()
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
      'task.created',
      'task',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'user_id', NEW.user_id,
        'lead_id', NEW.lead_id,
        'property_id', NEW.property_id,
        'title', NEW.title,
        'description', NEW.description,
        'priority', NEW.priority,
        'due_date', NEW.due_date,
        'completed', NEW.completed,
        'completed_at', NEW.completed_at
      )
    );

    RETURN NEW;
  END IF;

  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    v_changes := v_changes || jsonb_build_object('user_id', jsonb_build_object('old', OLD.user_id, 'new', NEW.user_id));
  END IF;

  IF OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN
    v_changes := v_changes || jsonb_build_object('lead_id', jsonb_build_object('old', OLD.lead_id, 'new', NEW.lead_id));
  END IF;

  IF OLD.property_id IS DISTINCT FROM NEW.property_id THEN
    v_changes := v_changes || jsonb_build_object('property_id', jsonb_build_object('old', OLD.property_id, 'new', NEW.property_id));
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', OLD.title, 'new', NEW.title));
  END IF;

  IF OLD.description IS DISTINCT FROM NEW.description THEN
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('old', OLD.description, 'new', NEW.description));
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    v_changes := v_changes || jsonb_build_object('priority', jsonb_build_object('old', OLD.priority, 'new', NEW.priority));
  END IF;

  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    v_changes := v_changes || jsonb_build_object('due_date', jsonb_build_object('old', OLD.due_date, 'new', NEW.due_date));
  END IF;

  IF OLD.completed IS DISTINCT FROM NEW.completed THEN
    v_changes := v_changes || jsonb_build_object('completed', jsonb_build_object('old', OLD.completed, 'new', NEW.completed));
  END IF;

  IF OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
    v_changes := v_changes || jsonb_build_object('completed_at', jsonb_build_object('old', OLD.completed_at, 'new', NEW.completed_at));
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
    'task.updated',
    'task',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'user_id', NEW.user_id,
      'lead_id', NEW.lead_id,
      'property_id', NEW.property_id,
      'title', NEW.title,
      'description', NEW.description,
      'priority', NEW.priority,
      'due_date', NEW.due_date,
      'completed', NEW.completed,
      'completed_at', NEW.completed_at,
      'changes', v_changes
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_audit_changes ON public.tasks;

CREATE TRIGGER tasks_audit_changes
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_tasks_changes();

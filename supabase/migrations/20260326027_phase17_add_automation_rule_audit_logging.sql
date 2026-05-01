CREATE OR REPLACE FUNCTION public.audit_automation_rules_changes()
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
      'automation_rule.created',
      'automation_rule',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'name', NEW.name,
        'description', NEW.description,
        'trigger_type', NEW.trigger_type,
        'action_type', NEW.action_type,
        'config', NEW.config,
        'is_active', NEW.is_active,
        'created_by', NEW.created_by
      )
    );

    RETURN NEW;
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', OLD.name, 'new', NEW.name));
  END IF;

  IF OLD.description IS DISTINCT FROM NEW.description THEN
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('old', OLD.description, 'new', NEW.description));
  END IF;

  IF OLD.trigger_type IS DISTINCT FROM NEW.trigger_type THEN
    v_changes := v_changes || jsonb_build_object('trigger_type', jsonb_build_object('old', OLD.trigger_type, 'new', NEW.trigger_type));
  END IF;

  IF OLD.action_type IS DISTINCT FROM NEW.action_type THEN
    v_changes := v_changes || jsonb_build_object('action_type', jsonb_build_object('old', OLD.action_type, 'new', NEW.action_type));
  END IF;

  IF OLD.config IS DISTINCT FROM NEW.config THEN
    v_changes := v_changes || jsonb_build_object('config', jsonb_build_object('old', OLD.config, 'new', NEW.config));
  END IF;

  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('old', OLD.is_active, 'new', NEW.is_active));
  END IF;

  IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    v_changes := v_changes || jsonb_build_object('created_by', jsonb_build_object('old', OLD.created_by, 'new', NEW.created_by));
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
    'automation_rule.updated',
    'automation_rule',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'name', NEW.name,
      'description', NEW.description,
      'trigger_type', NEW.trigger_type,
      'action_type', NEW.action_type,
      'config', NEW.config,
      'is_active', NEW.is_active,
      'created_by', NEW.created_by,
      'changes', v_changes
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automation_rules_audit_changes ON public.automation_rules;

CREATE TRIGGER automation_rules_audit_changes
  AFTER INSERT OR UPDATE ON public.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_automation_rules_changes();

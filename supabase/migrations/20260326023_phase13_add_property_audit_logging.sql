CREATE OR REPLACE FUNCTION public.audit_properties_changes()
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
      'property.created',
      'property',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'title', NEW.title,
        'property_type', NEW.property_type,
        'deal_type', NEW.deal_type,
        'price', NEW.price,
        'city', NEW.city,
        'status', NEW.status,
        'agent_id', NEW.agent_id
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
    'property.updated',
    'property',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'title', NEW.title,
      'property_type', NEW.property_type,
      'deal_type', NEW.deal_type,
      'price', NEW.price,
      'city', NEW.city,
      'status', NEW.status,
      'agent_id', NEW.agent_id,
      'changes', jsonb_build_object(
        'tenant_id', jsonb_build_object('old', OLD.tenant_id, 'new', NEW.tenant_id),
        'title', jsonb_build_object('old', OLD.title, 'new', NEW.title),
        'property_type', jsonb_build_object('old', OLD.property_type, 'new', NEW.property_type),
        'deal_type', jsonb_build_object('old', OLD.deal_type, 'new', NEW.deal_type),
        'price', jsonb_build_object('old', OLD.price, 'new', NEW.price),
        'city', jsonb_build_object('old', OLD.city, 'new', NEW.city),
        'status', jsonb_build_object('old', OLD.status, 'new', NEW.status),
        'agent_id', jsonb_build_object('old', OLD.agent_id, 'new', NEW.agent_id)
      )
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_audit_changes ON public.properties;

CREATE TRIGGER properties_audit_changes
  AFTER INSERT OR UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_properties_changes();

CREATE OR REPLACE FUNCTION public.audit_appointments_changes()
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
      'appointment.created',
      'appointment',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'lead_id', NEW.lead_id,
        'property_id', NEW.property_id,
        'user_id', NEW.user_id,
        'title', NEW.title,
        'description', NEW.description,
        'appointment_type', NEW.appointment_type,
        'status', NEW.status,
        'start_time', NEW.start_time,
        'end_time', NEW.end_time,
        'location', NEW.location,
        'notes', NEW.notes,
        'reminder_sent', NEW.reminder_sent
      )
    );

    RETURN NEW;
  END IF;

  IF OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN
    v_changes := v_changes || jsonb_build_object('lead_id', jsonb_build_object('old', OLD.lead_id, 'new', NEW.lead_id));
  END IF;

  IF OLD.property_id IS DISTINCT FROM NEW.property_id THEN
    v_changes := v_changes || jsonb_build_object('property_id', jsonb_build_object('old', OLD.property_id, 'new', NEW.property_id));
  END IF;

  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    v_changes := v_changes || jsonb_build_object('user_id', jsonb_build_object('old', OLD.user_id, 'new', NEW.user_id));
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    v_changes := v_changes || jsonb_build_object('title', jsonb_build_object('old', OLD.title, 'new', NEW.title));
  END IF;

  IF OLD.description IS DISTINCT FROM NEW.description THEN
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('old', OLD.description, 'new', NEW.description));
  END IF;

  IF OLD.appointment_type IS DISTINCT FROM NEW.appointment_type THEN
    v_changes := v_changes || jsonb_build_object('appointment_type', jsonb_build_object('old', OLD.appointment_type, 'new', NEW.appointment_type));
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
  END IF;

  IF OLD.start_time IS DISTINCT FROM NEW.start_time THEN
    v_changes := v_changes || jsonb_build_object('start_time', jsonb_build_object('old', OLD.start_time, 'new', NEW.start_time));
  END IF;

  IF OLD.end_time IS DISTINCT FROM NEW.end_time THEN
    v_changes := v_changes || jsonb_build_object('end_time', jsonb_build_object('old', OLD.end_time, 'new', NEW.end_time));
  END IF;

  IF OLD.location IS DISTINCT FROM NEW.location THEN
    v_changes := v_changes || jsonb_build_object('location', jsonb_build_object('old', OLD.location, 'new', NEW.location));
  END IF;

  IF OLD.notes IS DISTINCT FROM NEW.notes THEN
    v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('old', OLD.notes, 'new', NEW.notes));
  END IF;

  IF OLD.reminder_sent IS DISTINCT FROM NEW.reminder_sent THEN
    v_changes := v_changes || jsonb_build_object('reminder_sent', jsonb_build_object('old', OLD.reminder_sent, 'new', NEW.reminder_sent));
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
    'appointment.updated',
    'appointment',
    NEW.id,
      jsonb_build_object(
        'event_type', 'UPDATE',
        'lead_id', NEW.lead_id,
        'property_id', NEW.property_id,
        'user_id', NEW.user_id,
        'title', NEW.title,
        'description', NEW.description,
        'appointment_type', NEW.appointment_type,
        'status', NEW.status,
        'start_time', NEW.start_time,
        'end_time', NEW.end_time,
        'location', NEW.location,
        'notes', NEW.notes,
        'reminder_sent', NEW.reminder_sent,
        'changes', v_changes
      )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_audit_changes ON public.appointments;

CREATE TRIGGER appointments_audit_changes
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_appointments_changes();

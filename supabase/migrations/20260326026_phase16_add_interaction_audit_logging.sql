CREATE OR REPLACE FUNCTION public.audit_interactions_changes()
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
      'interaction.created',
      'interaction',
      NEW.id,
      jsonb_build_object(
        'event_type', 'INSERT',
        'lead_id', NEW.lead_id,
        'user_id', NEW.user_id,
        'type', NEW.type,
        'subject', NEW.subject,
        'content', NEW.content,
        'audio_url', NEW.audio_url,
        'transcription', NEW.transcription,
        'outcome', NEW.outcome,
        'next_action', NEW.next_action,
        'next_action_date', NEW.next_action_date
      )
    );

    RETURN NEW;
  END IF;

  IF OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN
    v_changes := v_changes || jsonb_build_object('lead_id', jsonb_build_object('old', OLD.lead_id, 'new', NEW.lead_id));
  END IF;

  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    v_changes := v_changes || jsonb_build_object('user_id', jsonb_build_object('old', OLD.user_id, 'new', NEW.user_id));
  END IF;

  IF OLD.type IS DISTINCT FROM NEW.type THEN
    v_changes := v_changes || jsonb_build_object('type', jsonb_build_object('old', OLD.type, 'new', NEW.type));
  END IF;

  IF OLD.subject IS DISTINCT FROM NEW.subject THEN
    v_changes := v_changes || jsonb_build_object('subject', jsonb_build_object('old', OLD.subject, 'new', NEW.subject));
  END IF;

  IF OLD.content IS DISTINCT FROM NEW.content THEN
    v_changes := v_changes || jsonb_build_object('content', jsonb_build_object('old', OLD.content, 'new', NEW.content));
  END IF;

  IF OLD.audio_url IS DISTINCT FROM NEW.audio_url THEN
    v_changes := v_changes || jsonb_build_object('audio_url', jsonb_build_object('old', OLD.audio_url, 'new', NEW.audio_url));
  END IF;

  IF OLD.transcription IS DISTINCT FROM NEW.transcription THEN
    v_changes := v_changes || jsonb_build_object('transcription', jsonb_build_object('old', OLD.transcription, 'new', NEW.transcription));
  END IF;

  IF OLD.outcome IS DISTINCT FROM NEW.outcome THEN
    v_changes := v_changes || jsonb_build_object('outcome', jsonb_build_object('old', OLD.outcome, 'new', NEW.outcome));
  END IF;

  IF OLD.next_action IS DISTINCT FROM NEW.next_action THEN
    v_changes := v_changes || jsonb_build_object('next_action', jsonb_build_object('old', OLD.next_action, 'new', NEW.next_action));
  END IF;

  IF OLD.next_action_date IS DISTINCT FROM NEW.next_action_date THEN
    v_changes := v_changes || jsonb_build_object('next_action_date', jsonb_build_object('old', OLD.next_action_date, 'new', NEW.next_action_date));
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
    'interaction.updated',
    'interaction',
    NEW.id,
    jsonb_build_object(
      'event_type', 'UPDATE',
      'lead_id', NEW.lead_id,
      'user_id', NEW.user_id,
      'type', NEW.type,
      'subject', NEW.subject,
      'content', NEW.content,
      'audio_url', NEW.audio_url,
      'transcription', NEW.transcription,
      'outcome', NEW.outcome,
      'next_action', NEW.next_action,
      'next_action_date', NEW.next_action_date,
      'changes', v_changes
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interactions_audit_changes ON public.interactions;

CREATE TRIGGER interactions_audit_changes
  AFTER INSERT OR UPDATE ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_interactions_changes();

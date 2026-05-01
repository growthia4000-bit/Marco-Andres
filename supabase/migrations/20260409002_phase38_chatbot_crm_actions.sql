-- Phase 38: CRM action persistence for chatbot follow-up

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'general_task',
  ADD COLUMN IF NOT EXISTS action_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS next_step TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tasks_conversation_id ON public.tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_action_type ON public.tasks(action_type);
CREATE INDEX IF NOT EXISTS idx_tasks_action_status ON public.tasks(action_status);
CREATE INDEX IF NOT EXISTS idx_tasks_open_chatbot_action ON public.tasks(tenant_id, conversation_id, action_type)
  WHERE source = 'chatbot' AND completed = false;

UPDATE public.tasks
SET action_type = COALESCE(NULLIF(action_type, ''), 'general_task'),
    action_status = CASE WHEN completed THEN 'completed' ELSE 'pending' END,
    source = COALESCE(NULLIF(source, ''), 'manual'),
    metadata = COALESCE(metadata, '{}'::jsonb)
WHERE action_type IS NULL OR action_type = '' OR action_status IS NULL OR action_status = '' OR source IS NULL OR source = '' OR metadata IS NULL;

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
        'conversation_id', NEW.conversation_id,
        'title', NEW.title,
        'description', NEW.description,
        'priority', NEW.priority,
        'due_date', NEW.due_date,
        'completed', NEW.completed,
        'completed_at', NEW.completed_at,
        'action_type', NEW.action_type,
        'action_status', NEW.action_status,
        'source', NEW.source,
        'reason', NEW.reason,
        'next_step', NEW.next_step,
        'metadata', NEW.metadata
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

  IF OLD.conversation_id IS DISTINCT FROM NEW.conversation_id THEN
    v_changes := v_changes || jsonb_build_object('conversation_id', jsonb_build_object('old', OLD.conversation_id, 'new', NEW.conversation_id));
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

  IF OLD.action_type IS DISTINCT FROM NEW.action_type THEN
    v_changes := v_changes || jsonb_build_object('action_type', jsonb_build_object('old', OLD.action_type, 'new', NEW.action_type));
  END IF;

  IF OLD.action_status IS DISTINCT FROM NEW.action_status THEN
    v_changes := v_changes || jsonb_build_object('action_status', jsonb_build_object('old', OLD.action_status, 'new', NEW.action_status));
  END IF;

  IF OLD.source IS DISTINCT FROM NEW.source THEN
    v_changes := v_changes || jsonb_build_object('source', jsonb_build_object('old', OLD.source, 'new', NEW.source));
  END IF;

  IF OLD.reason IS DISTINCT FROM NEW.reason THEN
    v_changes := v_changes || jsonb_build_object('reason', jsonb_build_object('old', OLD.reason, 'new', NEW.reason));
  END IF;

  IF OLD.next_step IS DISTINCT FROM NEW.next_step THEN
    v_changes := v_changes || jsonb_build_object('next_step', jsonb_build_object('old', OLD.next_step, 'new', NEW.next_step));
  END IF;

  IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN
    v_changes := v_changes || jsonb_build_object('metadata', jsonb_build_object('old', OLD.metadata, 'new', NEW.metadata));
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
      'conversation_id', NEW.conversation_id,
      'title', NEW.title,
      'description', NEW.description,
      'priority', NEW.priority,
      'due_date', NEW.due_date,
      'completed', NEW.completed,
      'completed_at', NEW.completed_at,
      'action_type', NEW.action_type,
      'action_status', NEW.action_status,
      'source', NEW.source,
      'reason', NEW.reason,
      'next_step', NEW.next_step,
      'metadata', NEW.metadata,
      'changes', v_changes
    )
  );

  RETURN NEW;
END;
$$;

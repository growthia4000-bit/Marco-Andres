-- Phase 36: Conversational core + automation events
-- Tables: conversations, conversation_messages, conversation_participants, automation_events

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE conversation_channel AS ENUM (
  'email',
  'whatsapp',
  'chatbot',
  'internal',
  'web_form'
);

CREATE TYPE conversation_status AS ENUM (
  'open',
  'waiting',
  'resolved',
  'archived'
);

CREATE TYPE message_direction AS ENUM (
  'inbound',
  'outbound'
);

CREATE TYPE message_status AS ENUM (
  'draft',
  'sent',
  'delivered',
  'read',
  'failed'
);

-- =============================================================================
-- CONVERSATIONS
-- =============================================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  subject TEXT,
  channel conversation_channel NOT NULL DEFAULT 'internal',
  status conversation_status NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- =============================================================================
-- CONVERSATION MESSAGES
-- =============================================================================
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id),
  direction message_direction NOT NULL DEFAULT 'outbound',
  channel conversation_channel NOT NULL DEFAULT 'internal',
  status message_status NOT NULL DEFAULT 'sent',
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB NOT NULL DEFAULT '{}',
  is_automated BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_messages_conversation ON conversation_messages(conversation_id);
CREATE INDEX idx_conv_messages_tenant ON conversation_messages(tenant_id);
CREATE INDEX idx_conv_messages_created ON conversation_messages(created_at DESC);

-- =============================================================================
-- CONVERSATION PARTICIPANTS
-- =============================================================================
CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  role TEXT NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ
);

CREATE INDEX idx_conv_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_conv_participants_user ON conversation_participants(user_id);

-- =============================================================================
-- AUTOMATION EVENTS (event bus for future automation)
-- =============================================================================
CREATE TABLE automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  actor_user_id UUID REFERENCES users(id),
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auto_events_tenant ON automation_events(tenant_id);
CREATE INDEX idx_auto_events_type ON automation_events(event_type);
CREATE INDEX idx_auto_events_unprocessed ON automation_events(processed) WHERE processed = false;
CREATE INDEX idx_auto_events_created ON automation_events(created_at DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update conversation last_message_at on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.content, 120)
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_conversation_last_message
  AFTER INSERT ON conversation_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;

-- Conversations: tenant isolation
CREATE POLICY "conversations_select" ON conversations
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "conversations_insert" ON conversations
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "conversations_update" ON conversations
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "conversations_delete" ON conversations
  FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Messages: tenant isolation
CREATE POLICY "conv_messages_select" ON conversation_messages
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "conv_messages_insert" ON conversation_messages
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Participants: via conversation
CREATE POLICY "conv_participants_select" ON conversation_participants
  FOR SELECT USING (conversation_id IN (SELECT id FROM conversations WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())));

CREATE POLICY "conv_participants_insert" ON conversation_participants
  FOR INSERT WITH CHECK (conversation_id IN (SELECT id FROM conversations WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())));

CREATE POLICY "conv_participants_update" ON conversation_participants
  FOR UPDATE USING (conversation_id IN (SELECT id FROM conversations WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())));

-- Automation events: tenant isolation
CREATE POLICY "auto_events_select" ON automation_events
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "auto_events_insert" ON automation_events
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

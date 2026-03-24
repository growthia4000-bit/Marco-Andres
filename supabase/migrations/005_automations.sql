-- Automation rules table
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'appointment_reminder',
    'lead_followup',
    'property_status_change',
    'daily_summary',
    'weekly_report'
  )),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'email_notification',
    'in_app_notification',
    'update_status',
    'create_task'
  )),
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS automation_rules_tenant_idx ON automation_rules(tenant_id);
CREATE INDEX IF NOT EXISTS automation_rules_active_idx ON automation_rules(is_active);

-- RLS for automation_rules
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see rules for their tenant
CREATE POLICY "automation_rules_select" ON automation_rules
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Only admins and coordinators can manage rules
CREATE POLICY "automation_rules_insert" ON automation_rules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND tenant_id = automation_rules.tenant_id 
      AND role IN ('admin', 'coordinator')
    )
  );

CREATE POLICY "automation_rules_update" ON automation_rules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND tenant_id = automation_rules.tenant_id 
      AND role IN ('admin', 'coordinator')
    )
  );

CREATE POLICY "automation_rules_delete" ON automation_rules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND tenant_id = automation_rules.tenant_id 
      AND role IN ('admin', 'coordinator')
    )
  );

-- Notifications table for in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id) WHERE is_read = false;

-- RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notifications
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- Policy: System can insert notifications
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Policy: Users can update (mark as read) their own notifications
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

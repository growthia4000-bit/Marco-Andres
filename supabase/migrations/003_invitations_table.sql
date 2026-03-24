-- Invitations table for team member invitations
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'coordinator', 'agent')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for looking up invitations by token and email
CREATE INDEX IF NOT EXISTS invitations_token_idx ON invitations(token);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(email);
CREATE INDEX IF NOT EXISTS invitations_tenant_idx ON invitations(tenant_id);

-- RLS for invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see invitations for their tenant
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Only admins can create invitations
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND tenant_id = invitations.tenant_id 
      AND role = 'admin'
    )
  );

-- Policy: Only admins can delete (cancel) invitations
CREATE POLICY "invitations_delete" ON invitations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND tenant_id = invitations.tenant_id 
      AND role = 'admin'
    )
  );

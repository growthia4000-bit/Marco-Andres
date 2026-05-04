-- Migration: tenant_email_configs for Microsoft Graph OAuth
-- Date: 2026-05-04
-- Purpose: Store per-tenant Microsoft Graph OAuth connections

CREATE TABLE IF NOT EXISTS tenant_email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'microsoft_graph',
  email_address VARCHAR(255) NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  last_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_email_configs_tenant_provider UNIQUE(tenant_id, provider),
  CONSTRAINT tenant_email_configs_has_encryption_key CHECK (
    access_token_encrypted != '' AND refresh_token_encrypted != ''
  )
);

ALTER TABLE tenant_email_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (fixed syntax)
DROP POLICY IF EXISTS "tenant_email_configs_select_own" ON tenant_email_configs;
DROP POLICY IF EXISTS "tenant_email_configs_insert_own" ON tenant_email_configs;
DROP POLICY IF EXISTS "tenant_email_configs_update_own" ON tenant_email_configs;
DROP POLICY IF EXISTS "tenant_email_configs_delete_own" ON tenant_email_configs;

CREATE POLICY "tenant_email_configs_select_own" ON tenant_email_configs
  FOR SELECT USING (auth.uid() IN (SELECT id FROM users WHERE tenant_id = tenant_email_configs.tenant_id AND role = 'admin'));

CREATE POLICY "tenant_email_configs_insert_own" ON tenant_email_configs
  FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM users WHERE tenant_id = tenant_email_configs.tenant_id AND role = 'admin'));

CREATE POLICY "tenant_email_configs_update_own" ON tenant_email_configs
  FOR UPDATE USING (auth.uid() IN (SELECT id FROM users WHERE tenant_id = tenant_email_configs.tenant_id AND role = 'admin'));

CREATE POLICY "tenant_email_configs_delete_own" ON tenant_email_configs
  FOR DELETE USING (auth.uid() IN (SELECT id FROM users WHERE tenant_id = tenant_email_configs.tenant_id AND role = 'admin'));

-- Service role policies for system operations
CREATE POLICY "tenant_email_configs_service_select" ON tenant_email_configs
  FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY "tenant_email_configs_service_update" ON tenant_email_configs
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "tenant_email_configs_service_insert" ON tenant_email_configs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Indexes
DROP INDEX IF EXISTS idx_tenant_email_configs_tenant_id;
DROP INDEX IF EXISTS idx_tenant_email_configs_status;
DROP INDEX IF EXISTS idx_tenant_email_configs_email;

CREATE INDEX IF NOT EXISTS idx_tenant_email_configs_tenant_id ON tenant_email_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_email_configs_status ON tenant_email_configs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_email_configs_email ON tenant_email_configs(tenant_id, email_address);
CREATE INDEX IF NOT EXISTS idx_tenant_email_configs_expires ON tenant_email_configs(expires_at) WHERE status = 'active';
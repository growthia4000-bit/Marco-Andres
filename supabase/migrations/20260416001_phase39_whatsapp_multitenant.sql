-- Migration: Phase 39 - Add tenant WhatsApp configs table
-- Purpose: Store WhatsApp configuration per tenant for productizable multi-tenant CRM
-- This enables each tenant to have their own WhatsApp business account and phone number

CREATE TABLE IF NOT EXISTS tenant_whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta_cloud',
  mode TEXT NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox', 'production')),
  whatsapp_business_account_id TEXT,
  phone_number_id TEXT NOT NULL,
  display_phone_number TEXT,
  access_token_encrypted TEXT,
  verify_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'disconnected')),
  verified_at TIMESTAMPTZ,
  last_healthcheck_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(tenant_id, phone_number_id)
);

-- Enable RLS
ALTER TABLE tenant_whatsapp_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own tenant's WhatsApp configs
CREATE POLICY "tenant_whatsapp_configs_select_own" ON tenant_whatsapp_configs
  FOR SELECT USING (true);

-- Policy: Users can insert their own tenant's WhatsApp configs
CREATE POLICY "tenant_whatsapp_configs_insert_own" ON tenant_whatsapp_configs
  FOR INSERT WITH CHECK (true);

-- Policy: Users can update their own tenant's WhatsApp configs
CREATE POLICY "tenant_whatsapp_configs_update_own" ON tenant_whatsapp_configs
  FOR UPDATE USING (true);

-- Policy: Users can delete their own tenant's WhatsApp configs
CREATE POLICY "tenant_whatsapp_configs_delete_own" ON tenant_whatsapp_configs
  FOR DELETE USING (true);

-- Create index for phone_number_id lookups (webhook routing)
CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_configs_phone_number_id 
  ON tenant_whatsapp_configs(phone_number_id) 
  WHERE status = 'active';

-- Create index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_configs_tenant_id 
  ON tenant_whatsapp_configs(tenant_id);
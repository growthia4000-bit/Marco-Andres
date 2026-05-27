-- Fix: Allow users to read their own record directly
-- This fixes the "perfil comercial" error after login

-- Update the SELECT policy to allow users to read their own record
-- regardless of tenant_id resolution
DROP POLICY IF EXISTS "phase2_users_select" ON public.users;

CREATE POLICY "phase2_users_select" ON public.users
  FOR SELECT USING (
    public.app_is_superadmin()
    OR id = auth.uid()
    OR tenant_id = public.app_current_tenant_id()
  );
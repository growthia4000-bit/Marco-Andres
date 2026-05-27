-- Get current user profile without RLS dependency
-- Used for post-login profile resolution

CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  email TEXT,
  full_name TEXT,
  global_role TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.tenant_id,
    u.email,
    u.full_name,
    u.global_role::TEXT,
    u.role::TEXT
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
END
$$;
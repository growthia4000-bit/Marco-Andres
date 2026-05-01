CREATE OR REPLACE FUNCTION public.app_verify_invitation(invitation_token TEXT)
RETURNS TABLE (
  id UUID,
  token TEXT,
  email TEXT,
  role TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  tenant_id UUID,
  tenant_name TEXT,
  tenant_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.token,
    i.email,
    i.role,
    i.status,
    i.expires_at,
    i.tenant_id,
    t.name AS tenant_name,
    t.status::TEXT AS tenant_status
  FROM public.invitations i
  INNER JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.token = invitation_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.app_verify_invitation(TEXT) TO anon, authenticated;

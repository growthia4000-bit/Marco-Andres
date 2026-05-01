CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_tenant_name TEXT;
  v_tenant_slug TEXT;
  v_full_name TEXT;
  v_slug_base TEXT;
  v_slug TEXT;
  v_counter INTEGER := 0;
  v_slug_exists BOOLEAN := TRUE;
  v_invite_token TEXT;
  v_invitation_id UUID;
  v_invitation_tenant_id UUID;
  v_invitation_role TEXT;
  v_invitation_status TEXT;
  v_invitation_expires_at TIMESTAMPTZ;
  v_invitation_email TEXT;
  v_invited_by UUID;
  v_tenant_status public.tenant_operational_status;
BEGIN
  v_full_name := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  v_invite_token := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'invite_token', '')), '');

  IF v_invite_token IS NOT NULL THEN
    SELECT
      i.id,
      i.tenant_id,
      i.role,
      i.status,
      i.expires_at,
      i.email,
      i.invited_by,
      t.status
    INTO
      v_invitation_id,
      v_invitation_tenant_id,
      v_invitation_role,
      v_invitation_status,
      v_invitation_expires_at,
      v_invitation_email,
      v_invited_by,
      v_tenant_status
    FROM public.invitations i
    INNER JOIN public.tenants t ON t.id = i.tenant_id
    WHERE i.token = v_invite_token
    LIMIT 1;

    IF v_invitation_id IS NULL THEN
      RAISE EXCEPTION 'INVITE_NOT_FOUND: invitation token is invalid';
    END IF;

    IF LOWER(COALESCE(v_invitation_email, '')) <> LOWER(COALESCE(NEW.email, '')) THEN
      RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH: invitation email does not match the new user';
    END IF;

    IF v_invitation_status <> 'pending' THEN
      RAISE EXCEPTION 'INVITE_ALREADY_USED: invitation is no longer pending';
    END IF;

    IF v_invitation_expires_at < NOW() THEN
      RAISE EXCEPTION 'INVITE_EXPIRED: invitation has expired';
    END IF;

    IF v_tenant_status = 'suspended' THEN
      RAISE EXCEPTION 'TENANT_SUSPENDED: tenant is suspended';
    END IF;

    IF v_tenant_status = 'inactive' THEN
      RAISE EXCEPTION 'TENANT_INACTIVE: tenant is inactive';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM unnest(enum_range(NULL::public.user_role)) AS allowed_role
      WHERE allowed_role::TEXT = v_invitation_role
    ) THEN
      RAISE EXCEPTION 'INVITE_ROLE_INVALID: invitation role is not assignable';
    END IF;

    IF NOT public.app_can_create_more_users(v_invitation_tenant_id) THEN
      RAISE EXCEPTION 'PLAN_CAPACITY_EXCEEDED: tenant has reached the maximum number of users for its current plan';
    END IF;

    INSERT INTO public.users (id, tenant_id, email, full_name, role, is_active, invited_by, membership_status)
    VALUES (
      NEW.id,
      v_invitation_tenant_id,
      NEW.email,
      v_full_name,
      v_invitation_role::public.user_role,
      true,
      v_invited_by,
      'active'
    );

    UPDATE public.invitations
    SET status = 'accepted',
        accepted_at = COALESCE(accepted_at, NOW()),
        updated_at = NOW()
    WHERE id = v_invitation_id;

    RETURN NEW;
  END IF;

  v_tenant_name := COALESCE(NEW.raw_user_meta_data->>'tenant_name', 'Mi Inmobiliaria');
  v_tenant_slug := COALESCE(NEW.raw_user_meta_data->>'tenant_slug', '');

  IF v_tenant_slug = '' OR v_tenant_slug IS NULL THEN
    v_slug_base := LOWER(REGEXP_REPLACE(v_tenant_name, '[^a-z0-9]+', '-', 'g'));
    v_slug_base := TRIM(BOTH '-' FROM v_slug_base);
    v_tenant_slug := v_slug_base;
  END IF;

  v_slug := v_tenant_slug;
  WHILE v_slug_exists LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.tenants WHERE slug = v_slug
    ) INTO v_slug_exists;

    IF v_slug_exists THEN
      v_counter := v_counter + 1;
      v_slug := v_tenant_slug || '-' || v_counter;
    END IF;
  END LOOP;

  INSERT INTO public.tenants (name, slug)
  VALUES (v_tenant_name, v_slug)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.users (id, tenant_id, email, full_name, role)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_full_name, 'admin');

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.app_verify_invitation(TEXT);

CREATE FUNCTION public.app_verify_invitation(invitation_token TEXT)
RETURNS TABLE (
  id UUID,
  token TEXT,
  email TEXT,
  role TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  tenant_id UUID,
  tenant_name TEXT,
  tenant_status TEXT,
  capacity_available BOOLEAN,
  role_valid BOOLEAN
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
    t.status::TEXT AS tenant_status,
    public.app_can_create_more_users(i.tenant_id) AS capacity_available,
    EXISTS (
      SELECT 1
      FROM unnest(enum_range(NULL::public.user_role)) AS allowed_role
      WHERE allowed_role::TEXT = i.role
    ) AS role_valid
  FROM public.invitations i
  INNER JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.token = invitation_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.app_verify_invitation(TEXT) TO anon, authenticated;

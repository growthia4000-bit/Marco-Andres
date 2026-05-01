WITH upsert_starter AS (
  INSERT INTO public.plans (
    slug,
    name,
    description,
    max_users,
    monthly_price_cents,
    yearly_price_cents,
    is_active
  )
  VALUES (
    'starter',
    'Starter',
    'Plan para microinmobiliaria o equipo muy pequeño',
    5,
    NULL,
    NULL,
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    max_users = EXCLUDED.max_users,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    yearly_price_cents = EXCLUDED.yearly_price_cents,
    is_active = EXCLUDED.is_active,
    updated_at = NOW()
  RETURNING id
),
upsert_growth AS (
  INSERT INTO public.plans (
    slug,
    name,
    description,
    max_users,
    monthly_price_cents,
    yearly_price_cents,
    is_active
  )
  VALUES (
    'growth',
    'Growth',
    'Plan para inmobiliaria pequeña en crecimiento',
    15,
    NULL,
    NULL,
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    max_users = EXCLUDED.max_users,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    yearly_price_cents = EXCLUDED.yearly_price_cents,
    is_active = EXCLUDED.is_active,
    updated_at = NOW()
  RETURNING id
),
upsert_agency AS (
  INSERT INTO public.plans (
    slug,
    name,
    description,
    max_users,
    monthly_price_cents,
    yearly_price_cents,
    is_active
  )
  VALUES (
    'agency',
    'Agency',
    'Plan para agencia consolidada con equipo mediano',
    30,
    NULL,
    NULL,
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    max_users = EXCLUDED.max_users,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    yearly_price_cents = EXCLUDED.yearly_price_cents,
    is_active = EXCLUDED.is_active,
    updated_at = NOW()
  RETURNING id
),
upsert_enterprise AS (
  INSERT INTO public.plans (
    slug,
    name,
    description,
    max_users,
    monthly_price_cents,
    yearly_price_cents,
    is_active
  )
  VALUES (
    'enterprise',
    'Enterprise',
    'Plan empresarial con capacidad personalizada y expansión por contrato',
    9999,
    NULL,
    NULL,
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    max_users = EXCLUDED.max_users,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    yearly_price_cents = EXCLUDED.yearly_price_cents,
    is_active = EXCLUDED.is_active,
    updated_at = NOW()
  RETURNING id
)
UPDATE public.plans p
SET
  is_active = false,
  updated_at = NOW()
WHERE p.slug = 'business'
  AND EXISTS (SELECT 1 FROM public.plans gp WHERE gp.slug = 'growth');

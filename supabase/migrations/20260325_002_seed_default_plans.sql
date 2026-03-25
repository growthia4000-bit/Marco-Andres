INSERT INTO public.plans (
  slug,
  name,
  description,
  max_users,
  max_properties,
  max_leads,
  max_storage_mb,
  monthly_price_cents,
  yearly_price_cents,
  is_active
)
VALUES
  (
    'starter',
    'Starter',
    'Plan básico para equipos pequeños',
    5,
    100,
    500,
    1024,
    NULL,
    NULL,
    true
  ),
  (
    'business',
    'Business',
    'Plan intermedio para agencias en crecimiento',
    50,
    1000,
    5000,
    5120,
    NULL,
    NULL,
    true
  ),
  (
    'enterprise',
    'Enterprise',
    'Plan avanzado para equipos grandes',
    9999,
    NULL,
    NULL,
    20480,
    NULL,
    NULL,
    true
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  max_users = EXCLUDED.max_users,
  max_properties = EXCLUDED.max_properties,
  max_leads = EXCLUDED.max_leads,
  max_storage_mb = EXCLUDED.max_storage_mb,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  yearly_price_cents = EXCLUDED.yearly_price_cents,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

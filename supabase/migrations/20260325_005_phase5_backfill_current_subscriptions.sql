WITH resolved_plan AS (
  SELECT p.id
  FROM public.plans p
  WHERE p.is_active = true
  ORDER BY
    CASE WHEN p.slug = 'starter' THEN 0 ELSE 1 END,
    p.created_at ASC
  LIMIT 1
)
INSERT INTO public.subscriptions (
  tenant_id,
  plan_id,
  status,
  billing_cycle,
  is_current,
  trial_started_at,
  trial_ends_at,
  metadata
)
SELECT
  t.id,
  rp.id,
  'trial'::public.subscription_status,
  'monthly',
  true,
  now(),
  COALESCE(t.trial_ends_at, now() + interval '14 days'),
  jsonb_build_object('backfilled_by', 'phase5_current_subscription_backfill')
FROM public.tenants t
CROSS JOIN resolved_plan rp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subscriptions s
  WHERE s.tenant_id = t.id
    AND s.is_current = true
);

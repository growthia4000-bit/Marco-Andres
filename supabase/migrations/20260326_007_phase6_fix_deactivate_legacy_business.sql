UPDATE public.plans
SET
  is_active = false,
  updated_at = NOW()
WHERE slug = 'business'
  AND EXISTS (
    SELECT 1
    FROM public.plans
    WHERE slug = 'growth'
  );

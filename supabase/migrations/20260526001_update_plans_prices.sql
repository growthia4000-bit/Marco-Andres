-- Update plans with correct monthly prices for Stripe integration
-- Starter: 29€, Profesional (growth): 59€, Premium (agency): 99€

UPDATE public.plans
SET monthly_price_cents = 2900,
    updated_at = NOW()
WHERE slug = 'starter';

UPDATE public.plans
SET monthly_price_cents = 5900,
    updated_at = NOW()
WHERE slug = 'growth';

UPDATE public.plans
SET monthly_price_cents = 9900,
    updated_at = NOW()
WHERE slug = 'agency';

-- Enterprise remains without public pricing
UPDATE public.plans
SET monthly_price_cents = NULL,
    updated_at = NOW()
WHERE slug = 'enterprise';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_currency_code TEXT,
  ADD COLUMN IF NOT EXISTS default_locale TEXT,
  ADD COLUMN IF NOT EXISTS default_timezone TEXT;

UPDATE public.tenants
SET
  default_currency_code = COALESCE(default_currency_code, 'EUR'),
  default_locale = COALESCE(default_locale, 'es-ES'),
  default_timezone = COALESCE(default_timezone, 'Europe/Madrid')
WHERE default_currency_code IS NULL
   OR default_locale IS NULL
   OR default_timezone IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN default_currency_code SET DEFAULT 'EUR',
  ALTER COLUMN default_locale SET DEFAULT 'es-ES',
  ALTER COLUMN default_timezone SET DEFAULT 'Europe/Madrid';

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS price_amount DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS currency_code TEXT;

UPDATE public.properties p
SET
  price_amount = COALESCE(p.price_amount, p.price),
  currency_code = COALESCE(p.currency_code, t.default_currency_code, 'EUR')
FROM public.tenants t
WHERE t.id = p.tenant_id
  AND (p.price_amount IS NULL OR p.currency_code IS NULL);

ALTER TABLE public.properties
  ALTER COLUMN price_amount SET DEFAULT 0,
  ALTER COLUMN currency_code SET DEFAULT 'EUR';

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_currency_code_not_blank_chk;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_currency_code_not_blank_chk CHECK (btrim(currency_code) <> '');

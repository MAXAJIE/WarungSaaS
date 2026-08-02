-- Store logo/cover images and per-product prep time, so the counter and the
-- customer-facing estimate can be more than a single flat guess.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS logo_path text,
  ADD COLUMN IF NOT EXISTS cover_path text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS prep_minutes int;

COMMENT ON COLUMN public.stores.logo_path IS
  'Storage path (product-photos bucket) of the store logo/avatar, square.';
COMMENT ON COLUMN public.stores.cover_path IS
  'Storage path (product-photos bucket) of the store cover/banner, 16:9.';
COMMENT ON COLUMN public.products.prep_minutes IS
  'Minutes to prepare one unit of this product. Null falls back to the store average.';

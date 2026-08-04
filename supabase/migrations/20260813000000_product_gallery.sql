-- Owners may show up to five photos per dish. The first one stays in
-- products.photo_url so every existing read path keeps working; the extra
-- shots live in photo_urls and drive the carousel on the customer menu.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.products.photo_urls IS
  'Storage paths (product-photos bucket) of the product gallery, max 5, first = cover.';

-- Backfill: existing single photos become a one-shot gallery.
UPDATE public.products
   SET photo_urls = ARRAY[photo_url]
 WHERE photo_url IS NOT NULL
   AND (photo_urls IS NULL OR cardinality(photo_urls) = 0);

-- Hard cap so no client can push more than five shots.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_photo_urls_max5;
ALTER TABLE public.products
  ADD CONSTRAINT products_photo_urls_max5
  CHECK (photo_urls IS NULL OR cardinality(photo_urls) <= 5);

-- Configurable voucher layouts, and the end of voucher expiry.
--
-- Every printable part of a voucher (QR, promo code, label, reward, terms,
-- ticket strip) becomes an entry in a `design` JSON document holding its
-- on/off flag, its centre position and its size as 0..1 fractions of the card.
-- Width/height live in the same document, where 0 means "use the artwork's own
-- pixel size", so uploaded artwork is never cropped.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS design JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.voucher_templates
  ADD COLUMN IF NOT EXISTS design JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.vouchers.design IS
  'Voucher layout: {width_px, height_px, elements:{id:{enabled,x,y,size}}}. '
  'width_px/height_px of 0 mean "use the artwork''s natural size".';
COMMENT ON COLUMN public.voucher_templates.design IS
  'Default layout applied to every voucher minted from this template.';

-- Carry the old flat QR placement columns into the new document so existing
-- vouchers keep the exact QR spot their owner picked.
UPDATE public.vouchers v
   SET design = jsonb_build_object(
         'width_px', 0,
         'height_px', 0,
         'elements', jsonb_build_object(
           'qr', jsonb_build_object(
             'enabled', true,
             'x', COALESCE(t.qr_x, 0.78),
             'y', COALESCE(t.qr_y, 0.5),
             'size', COALESCE(t.qr_size, 0.32)
           )
         )
       )
  FROM public.voucher_templates t
 WHERE v.template_id = t.id
   AND v.design = '{}'::jsonb;

UPDATE public.voucher_templates
   SET design = jsonb_build_object(
         'width_px', 0,
         'height_px', 0,
         'elements', jsonb_build_object(
           'qr', jsonb_build_object(
             'enabled', true,
             'x', COALESCE(qr_x, 0.78),
             'y', COALESCE(qr_y, 0.5),
             'size', COALESCE(qr_size, 0.32)
           )
         )
       )
 WHERE design = '{}'::jsonb;

-- Vouchers no longer expire. The column stays for historical rows, but nothing
-- reads it any more: a code is only ever blocked by its own terms or usage cap.
COMMENT ON COLUMN public.vouchers.expires_at IS
  'RETIRED. Vouchers do not expire; kept only as a record of past campaigns.';

-- Existing grants on both tables already cover the new column (GRANT on a table
-- applies to columns added later), so no further grants are required here.

-- Versatile vouchers, voucher design templates, stacked order vouchers,
-- gifts drawn from the live menu, counter amendments and per-store seat caps.

-- ---------------------------------------------------------------- vouchers --
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'voucher_reward') THEN
    CREATE TYPE public.voucher_reward AS ENUM (
      'order_percent',
      'order_fixed',
      'nth_item_percent',
      'buy_x_get_y',
      'item_percent'
    );
  END IF;
END $$;

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS reward public.voucher_reward NOT NULL DEFAULT 'order_percent',
  ADD COLUMN IF NOT EXISTS reward_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nth_item INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS buy_qty INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS get_qty INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stackable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_items INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_qty INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS usage_limit INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS used_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terms TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS batch_id UUID,
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS artwork_path TEXT;

COMMENT ON COLUMN public.vouchers.reward IS
  'Shape of the reward: whole-order, Nth item, buy X get Y or a single item.';
COMMENT ON COLUMN public.vouchers.usage_limit IS
  'How many times this code may be redeemed. used_count tracks redemptions.';

CREATE INDEX IF NOT EXISTS vouchers_batch_idx ON public.vouchers(batch_id);

-- Legacy rows used the old percent/fixed kind; map them onto the new reward.
UPDATE public.vouchers
   SET reward = 'order_fixed'::public.voucher_reward
 WHERE kind = 'fixed' AND reward = 'order_percent';

-- ------------------------------------------------------- voucher templates --
CREATE TABLE IF NOT EXISTS public.voucher_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  artwork_path TEXT,
  /* Where the QR sits on the artwork, as 0..1 fractions of width/height. */
  qr_x NUMERIC(6, 4) NOT NULL DEFAULT 0.72,
  qr_y NUMERIC(6, 4) NOT NULL DEFAULT 0.62,
  qr_size NUMERIC(6, 4) NOT NULL DEFAULT 0.22,
  /* Reward + terms defaults so a new voucher can be filled in one click. */
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_templates TO authenticated;
GRANT ALL ON public.voucher_templates TO service_role;
ALTER TABLE public.voucher_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voucher templates read by staff" ON public.voucher_templates;
CREATE POLICY "voucher templates read by staff" ON public.voucher_templates
  FOR SELECT TO authenticated USING (store_id = public.my_store_id());
DROP POLICY IF EXISTS "voucher templates managed by owner" ON public.voucher_templates;
CREATE POLICY "voucher templates managed by owner" ON public.voucher_templates
  FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.has_store_role('owner'))
  WITH CHECK (store_id = public.my_store_id() AND public.has_store_role('owner'));

-- Private bucket: voucher artwork is store property, served through signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('voucher-designs', 'voucher-designs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "voucher designs read by staff" ON storage.objects;
CREATE POLICY "voucher designs read by staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'voucher-designs');
DROP POLICY IF EXISTS "voucher designs written by owner" ON storage.objects;
CREATE POLICY "voucher designs written by owner" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'voucher-designs' AND public.has_store_role('owner'))
  WITH CHECK (bucket_id = 'voucher-designs' AND public.has_store_role('owner'));

-- --------------------------------------------------------- order vouchers ---
CREATE TABLE IF NOT EXISTS public.order_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, voucher_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_vouchers TO authenticated;
GRANT ALL ON public.order_vouchers TO service_role;
ALTER TABLE public.order_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order vouchers read by staff" ON public.order_vouchers;
CREATE POLICY "order vouchers read by staff" ON public.order_vouchers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.id = order_id AND o.store_id = public.my_store_id()));
DROP POLICY IF EXISTS "order vouchers managed by counter" ON public.order_vouchers;
CREATE POLICY "order vouchers managed by counter" ON public.order_vouchers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.id = order_id AND o.store_id = public.my_store_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.id = order_id AND o.store_id = public.my_store_id()));

-- Existing single-voucher orders keep working: mirror them into the join table.
INSERT INTO public.order_vouchers (order_id, voucher_id)
SELECT id, voucher_id FROM public.orders WHERE voucher_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ------------------------------------------- counter amendments + combos ---
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_note TEXT NOT NULL DEFAULT '';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS combo_parts JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.order_items.combo_parts IS
  'Per-contained-product customisations chosen for a combo line.';

-- ------------------------------------------------------------------ gifts ---
ALTER TABLE public.gifts
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS item_qty INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_items INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_qty INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS terms TEXT NOT NULL DEFAULT '';

-- --------------------------------------------------------------- seat caps --
-- 5 cooks, one counter, one pickup per store. Owners are exempt: an owner may
-- also cover any station without consuming that station's seat.
CREATE OR REPLACE FUNCTION public.enforce_role_seats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seat_cap INT;
  taken INT;
BEGIN
  seat_cap := CASE NEW.role
                WHEN 'kitchen' THEN 5
                WHEN 'cashier' THEN 1
                WHEN 'pickup' THEN 1
                ELSE NULL
              END;
  IF seat_cap IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO taken
    FROM public.store_members m
   WHERE m.store_id = NEW.store_id
     AND m.role = NEW.role
     AND m.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF taken >= seat_cap THEN
    RAISE EXCEPTION 'ROLE_SEATS_FULL:%:%', NEW.role, seat_cap;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS store_members_role_seats ON public.store_members;
CREATE TRIGGER store_members_role_seats
  BEFORE INSERT OR UPDATE OF role ON public.store_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_seats();

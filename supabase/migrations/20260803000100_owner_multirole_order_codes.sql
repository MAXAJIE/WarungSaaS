-- Owner/cashier separation, stacked roles, templated pickup numbers,
-- product customisations and per-actor activity logs.
--
-- Design notes:
--   * store_members.role stays as the person's PRIMARY role so nothing that
--     already reads it breaks. The new member_roles table holds the full set.
--     Only the owner is allowed to hold more than one row there.
--   * Every helper below is SECURITY DEFINER so RLS policies can call it
--     without recursing into the table being protected.

-- ---------------------------------------------------------------- roles ----

CREATE TABLE IF NOT EXISTS public.member_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.store_members(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.staff_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, role)
);
CREATE INDEX IF NOT EXISTS member_roles_user_idx ON public.member_roles(user_id);

GRANT SELECT ON public.member_roles TO authenticated;
GRANT ALL ON public.member_roles TO service_role;
ALTER TABLE public.member_roles ENABLE ROW LEVEL SECURITY;

-- Backfill: whoever created the store becomes the owner and keeps the counter
-- hat, because a one-person stall still has to take payment.
UPDATE public.store_members m
   SET role = 'owner'
  FROM public.stores s
 WHERE s.id = m.store_id
   AND s.owner_id = m.user_id
   AND m.role <> 'owner';

INSERT INTO public.member_roles (store_id, member_id, user_id, role)
SELECT m.store_id, m.id, m.user_id, m.role
  FROM public.store_members m
ON CONFLICT DO NOTHING;

INSERT INTO public.member_roles (store_id, member_id, user_id, role)
SELECT m.store_id, m.id, m.user_id, 'cashier'::public.staff_role
  FROM public.store_members m
 WHERE m.role = 'owner'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.my_roles()
RETURNS public.staff_role[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT array_agg(DISTINCT r.role) FROM public.member_roles r WHERE r.user_id = auth.uid()),
    (SELECT array_agg(m.role) FROM public.store_members m WHERE m.user_id = auth.uid()),
    '{}'::public.staff_role[]
  );
$$;

CREATE OR REPLACE FUNCTION public.has_store_role(p_role public.staff_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_role = ANY (public.my_roles());
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_store_role('owner');
$$;

-- Redefined: "can this person take payment?" now includes the owner.
CREATE OR REPLACE FUNCTION public.is_cashier()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_store_role('cashier') OR public.has_store_role('owner');
$$;

-- Redefined: highest-privilege role first, so single-role reads stay sensible.
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS public.staff_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r FROM unnest(public.my_roles()) AS r
  ORDER BY CASE r WHEN 'owner' THEN 0 WHEN 'cashier' THEN 1 WHEN 'kitchen' THEN 2 ELSE 3 END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_store_role(public.staff_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_store_role(public.staff_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;

CREATE POLICY "member roles read by staff" ON public.member_roles FOR SELECT TO authenticated
  USING (store_id = public.my_store_id());

-- Management is the owner's job from here on.
DROP POLICY IF EXISTS "products managed by cashier" ON public.products;
CREATE POLICY "products managed by owner" ON public.products FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.is_owner())
  WITH CHECK (store_id = public.my_store_id() AND public.is_owner());

DROP POLICY IF EXISTS "vouchers managed by cashier" ON public.vouchers;
CREATE POLICY "vouchers managed by owner" ON public.vouchers FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.is_owner())
  WITH CHECK (store_id = public.my_store_id() AND public.is_owner());

DROP POLICY IF EXISTS "gifts managed by cashier" ON public.gifts;
CREATE POLICY "gifts managed by owner" ON public.gifts FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.is_owner())
  WITH CHECK (store_id = public.my_store_id() AND public.is_owner());

DROP POLICY IF EXISTS "invites cashier write" ON public.store_invites;
DROP POLICY IF EXISTS "invites cashier delete" ON public.store_invites;
CREATE POLICY "invites owner write" ON public.store_invites FOR INSERT TO authenticated
  WITH CHECK (store_id = public.my_store_id() AND public.is_owner());
CREATE POLICY "invites owner delete" ON public.store_invites FOR DELETE TO authenticated
  USING (store_id = public.my_store_id() AND public.is_owner());

DROP POLICY IF EXISTS "cashiers write groups" ON public.kitchen_groups;
CREATE POLICY "owners write groups" ON public.kitchen_groups FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.is_owner())
  WITH CHECK (store_id = public.my_store_id() AND public.is_owner());

-- ------------------------------------------------- pickup order numbers ----

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS order_code_template TEXT NOT NULL DEFAULT '{STALL}-{SEQ}',
  ADD COLUMN IF NOT EXISTS order_seq INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_code TEXT,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS orders_store_code_idx ON public.orders(store_id, order_code);

/*
 * Mints the human-facing pickup number the moment payment is approved.
 * The template is owner-defined and uses 2-3 dash separated parts drawn from
 * {STALL} {DATE} {TIME} {SEQ}. The sequence is continuous per store and is
 * bumped under a row lock so two cashiers can never mint the same number.
 */
CREATE OR REPLACE FUNCTION public.assign_order_code(p_order UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store   public.stores%ROWTYPE;
  v_seq     INTEGER;
  v_code    TEXT;
  v_stall   TEXT;
  v_existing TEXT;
BEGIN
  SELECT order_code INTO v_existing FROM public.orders WHERE id = p_order;
  IF v_existing IS NOT NULL AND v_existing <> '' THEN
    RETURN v_existing;
  END IF;

  SELECT s.* INTO v_store
    FROM public.stores s
    JOIN public.orders o ON o.store_id = s.id
   WHERE o.id = p_order
   FOR UPDATE OF s;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_seq := v_store.order_seq + 1;
  UPDATE public.stores SET order_seq = v_seq WHERE id = v_store.id;

  -- Short, readable stall tag: letters/digits of the slug, capped at 4.
  v_stall := upper(substring(regexp_replace(coalesce(v_store.slug, v_store.name), '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4));
  IF v_stall = '' THEN v_stall := 'STL'; END IF;

  v_code := coalesce(nullif(v_store.order_code_template, ''), '{STALL}-{SEQ}');
  v_code := replace(v_code, '{STALL}', v_stall);
  v_code := replace(v_code, '{DATE}', to_char(now(), 'MMDD'));
  v_code := replace(v_code, '{TIME}', to_char(now(), 'HH24MI'));
  v_code := replace(v_code, '{SEQ}', lpad(v_seq::text, 3, '0'));

  UPDATE public.orders SET order_code = v_code WHERE id = p_order;
  RETURN v_code;
END; $$;

REVOKE ALL ON FUNCTION public.assign_order_code(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_order_code(UUID) TO service_role;

-- ------------------------------------------------ product customisations ---

CREATE TABLE IF NOT EXISTS public.product_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  max_select INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_options_product_idx ON public.product_options(product_id);

CREATE TABLE IF NOT EXISTS public.product_option_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id UUID NOT NULL REFERENCES public.product_options(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_option_values_option_idx ON public.product_option_values(option_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_options TO authenticated;
GRANT SELECT ON public.product_options TO anon;
GRANT ALL ON public.product_options TO service_role;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read product options" ON public.product_options FOR SELECT TO authenticated
  USING (store_id = public.my_store_id());
CREATE POLICY "public read product options" ON public.product_options FOR SELECT TO anon USING (true);
CREATE POLICY "owners write product options" ON public.product_options FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.is_owner())
  WITH CHECK (store_id = public.my_store_id() AND public.is_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_option_values TO authenticated;
GRANT SELECT ON public.product_option_values TO anon;
GRANT ALL ON public.product_option_values TO service_role;
ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read option values" ON public.product_option_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.product_options o WHERE o.id = option_id AND o.store_id = public.my_store_id()));
CREATE POLICY "public read option values" ON public.product_option_values FOR SELECT TO anon USING (true);
CREATE POLICY "owners write option values" ON public.product_option_values FOR ALL TO authenticated
  USING (public.is_owner() AND EXISTS (SELECT 1 FROM public.product_options o WHERE o.id = option_id AND o.store_id = public.my_store_id()))
  WITH CHECK (public.is_owner() AND EXISTS (SELECT 1 FROM public.product_options o WHERE o.id = option_id AND o.store_id = public.my_store_id()));

-- What the customer actually picked, frozen onto the line item.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ------------------------------------------------------- activity logs -----

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS actor_role public.staff_role;

CREATE INDEX IF NOT EXISTS activity_actor_idx ON public.activity_logs(store_id, actor_id, created_at DESC);

-- Everyone keeps a log, but staff only see the entries they caused.
-- The owner sees the whole stall and can narrow to themselves in the UI.
DROP POLICY IF EXISTS "logs read by staff" ON public.activity_logs;
CREATE POLICY "logs read scoped by role" ON public.activity_logs FOR SELECT TO authenticated
  USING (store_id = public.my_store_id() AND (public.is_owner() OR actor_id = auth.uid()));

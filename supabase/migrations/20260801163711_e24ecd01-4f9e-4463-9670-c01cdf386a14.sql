-- ENUMS
CREATE TYPE public.staff_role AS ENUM ('cashier','kitchen','pickup');
CREATE TYPE public.order_status AS ENUM ('cart','submitted','approved','preparing','kitchen_done','received','completed','cancelled');
CREATE TYPE public.discount_kind AS ENUM ('percent','fixed');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  preferred_lang TEXT NOT NULL DEFAULT 'en',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- STORES
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'MYR',
  gift_threshold NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_prep_minutes INT NOT NULL DEFAULT 8,
  disclaimer TEXT NOT NULL DEFAULT '',
  is_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- MEMBERS
CREATE TABLE public.store_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.staff_role NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_members TO authenticated;
GRANT ALL ON public.store_members TO service_role;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_store_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT store_id FROM public.store_members WHERE user_id = auth.uid() LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS public.staff_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.store_members WHERE user_id = auth.uid() LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.is_cashier()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.store_members WHERE user_id = auth.uid() AND role = 'cashier');
$$;

CREATE POLICY "members read own store" ON public.store_members FOR SELECT TO authenticated
  USING (store_id = public.my_store_id());
CREATE POLICY "cashier manages members" ON public.store_members FOR DELETE TO authenticated
  USING (store_id = public.my_store_id() AND public.is_cashier() AND user_id <> auth.uid());

CREATE POLICY "store read by members" ON public.stores FOR SELECT TO authenticated
  USING (id = public.my_store_id());
CREATE POLICY "store insert by owner" ON public.stores FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "store update by owner" ON public.stores FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- INVITES
CREATE TABLE public.store_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  role public.staff_role NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_invites TO authenticated;
GRANT ALL ON public.store_invites TO service_role;
ALTER TABLE public.store_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites cashier read" ON public.store_invites FOR SELECT TO authenticated
  USING (store_id = public.my_store_id() AND public.is_cashier());
CREATE POLICY "invites cashier write" ON public.store_invites FOR INSERT TO authenticated
  WITH CHECK (store_id = public.my_store_id() AND public.is_cashier());
CREATE POLICY "invites cashier delete" ON public.store_invites FOR DELETE TO authenticated
  USING (store_id = public.my_store_id() AND public.is_cashier());

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_zh TEXT NOT NULL DEFAULT '',
  name_ms TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Main',
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sell_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  photo_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_store_idx ON public.products(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read by staff" ON public.products FOR SELECT TO authenticated
  USING (store_id = public.my_store_id());
CREATE POLICY "products managed by cashier" ON public.products FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.is_cashier())
  WITH CHECK (store_id = public.my_store_id() AND public.is_cashier());

-- VOUCHERS
CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  kind public.discount_kind NOT NULL DEFAULT 'percent',
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  used_by_order UUID,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vouchers read by staff" ON public.vouchers FOR SELECT TO authenticated
  USING (store_id = public.my_store_id());
CREATE POLICY "vouchers managed by cashier" ON public.vouchers FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.is_cashier())
  WITH CHECK (store_id = public.my_store_id() AND public.is_cashier());

-- GIFTS
CREATE TABLE public.gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  threshold NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gifts TO authenticated;
GRANT ALL ON public.gifts TO service_role;
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gifts read by staff" ON public.gifts FOR SELECT TO authenticated
  USING (store_id = public.my_store_id());
CREATE POLICY "gifts managed by cashier" ON public.gifts FOR ALL TO authenticated
  USING (store_id = public.my_store_id() AND public.is_cashier())
  WITH CHECK (store_id = public.my_store_id() AND public.is_cashier());

-- ORDERS
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_no INT,
  customer_name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status public.order_status NOT NULL DEFAULT 'cart',
  source TEXT NOT NULL DEFAULT 'customer',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,
  gift_id UUID REFERENCES public.gifts(id) ON DELETE SET NULL,
  guest_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  qr_token TEXT,
  qr_expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX orders_qr_token_idx ON public.orders(qr_token) WHERE qr_token IS NOT NULL;
CREATE UNIQUE INDEX orders_guest_token_idx ON public.orders(guest_token);
CREATE INDEX orders_store_status_idx ON public.orders(store_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
-- Staff of the store can read orders; kitchen never sees unpaid ones.
CREATE POLICY "orders read by staff" ON public.orders FOR SELECT TO authenticated
  USING (
    store_id = public.my_store_id()
    AND (public.my_role() = 'cashier' OR status <> 'cart')
    AND (public.my_role() <> 'kitchen' OR status IN ('approved','preparing','kitchen_done','received','completed'))
  );
CREATE POLICY "orders written by staff" ON public.orders FOR UPDATE TO authenticated
  USING (store_id = public.my_store_id()) WITH CHECK (store_id = public.my_store_id());
CREATE POLICY "orders created by cashier" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (store_id = public.my_store_id() AND public.is_cashier());

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name_snapshot TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  qty INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order items read by staff" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.store_id = public.my_store_id()));
CREATE POLICY "order items write by cashier" ON public.order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.store_id = public.my_store_id() AND public.is_cashier()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.store_id = public.my_store_id() AND public.is_cashier()));

-- ACTIVITY LOG
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL DEFAULT '',
  order_id UUID,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_store_idx ON public.activity_logs(store_id, created_at DESC);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs read by staff" ON public.activity_logs FOR SELECT TO authenticated
  USING (store_id = public.my_store_id());

-- ORDER NUMBER
CREATE OR REPLACE FUNCTION public.assign_order_no(p_order UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store UUID; v_no INT;
BEGIN
  SELECT store_id INTO v_store FROM public.orders WHERE id = p_order;
  SELECT COALESCE(MAX(order_no),0) + 1 INTO v_no FROM public.orders
    WHERE store_id = v_store AND created_at::date = now()::date;
  UPDATE public.orders SET order_no = v_no WHERE id = p_order;
  RETURN v_no;
END; $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cleanup of abandoned carts / expired QR registrations
CREATE OR REPLACE FUNCTION public.cleanup_expired_orders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  WITH del AS (
    DELETE FROM public.orders
    WHERE status IN ('cart','submitted')
      AND ((qr_expires_at IS NOT NULL AND qr_expires_at < now())
           OR (qr_expires_at IS NULL AND updated_at < now() - interval '15 minutes'))
    RETURNING 1
  ) SELECT count(*) INTO n FROM del;
  RETURN n;
END; $$;

-- Realtime for staff boards only
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
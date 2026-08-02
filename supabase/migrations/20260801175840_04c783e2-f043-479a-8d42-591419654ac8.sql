CREATE TABLE public.kitchen_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_groups TO authenticated;
GRANT SELECT ON public.kitchen_groups TO anon;
GRANT ALL ON public.kitchen_groups TO service_role;
ALTER TABLE public.kitchen_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read groups" ON public.kitchen_groups FOR SELECT TO authenticated USING (store_id = public.my_store_id());
CREATE POLICY "cashiers write groups" ON public.kitchen_groups FOR ALL TO authenticated USING (store_id = public.my_store_id() AND public.is_cashier()) WITH CHECK (store_id = public.my_store_id() AND public.is_cashier());
CREATE POLICY "public read groups" ON public.kitchen_groups FOR SELECT TO anon USING (true);

ALTER TABLE public.products
  ADD COLUMN group_id UUID REFERENCES public.kitchen_groups(id) ON DELETE SET NULL,
  ADD COLUMN is_combo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.store_members
  ADD COLUMN group_id UUID REFERENCES public.kitchen_groups(id) ON DELETE SET NULL;

CREATE TABLE public.combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (combo_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.combo_items TO authenticated;
GRANT SELECT ON public.combo_items TO anon;
GRANT ALL ON public.combo_items TO service_role;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read combo items" ON public.combo_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = combo_items.combo_id AND p.store_id = public.my_store_id()));
CREATE POLICY "cashiers write combo items" ON public.combo_items FOR ALL TO authenticated
  USING (public.is_cashier() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = combo_items.combo_id AND p.store_id = public.my_store_id()))
  WITH CHECK (public.is_cashier() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = combo_items.combo_id AND p.store_id = public.my_store_id()));
CREATE POLICY "public read combo items" ON public.combo_items FOR SELECT TO anon USING (true);
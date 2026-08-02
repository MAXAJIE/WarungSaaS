CREATE TABLE public.product_compartments (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.kitchen_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, group_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_compartments TO authenticated;
GRANT SELECT ON public.product_compartments TO anon;
GRANT ALL ON public.product_compartments TO service_role;

ALTER TABLE public.product_compartments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read product compartments" ON public.product_compartments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.store_id = public.my_store_id()));

CREATE POLICY "public read product compartments" ON public.product_compartments
  FOR SELECT TO anon USING (true);

CREATE POLICY "cashiers write product compartments" ON public.product_compartments
  FOR ALL TO authenticated
  USING (public.is_cashier() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.store_id = public.my_store_id()))
  WITH CHECK (public.is_cashier() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.store_id = public.my_store_id()));

INSERT INTO public.product_compartments (product_id, group_id)
SELECT id, group_id FROM public.products WHERE group_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_url TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id, read, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
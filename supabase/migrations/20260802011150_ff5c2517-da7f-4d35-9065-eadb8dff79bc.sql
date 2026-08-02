ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_total integer,
  ADD COLUMN IF NOT EXISTS stock_sold integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.store_members(id) ON DELETE CASCADE,
  from_role text NOT NULL,
  requested_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text NOT NULL DEFAULT '',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_requests TO authenticated;
GRANT ALL ON public.role_requests TO service_role;

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own role requests"
ON public.role_requests FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.store_members m
    WHERE m.store_id = role_requests.store_id
      AND m.user_id = auth.uid()
      AND m.role = 'cashier'
  )
);

CREATE POLICY "Members create own role requests"
ON public.role_requests FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.store_members m
    WHERE m.store_id = role_requests.store_id AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Owner decides role requests"
ON public.role_requests FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.store_members m
    WHERE m.store_id = role_requests.store_id
      AND m.user_id = auth.uid()
      AND m.role = 'cashier'
  )
)
WITH CHECK (true);

CREATE POLICY "Owner or requester deletes role requests"
ON public.role_requests FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.store_members m
    WHERE m.store_id = role_requests.store_id
      AND m.user_id = auth.uid()
      AND m.role = 'cashier'
  )
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_role_requests_updated_at
BEFORE UPDATE ON public.role_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
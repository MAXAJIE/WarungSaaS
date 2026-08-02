DROP POLICY IF EXISTS "Owner decides role requests" ON public.role_requests;

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
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.store_members m
    WHERE m.store_id = role_requests.store_id
      AND m.user_id = auth.uid()
      AND m.role = 'cashier'
  )
);
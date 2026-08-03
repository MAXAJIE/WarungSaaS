-- Multiple owners: every account that creates a store becomes that store's
-- owner, and a store may have more than one owner.
--
-- Before this migration only the accounts touched by the one-off backfill in
-- 20260803000100 ever had role = 'owner'; every later sign-up landed as a plain
-- 'cashier', so a second person could register but never act as an owner.

-- 1. Repair existing data: the creator of each store is its owner.
UPDATE public.store_members m
   SET role = 'owner'
  FROM public.stores s
 WHERE s.id = m.store_id
   AND s.owner_id = m.user_id
   AND m.role <> 'owner';

-- 2. Mirror the primary role into member_roles for anyone missing it.
INSERT INTO public.member_roles (store_id, member_id, user_id, role)
SELECT m.store_id, m.id, m.user_id, m.role
  FROM public.store_members m
ON CONFLICT (member_id, role) DO NOTHING;

-- 3. Owners always keep the counter hat.
INSERT INTO public.member_roles (store_id, member_id, user_id, role)
SELECT m.store_id, m.id, m.user_id, 'cashier'::public.staff_role
  FROM public.store_members m
 WHERE m.role = 'owner'
ON CONFLICT (member_id, role) DO NOTHING;

-- 4. Keep new/updated members in sync automatically, so a fresh registration
--    can never end up with an empty role set again.
CREATE OR REPLACE FUNCTION public.sync_member_roles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.member_roles (store_id, member_id, user_id, role)
  VALUES (NEW.store_id, NEW.id, NEW.user_id, NEW.role)
  ON CONFLICT (member_id, role) DO NOTHING;

  IF NEW.role = 'owner' THEN
    INSERT INTO public.member_roles (store_id, member_id, user_id, role)
    VALUES (NEW.store_id, NEW.id, NEW.user_id, 'cashier'::public.staff_role)
    ON CONFLICT (member_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS store_members_sync_roles ON public.store_members;
CREATE TRIGGER store_members_sync_roles
AFTER INSERT OR UPDATE OF role ON public.store_members
FOR EACH ROW EXECUTE FUNCTION public.sync_member_roles();

-- 5. Store settings: any owner of the store may edit it, not only the account
--    stored in stores.owner_id.
DROP POLICY IF EXISTS "store update by owner" ON public.stores;
CREATE POLICY "store update by owner" ON public.stores FOR UPDATE TO authenticated
  USING (id = public.my_store_id() AND public.is_owner())
  WITH CHECK (id = public.my_store_id() AND public.is_owner());

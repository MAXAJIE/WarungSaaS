-- Adds the "owner" role to the staff_role enum.
--
-- This lives in its own migration on purpose: Postgres refuses to use a new
-- enum label in the same transaction that added it, and every later migration
-- writes rows with role = 'owner'.
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'owner';

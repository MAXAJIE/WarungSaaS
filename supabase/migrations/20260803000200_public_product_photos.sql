-- The product-photos bucket was never created, which is why uploading a
-- product image failed with "Bucket not found". It is public so menu images
-- can be cached by the CDN and shown to guests without a signed URL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone may read a menu photo; only the owner of that store may change one.
DROP POLICY IF EXISTS "store staff read product photos" ON storage.objects;
DROP POLICY IF EXISTS "cashier uploads product photos" ON storage.objects;
DROP POLICY IF EXISTS "cashier updates product photos" ON storage.objects;
DROP POLICY IF EXISTS "cashier deletes product photos" ON storage.objects;

CREATE POLICY "public read product photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-photos');
CREATE POLICY "owner uploads product photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-photos' AND public.is_owner() AND (storage.foldername(name))[1] = public.my_store_id()::text);
CREATE POLICY "owner updates product photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-photos' AND public.is_owner() AND (storage.foldername(name))[1] = public.my_store_id()::text);
CREATE POLICY "owner deletes product photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-photos' AND public.is_owner() AND (storage.foldername(name))[1] = public.my_store_id()::text);

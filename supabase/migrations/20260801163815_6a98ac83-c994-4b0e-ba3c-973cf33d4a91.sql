CREATE POLICY "store staff read product photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = public.my_store_id()::text);
CREATE POLICY "cashier uploads product photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-photos' AND public.is_cashier() AND (storage.foldername(name))[1] = public.my_store_id()::text);
CREATE POLICY "cashier updates product photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-photos' AND public.is_cashier() AND (storage.foldername(name))[1] = public.my_store_id()::text);
CREATE POLICY "cashier deletes product photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-photos' AND public.is_cashier() AND (storage.foldername(name))[1] = public.my_store_id()::text);
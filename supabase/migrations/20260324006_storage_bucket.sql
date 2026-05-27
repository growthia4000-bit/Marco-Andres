-- Storage bucket for property images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-images',
  'property-images',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  BEGIN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "property_images_public_read" ON storage.objects;
    CREATE POLICY "property_images_public_read" ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'property-images');

    DROP POLICY IF EXISTS "property_images_auth_upload" ON storage.objects;
    CREATE POLICY "property_images_auth_upload" ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'property-images'
        AND EXISTS (
          SELECT 1 FROM public.users WHERE id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS "property_images_auth_delete" ON storage.objects;
    CREATE POLICY "property_images_auth_delete" ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'property-images'
        AND auth.uid() IS NOT NULL
      );
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping storage.objects policies because current role is not the storage owner in this environment';
  END;
END $$;

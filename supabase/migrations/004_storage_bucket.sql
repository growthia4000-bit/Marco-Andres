-- Storage bucket for property images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-images',
  'property-images',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS for property-images storage
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view images (public bucket)
CREATE POLICY "public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-images');

-- Policy: Authenticated users can upload
CREATE POLICY "auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-images' AND
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can delete their own uploads (optional)
CREATE POLICY "auth_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-images' AND
    auth.uid() IS NOT NULL
  );

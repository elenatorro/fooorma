-- Supabase Storage RLS policies for fooorma
-- Run this in the Supabase SQL Editor to set up buckets and policies.

-- ============================================================
-- 1. Create buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('projects', 'projects', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('shared', 'shared', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Projects bucket (private) — user can only access own folder
--    Folder structure: projects/<user_id>/<filename>
-- ============================================================

-- SELECT: user can list/download only their own folder
CREATE POLICY "projects_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'projects'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: user can upload only to their own folder
CREATE POLICY "projects_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'projects'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: user can update only their own files
CREATE POLICY "projects_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'projects'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: user can delete only their own files
CREATE POLICY "projects_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'projects'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 3. Shared bucket (public read, authenticated write own folder)
--    Folder structure: shared/<user_id>/<filename>
-- ============================================================

-- SELECT: anyone can read (public bucket)
CREATE POLICY "shared_select_public" ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'shared'
  );

-- INSERT: authenticated users can upload to their own folder
CREATE POLICY "shared_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shared'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: authenticated users can update their own files
CREATE POLICY "shared_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'shared'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: authenticated users can delete their own files
CREATE POLICY "shared_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'shared'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

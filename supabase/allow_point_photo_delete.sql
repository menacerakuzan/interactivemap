-- Allow authenticated specialists/admins to remove uploaded files from point-photos bucket.
-- Run this in Supabase SQL Editor once.

drop policy if exists "point_photos_staff_delete" on storage.objects;
create policy "point_photos_staff_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'point-photos'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'specialist')
  )
);


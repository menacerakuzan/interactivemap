-- ONE-SHOT FIX: run this whole script once in Supabase SQL Editor.
-- Safe to re-run (uses drop policy if exists).

-- Ensure RLS is enabled
alter table public.points enable row level security;
alter table public.routes enable row level security;
alter table public.route_points enable row level security;
alter table public.news enable row level security;

-- 1) POINTS: allow specialist/admin to delete
drop policy if exists "points_staff_delete" on public.points;
create policy "points_staff_delete"
on public.points
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'specialist')
  )
);

-- 2) ROUTES: allow specialist/admin to delete
drop policy if exists "routes_delete" on public.routes;
create policy "routes_delete"
on public.routes
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'specialist')
  )
);

-- 3) STORAGE point-photos: allow specialist/admin delete
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

-- 4) STORAGE point-photos: ensure insert exists (for upload)
drop policy if exists "point_photos_staff_write" on storage.objects;
create policy "point_photos_staff_write"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'point-photos'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'specialist')
  )
);

-- 5) STORAGE point-photos: ensure public read exists (for map cards)
drop policy if exists "point_photos_public_read" on storage.objects;
create policy "point_photos_public_read"
on storage.objects
for select
using (bucket_id = 'point-photos');

-- Quick diagnostics after running:
-- select auth.uid();
-- select id, email, role from public.profiles where id = auth.uid();
-- select policyname, tablename, cmd from pg_policies where schemaname='public' and tablename in ('points','routes');
-- select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects';


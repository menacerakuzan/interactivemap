-- Allow specialists/admins to delete points in Supabase mode.
-- Run once in Supabase SQL Editor.

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


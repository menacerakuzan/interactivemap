-- Add per-point detailed sections with optional photos
-- Run once in Supabase SQL Editor

create table if not exists public.point_sections (
  id bigserial primary key,
  point_id bigint not null references public.points(id) on delete cascade,
  position integer not null default 1,
  title text,
  description text,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_point_sections_point_id_position
  on public.point_sections(point_id, position, id);

alter table public.point_sections enable row level security;

drop policy if exists "point_sections_public_read" on public.point_sections;
create policy "point_sections_public_read"
on public.point_sections
for select
using (true);

drop policy if exists "point_sections_staff_write" on public.point_sections;
create policy "point_sections_staff_write"
on public.point_sections
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'specialist')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'specialist')
  )
);

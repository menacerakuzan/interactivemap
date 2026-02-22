-- Hard reset of RLS policies to eliminate recursive stack depth errors

alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.route_points enable row level security;

-- Profiles: only self read/update
 drop policy if exists "profiles_select_self_or_staff" on public.profiles;
 drop policy if exists "profiles_update_self_or_admin" on public.profiles;
 drop policy if exists "profiles_select_self" on public.profiles;
 drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_select_self"
on public.profiles
for select
using (id = auth.uid());

create policy "profiles_update_self"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

-- Routes
 drop policy if exists "routes_public_read_published" on public.routes;
 drop policy if exists "routes_staff_insert" on public.routes;
 drop policy if exists "routes_staff_update" on public.routes;

create policy "routes_read"
on public.routes
for select
using (
  status = 'published'
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'specialist')
  )
);

create policy "routes_insert"
on public.routes
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'specialist')
  )
);

create policy "routes_update"
on public.routes
for update
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

-- Route points
 drop policy if exists "route_points_read_if_route_visible" on public.route_points;
 drop policy if exists "route_points_staff_write" on public.route_points;

create policy "route_points_read"
on public.route_points
for select
using (
  exists (
    select 1
    from public.routes r
    where r.id = route_points.route_id
      and (
        r.status = 'published'
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'specialist')
        )
      )
  )
);

create policy "route_points_write"
on public.route_points
for all
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

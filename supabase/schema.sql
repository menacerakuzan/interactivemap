-- Odesa Accessibility Map schema for Supabase
-- Run in Supabase SQL editor

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin', 'specialist', 'viewer')) default 'viewer',
  created_at timestamptz not null default now()
);

create table if not exists public.point_types (
  id bigserial primary key,
  code text not null unique,
  label_uk text not null,
  label_en text not null,
  color text not null
);

create table if not exists public.points (
  id bigserial primary key,
  title text not null,
  description text,
  lat double precision not null,
  lng double precision not null,
  district text,
  point_type_id bigint not null references public.point_types(id),
  is_certified boolean not null default false,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.routes (
  id bigserial primary key,
  name text not null,
  description text,
  status text not null check (status in ('draft', 'review', 'published')) default 'draft',
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.route_points (
  route_id bigint not null references public.routes(id) on delete cascade,
  point_id bigint not null references public.points(id) on delete cascade,
  position integer not null,
  note text,
  primary key (route_id, point_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists points_touch_updated_at on public.points;
create trigger points_touch_updated_at
before update on public.points
for each row execute function public.touch_updated_at();

drop trigger if exists routes_touch_updated_at on public.routes;
create trigger routes_touch_updated_at
before update on public.routes
for each row execute function public.touch_updated_at();

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'viewer');
$$;

create or replace function public.is_specialist_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('specialist', 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.point_types enable row level security;
alter table public.points enable row level security;
alter table public.routes enable row level security;
alter table public.route_points enable row level security;

-- Profiles
drop policy if exists "profiles_select_self_or_staff" on public.profiles;
create policy "profiles_select_self_or_staff"
on public.profiles
for select
using (id = auth.uid() or public.is_specialist_or_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
using (id = auth.uid() or public.current_role() = 'admin')
with check (id = auth.uid() or public.current_role() = 'admin');

-- Point types are readable by everyone (including anonymous map viewers)
drop policy if exists "point_types_public_read" on public.point_types;
create policy "point_types_public_read"
on public.point_types
for select
using (true);

-- Points
drop policy if exists "points_public_read" on public.points;
create policy "points_public_read"
on public.points
for select
using (true);

drop policy if exists "points_staff_write" on public.points;
create policy "points_staff_write"
on public.points
for insert
with check (public.is_specialist_or_admin() and created_by = auth.uid());

drop policy if exists "points_staff_update" on public.points;
create policy "points_staff_update"
on public.points
for update
using (public.is_specialist_or_admin())
with check (public.is_specialist_or_admin());

-- Routes
drop policy if exists "routes_public_read_published" on public.routes;
create policy "routes_public_read_published"
on public.routes
for select
using (status = 'published' or public.is_specialist_or_admin());

drop policy if exists "routes_staff_insert" on public.routes;
create policy "routes_staff_insert"
on public.routes
for insert
with check (public.is_specialist_or_admin() and created_by = auth.uid());

drop policy if exists "routes_staff_update" on public.routes;
create policy "routes_staff_update"
on public.routes
for update
using (public.is_specialist_or_admin())
with check (public.is_specialist_or_admin());

-- Route points
drop policy if exists "route_points_read_if_route_visible" on public.route_points;
create policy "route_points_read_if_route_visible"
on public.route_points
for select
using (
  exists (
    select 1
    from public.routes r
    where r.id = route_points.route_id
      and (r.status = 'published' or public.is_specialist_or_admin())
  )
);

drop policy if exists "route_points_staff_write" on public.route_points;
create policy "route_points_staff_write"
on public.route_points
for all
using (public.is_specialist_or_admin())
with check (public.is_specialist_or_admin());

insert into public.point_types (code, label_uk, label_en, color)
values
  ('school', 'Школа', 'School', '#1D4ED8'),
  ('housing', 'Житло', 'Housing', '#2B6CB0'),
  ('cafe', 'Кафе', 'Cafe', '#A16207'),
  ('restaurant', 'Ресторан', 'Restaurant', '#9A3412'),
  ('administration', 'Адміністрація', 'Administration', '#13315C'),
  ('social_services', 'Соціальні послуги', 'Social Services', '#1E3A8A'),
  ('shelter', 'Укриття', 'Shelter', '#334155'),
  ('medical', 'Мед заклад', 'Medical', '#BE123C'),
  ('fuel_station', 'АЗС', 'Fuel Station', '#0B2545'),
  ('pharmacy', 'Аптека', 'Pharmacy', '#B12B2B'),
  ('bank', 'Банк', 'Bank', '#C5A059'),
  ('station', 'Вокзал', 'Station', '#2C7A7B'),
  ('transport_stop', 'Транспортна зупинка', 'Transport Stop', '#7C2D12'),
  ('post', 'Пошта', 'Post', '#0E7490'),
  ('street', 'Вулиці', 'Street', '#3D5263'),
  ('square', 'Площі', 'Square', '#3D5263'),
  ('park', 'Парк', 'Park', '#15803D'),
  ('playground', 'Дитячий майданчик', 'Playground', '#0369A1'),
  ('hotel', 'Готель', 'Hotel', '#2B6CB0'),
  ('other', 'Інше', 'Other', '#64748B'),
  ('education', 'Освіта', 'Education', '#1D4ED8'),
  ('sport', 'Спорт', 'Sport', '#166534'),
  ('culture', 'Культура', 'Culture', '#6D28D9'),
  ('hairdresser', 'Перукарня', 'Hairdresser', '#7E22CE'),
  ('stop_a', 'Зупинка А (legacy)', 'Stop A (legacy)', '#7C2D12'),
  ('stop_p', 'Зупинка П (legacy)', 'Stop P (legacy)', '#7C2D12'),
  ('stop_t', 'Зупинка Т (legacy)', 'Stop T (legacy)', '#7C2D12')
on conflict (code) do nothing;

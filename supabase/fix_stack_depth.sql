-- Fix RLS recursion causing: stack depth limit exceeded

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

-- Critical: profiles policies must not call current_role()/is_specialist_or_admin(),
-- otherwise selecting profiles can recurse back into itself.
drop policy if exists "profiles_select_self_or_staff" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;

create policy "profiles_select_self"
on public.profiles
for select
using (id = auth.uid());

create policy "profiles_update_self"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

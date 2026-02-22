-- Add point photo support + news feed + storage policies

alter table public.points add column if not exists photo_url text;

create table if not exists public.news (
  id bigserial primary key,
  title text not null,
  summary text not null,
  link text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.news enable row level security;

drop policy if exists "news_public_read" on public.news;
create policy "news_public_read"
on public.news
for select
using (true);

drop policy if exists "news_staff_write" on public.news;
create policy "news_staff_write"
on public.news
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

with author as (
  select id from public.profiles where role in ('admin','specialist') order by created_at limit 1
)
insert into public.news (title, summary, link, created_by)
select
  'Завершено аудит Приморського району',
  'Перевірено 45 об''єктів соціальної інфраструктури. З них 12 отримали статус сертифікованих.',
  'https://oda.od.gov.ua/',
  (select id from author)
where exists (select 1 from author)
  and not exists (select 1 from public.news where title = 'Завершено аудит Приморського району');

with author as (
  select id from public.profiles where role in ('admin','specialist') order by created_at limit 1
)
insert into public.news (title, summary, link, created_by)
select
  'Оновлення стандартів пандусів',
  'Згідно з ДБН В.2.2-40:2018, максимальний ухил зовнішніх пандусів не може перевищувати 8%.',
  'https://www.minregion.gov.ua/',
  (select id from author)
where exists (select 1 from author)
  and not exists (select 1 from public.news where title = 'Оновлення стандартів пандусів');

insert into storage.buckets (id, name, public)
values ('point-photos', 'point-photos', true)
on conflict (id) do nothing;

drop policy if exists "point_photos_public_read" on storage.objects;
create policy "point_photos_public_read"
on storage.objects
for select
using (bucket_id = 'point-photos');

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

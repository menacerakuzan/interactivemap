-- Point type catalog v2 (UI + legend + existing point remap)
-- Run once in Supabase SQL Editor for existing projects.

alter table public.point_types enable row level security;

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
  ('pharmacy', 'Аптека', 'Pharmacy', '#B12B2B'),
  ('education', 'Освіта', 'Education', '#1D4ED8'),
  ('sport', 'Спорт', 'Sport', '#166534'),
  ('culture', 'Культура', 'Culture', '#6D28D9'),
  ('hairdresser', 'Перукарня', 'Hairdresser', '#7E22CE'),
  ('station', 'Вокзал', 'Station', '#2C7A7B'),
  ('transport_stop', 'Транспортна зупинка', 'Transport Stop', '#7C2D12'),
  ('bank', 'Банк', 'Bank', '#C5A059'),
  ('post', 'Пошта', 'Post', '#0E7490'),
  ('fuel_station', 'АЗС', 'Fuel Station', '#0B2545'),
  ('street', 'Вулиці', 'Street', '#3D5263'),
  ('square', 'Площі', 'Square', '#3D5263'),
  ('park', 'Парк', 'Park', '#15803D'),
  ('playground', 'Дитячий майданчик', 'Playground', '#0369A1'),
  ('hotel', 'Готель', 'Hotel', '#2B6CB0'),
  ('other', 'Інше', 'Other', '#64748B')
on conflict (code) do update
set
  label_uk = excluded.label_uk,
  label_en = excluded.label_en,
  color = excluded.color;

-- Rebind legacy point types to canonical codes.
with map(legacy_code, new_code) as (
  values
    ('ramp', 'social_services'),
    ('elevator', 'social_services'),
    ('toilet', 'medical'),
    ('parking', 'fuel_station'),
    ('entrance', 'administration'),
    ('crossing', 'street'),
    ('stop_a', 'transport_stop'),
    ('stop_p', 'transport_stop'),
    ('stop_t', 'transport_stop')
),
legacy as (
  select pt.id as legacy_id, m.new_code
  from public.point_types pt
  join map m on m.legacy_code = pt.code
),
target as (
  select code, id from public.point_types
)
update public.points p
set point_type_id = t.id
from legacy l
join target t on t.code = l.new_code
where p.point_type_id = l.legacy_id;

-- Heuristic correction by point title.
update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'transport_stop'
  and p.title ilike any (array['%зупинк%', '%трамва%', '%тролейб%', '%автобус%', '%маршрутк%']);

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'station'
  and p.title ilike any (array['%вокзал%', '%станц%', '%автостанц%', '%аеропорт%', '%порт%']);

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'pharmacy'
  and p.title ilike '%аптек%';

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'medical'
  and p.title ilike any (array['%лікар%', '%мед заклад%', '%мед центр%', '%медпункт%', '%поліклін%', '%амбулатор%', '%клінік%']);

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'park'
  and p.title ilike any (array['%парк%', '%сквер%', '%лавк%', '%відпочин%']);

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'square'
  and p.title ilike '%площ%';

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'street'
  and p.title ilike any (array['%вул.%', '%бульвар%', '%просп%', '%провул%']);

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'hotel'
  and p.title ilike any (array['%готел%', '%hotel%', '%хостел%']);

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'culture'
  and p.title ilike any (array['%театр%', '%музей%', '%опера%', '%культур%']);

update public.points p
set point_type_id = pt.id
from public.point_types pt
where pt.code = 'shelter'
  and p.title ilike any (array['%укрит%', '%бомбосхов%', '%сховище%']);

-- Clean up legacy codes from catalog.
delete from public.point_types
where code in ('ramp', 'elevator', 'toilet', 'parking', 'entrance', 'crossing', 'stop_a', 'stop_p', 'stop_t');

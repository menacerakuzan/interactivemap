insert into public.point_types (code, label_uk, label_en, color)
values
  ('trade_objects', 'Об''єкти торгівлі', 'Trade objects', '#8B5E34'),
  ('cnap', 'ЦНАП', 'CNAP', '#1E5AA8')
on conflict (code) do update
set
  label_uk = excluded.label_uk,
  label_en = excluded.label_en,
  color = excluded.color;

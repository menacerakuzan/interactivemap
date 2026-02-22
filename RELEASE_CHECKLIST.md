# Release Checklist

## 1) Environment
- Ensure `.env` has valid values:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_DATA_MODE=supabase` (for production)
- Ensure Supabase Auth users exist and matching `public.profiles` rows are created.

## 2) Required SQL migrations (Supabase SQL Editor)
Run in order:
1. `/Users/iladovzenko/Desktop/lux/odesa-map/supabase/schema.sql`
2. `/Users/iladovzenko/Desktop/lux/odesa-map/supabase/fix_stack_depth.sql`
3. `/Users/iladovzenko/Desktop/lux/odesa-map/supabase/fix_policies_no_recursion.sql`
4. `/Users/iladovzenko/Desktop/lux/odesa-map/supabase/add_news_and_photos.sql`
5. `/Users/iladovzenko/Desktop/lux/odesa-map/supabase/add_news_image.sql` (legacy projects)
6. `/Users/iladovzenko/Desktop/lux/odesa-map/supabase/one_shot_permissions_fix.sql`
7. `/Users/iladovzenko/Desktop/lux/odesa-map/supabase/add_point_sections.sql`

## 3) Build and static checks
- `npm run build`
- `node --check /Users/iladovzenko/Desktop/lux/odesa-map/server/index.js`

## 4) Local backend smoke test (automatic)
- `npm run smoke:local`

Expected result:
- `SMOKE RESULT: PASS`

What it verifies:
- health check
- specialist login
- points create/update/delete
- routes create/update/delete
- news create/update/delete
- point sections payload path in backend

## 5) Supabase smoke test (automatic)
- `npm run smoke:supabase`

Required env for this step:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SMOKE_SUPABASE_EMAIL` (specialist/admin account)
- `SMOKE_SUPABASE_PASSWORD`

What it verifies:
- Supabase auth login
- points CRUD
- point_sections write path
- routes CRUD (+ route_points)
- news CRUD
- storage upload/delete in `point-photos`

## 6) Manual UI sanity (5-10 min)
- Login in specialist panel.
- Add point with:
  - main photo
  - 1+ detail section with photo
- Edit same point and confirm changes are visible in map context card.
- Create route from points, save and delete it.
- Create news, edit and delete it.
- Verify news image works:
  - custom image URL
  - empty image URL with source link (auto-try from `og:image`)
- Verify status bar messages are clear (`Status/Done/Error`) and mode guide text updates.

## 7) Go/No-Go
Release only if:
- Build passes.
- Smoke test passes.
- No blocking errors in browser console during manual sanity run.

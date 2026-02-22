# Supabase Setup

## 1. Create project
Create a Supabase project and copy:
- Project URL
- Anon key

## 2. Apply schema
Open SQL Editor and run:
- `/Users/iladovzenko/Desktop/lux/odesa-map/supabase/schema.sql`

## 3. Create users
Create auth users in Supabase Auth (email/password).
Then insert matching profiles, example:

```sql
insert into public.profiles (id, email, full_name, role)
values
  ('<auth_user_uuid>', 'specialist@odesa-map.local', 'Field Specialist', 'specialist');
```

Repeat for `admin`/`viewer` as needed.

## 4. Configure frontend
Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional:
- `VITE_DATA_MODE=supabase`

## 5. Run
```bash
npm run dev
```

If env vars are missing, app falls back to local API mode.

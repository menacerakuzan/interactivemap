-- Allow public read of published routes and their points

alter table public.routes enable row level security;
alter table public.route_points enable row level security;

-- routes: anyone can read only published
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='routes' AND policyname='routes_public_published_read'
  ) THEN
    CREATE POLICY routes_public_published_read
      ON public.routes
      FOR SELECT
      TO anon, authenticated
      USING (status = 'published');
  END IF;
END
$$;

-- route_points: readable if parent route is published
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='route_points' AND policyname='route_points_public_published_read'
  ) THEN
    CREATE POLICY route_points_public_published_read
      ON public.route_points
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.routes r
          WHERE r.id = route_points.route_id
            AND r.status = 'published'
        )
      );
  END IF;
END
$$;

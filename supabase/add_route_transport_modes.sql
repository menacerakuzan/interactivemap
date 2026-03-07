-- Add transport modes support to routes.
ALTER TABLE public.routes
ADD COLUMN IF NOT EXISTS transport_modes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Basic shape validation: only known transport modes allowed.
ALTER TABLE public.routes
DROP CONSTRAINT IF EXISTS routes_transport_modes_valid;

ALTER TABLE public.routes
ADD CONSTRAINT routes_transport_modes_valid
CHECK (
  jsonb_typeof(transport_modes) = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(transport_modes) AS mode(value)
    WHERE value NOT IN ('bus', 'tram', 'car')
  )
);
